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
  }

  /**
   * Starts periodic NTP background check to calculate continuous clock drift (Phase 3.1)
   */
  startDriftMonitor(intervalMs = 4000, onDriftMeasured) {
    this.stopDriftMonitor();

    this.monitorTimer = setInterval(async () => {
      const prevOffset = this.offset;
      const t0 = Date.now();

      const onPong = (data) => {
        if (data.t0 === t0) {
          const t2 = Date.now();
          const t1 = data.t1;
          const rtt = t2 - t0;
          // Filter if single packet RTT is an extreme spike (> 2.5x typical RTT)
          if (this.rtt > 0 && rtt > this.rtt * 2.5) {
            this.socket.off('ntp:pong', onPong);
            return;
          }

          const rawOffset = Math.round(t1 - (t0 + t2) / 2);
          // Drift = difference between current instantaneous offset and baseline offset
          const drift = rawOffset - prevOffset;

          // Smoothly update running offset (exponential moving average 0.2 weight)
          this.offset = Math.round(this.offset * 0.8 + rawOffset * 0.2);
          this.rtt = Math.round(this.rtt * 0.8 + rtt * 0.2);

          if (onDriftMeasured) {
            onDriftMeasured({
              drift,
              offset: this.offset,
              rtt: this.rtt
            });
          }

          this.socket.off('ntp:pong', onPong);
        }
      };

      this.socket.on('ntp:pong', onPong);
      this.socket.emit('ntp:ping', { t0 });

      setTimeout(() => {
        this.socket.off('ntp:pong', onPong);
      }, 1200);
    }, intervalMs);
  }

  stopDriftMonitor() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
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
