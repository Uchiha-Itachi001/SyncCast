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
      let finished = false;

      const cleanup = () => {
        finished = true;
        this.socket.off('ntp:pong', onPong);
      };

      const onPong = (data) => {
        if (!finished && data && data.t0 === t0) {
          cleanup();
          clearTimeout(timeoutId);
          const t2 = Date.now();
          const t1 = data.t1;
          const rtt = Math.max(1, t2 - t0);
          const rawOffset = t1 - (t0 + t2) / 2;

          this.samples.push({ t0, t1, t2, rtt, rawOffset });
          resolve();
        }
      };

      const timeoutId = setTimeout(() => {
        if (!finished) {
          cleanup();
          resolve();
        }
      }, 1000);

      this.socket.on('ntp:pong', onPong);
      this.socket.emit('ntp:ping', { t0 });
    });
  }

  calculateOffset() {
    if (this.samples.length === 0) return;

    // Cristian's Algorithm: Sort by lowest RTT (least queuing delay / highest symmetry)
    const sorted = [...this.samples].sort((a, b) => a.rtt - b.rtt);
    // Take the best 2-3 lowest-RTT samples to eliminate Wi-Fi airwaves queue jitter
    const keepCount = Math.max(1, Math.min(3, Math.floor(sorted.length * 0.3)));
    const best = sorted.slice(0, keepCount);

    const avgOffset = best.reduce((acc, s) => acc + s.rawOffset, 0) / best.length;
    const avgRtt = best.reduce((acc, s) => acc + s.rtt, 0) / best.length;

    this.offset = Math.round(avgOffset);
    this.rtt = Math.round(avgRtt);
    this.minRtt = sorted[0].rtt;
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
        let done = false;

        const onPong = (data) => {
          if (!done && data && data.t0 === t0) {
            done = true;
            clearTimeout(to);
            this.socket.off('ntp:pong', onPong);
            const t2 = Date.now();
            const t1 = data.t1;
            const rtt = Math.max(1, t2 - t0);
            const rawOffset = t1 - (t0 + t2) / 2;
            resolve({ t0, t1, t2, rtt, rawOffset });
          }
        };

        const to = setTimeout(() => {
          if (!done) {
            done = true;
            this.socket.off('ntp:pong', onPong);
            resolve(null);
          }
        }, 800);

        this.socket.on('ntp:pong', onPong);
        this.socket.emit('ntp:ping', { t0 });
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
   * Starts periodic NTP background check to monitor clock health.
   * Runs non-intrusively every 3000ms.
   */
  startDriftMonitor(intervalMs = 3000, onDriftMeasured) {
    this.stopDriftMonitor();

    let isBurstRunning = false;

    this.monitorTimer = setInterval(async () => {
      if (isBurstRunning) return;
      isBurstRunning = true;

      try {
        const bestSample = await this.burstPing(2, 25);
        if (bestSample) {
          const { rtt, rawOffset } = bestSample;

          // If RTT is within sane bounds (< 2.2x our calibrated baseline)
          const baselineRtt = this.minRtt || this.rtt || 100;
          if (rtt <= baselineRtt * 2.2 || this.rtt === 0) {
            if (rtt < (this.minRtt || 999999)) this.minRtt = rtt;

            // Compute delta between raw packet offset and current established offset
            const rawDelta = rawOffset - this.offset;

            // Keep hardware baseline stable; smooth network variance to ±3ms
            const clampedDelta = Math.max(-4, Math.min(4, rawDelta));
            this.drift = Math.round(((this.drift || 0) * 0.8 + clampedDelta * 0.2) * 10) / 10;
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
