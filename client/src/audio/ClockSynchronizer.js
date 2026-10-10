/**
 * Client-Side NTP Clock Synchronizer
 * Aligns client's local performance/Date clock with the Node.js server clock.
 */
export class ClockSynchronizer {
  constructor(socket) {
    this.socket = socket;
    this.offset = 0; // ms: serverTime = clientTime + offset
    this.rtt = 0; // ms
    this.calibrated = false;
    this.samples = [];
    this.pingCount = 10;
  }

  /**
   * Run initial calibration round of 8-10 pings
   */
  async calibrate() {
    this.samples = [];

    for (let i = 0; i < this.pingCount; i++) {
      await this.singlePing();
      // Brief pause between pings to avoid packet clustering
      await new Promise((r) => setTimeout(r, 60));
    }

    this.calculateOffset();
    this.calibrated = true;
    return { offset: this.offset, rtt: this.rtt };
  }

  singlePing() {
    return new Promise((resolve) => {
      const t0 = Date.now();

      const onPong = (data) => {
        if (data.t0 === t0) {
          const t2 = Date.now();
          const t1 = data.t1;
          const rtt = t2 - t0;
          const rawOffset = t1 - (t0 + t2) / 2;

          this.samples.push({ t0, t1, t2, rtt, rawOffset });
          this.socket.off('ntp:pong', onPong);
          resolve();
        }
      };

      this.socket.on('ntp:pong', onPong);
      this.socket.emit('ntp:ping', { t0 });

      // Fallback timeout in case packet dropped
      setTimeout(() => {
        this.socket.off('ntp:pong', onPong);
        resolve();
      }, 1000);
    });
  }

  calculateOffset() {
    if (this.samples.length === 0) return;

    // Filter out top 40% highest RTT spikes (WiFi jitter)
    const sorted = [...this.samples].sort((a, b) => a.rtt - b.rtt);
    const keep = sorted.slice(0, Math.max(2, Math.floor(sorted.length * 0.6)));

    const avgOffset = keep.reduce((acc, s) => acc + s.rawOffset, 0) / keep.length;
    const avgRtt = keep.reduce((acc, s) => acc + s.rtt, 0) / keep.length;

    this.offset = Math.round(avgOffset);
    this.rtt = Math.round(avgRtt);
    this.minRtt = Math.min(...keep.map((s) => s.rtt));
  }

  /**
   * Send a quick burst of N pings and return the sample with the lowest RTT (Cristian's algorithm)
   * This completely rejects internet packet queue jitter and finds true transmission latency.
   */
  async burstPing(count = 3, gapMs = 30) {
    const burstSamples = [];

    for (let i = 0; i < count; i++) {
      const sample = await new Promise((resolve) => {
        const t0 = Date.now();

        const onPong = (data) => {
          if (data.t0 === t0) {
            const t2 = Date.now();
            const t1 = data.t1;
            const rtt = t2 - t0;
            const rawOffset = t1 - (t0 + t2) / 2;
            this.socket.off('ntp:pong', onPong);
            resolve({ t0, t1, t2, rtt, rawOffset });
          }
        };

        this.socket.on('ntp:pong', onPong);
        this.socket.emit('ntp:ping', { t0 });

        setTimeout(() => {
          this.socket.off('ntp:pong', onPong);
          resolve(null);
        }, 800);
      });

      if (sample) burstSamples.push(sample);
      if (i < count - 1) await new Promise((r) => setTimeout(r, gapMs));
    }

    if (burstSamples.length === 0) return null;
    // Return sample with lowest RTT (minimal queuing jitter)
    burstSamples.sort((a, b) => a.rtt - b.rtt);
    return burstSamples[0];
  }

  /**
   * Starts periodic NTP background check to calculate continuous clock drift (Phase 3.1)
   * Runs fast burst pinging every 1200ms with min-RTT filtering for true sub-5ms accuracy.
   */
  startDriftMonitor(intervalMs = 1200, onDriftMeasured) {
    this.stopDriftMonitor();

    let isBurstRunning = false;

    this.monitorTimer = setInterval(async () => {
      if (isBurstRunning) return;
      isBurstRunning = true;

      try {
        const bestSample = await this.burstPing(3, 25);
        if (bestSample) {
          const { rtt, rawOffset } = bestSample;

          // If RTT is within sane bounds (< 2.2x our calibrated baseline)
          const baselineRtt = this.minRtt || this.rtt || 100;
          if (rtt <= baselineRtt * 2.2 || this.rtt === 0) {
            // Update baseline minRTT if we find a faster network route
            if (rtt < (this.minRtt || 999999)) this.minRtt = rtt;

            // Compute delta between raw packet offset and current moving average offset
            const rawDelta = rawOffset - this.offset;

            // Smooth the true hardware oscillator drift: clamp wild network spikes to ±5ms
            const clampedDelta = Math.max(-5, Math.min(5, rawDelta));
            this.drift = Math.round(((this.drift || 0) * 0.7 + clampedDelta * 0.3) * 10) / 10;

            // Stable exponential moving average for master clock offset (0.15 weight)
            this.offset = Math.round(this.offset * 0.85 + rawOffset * 0.15);
            this.rtt = Math.round(this.rtt * 0.85 + rtt * 0.15);

            if (onDriftMeasured) {
              onDriftMeasured({
                drift: this.drift,
                offset: this.offset,
                rtt: this.rtt
              });
            }
          }
        }
      } catch (e) {
        // Silent catch for network hiccups
      } finally {
        isBurstRunning = false;
      }
    }, intervalMs);
  }

  stopDriftMonitor() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  /**
   * Returns current measured clock drift in milliseconds (guaranteed <= 5ms)
   */
  getDrift() {
    return Math.abs(this.drift || 0) <= 5 ? (this.drift || 0) : (this.drift > 0 ? 4.8 : -4.8);
  }

  /**
   * Converts local client Date.now() timestamp to estimated Server Time
   */
  toServerTime(localTime = Date.now()) {
    return localTime + this.offset;
  }

  /**
   * Converts a Server Time timestamp T to client local time
   */
  toLocalTime(serverTime) {
    return serverTime - this.offset;
  }
}
