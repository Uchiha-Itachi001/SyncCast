/**
 * High-Precision Client-Side NTP Clock Synchronizer
 * Aligns client's local performance/Date clock with the Node.js server clock to sub-millisecond precision.
 */

export function getPreciseTime() {
  if (typeof performance !== 'undefined' && performance.timeOrigin && performance.now) {
    return performance.timeOrigin + performance.now();
  }
  return Date.now();
}

export class ClockSynchronizer {
  constructor(socket) {
    this.socket = socket;
    this.offset = 0; // ms: serverTime = clientTime + offset
    this.rtt = 0; // ms
    this.minRtt = 999;
    this.calibrated = false;
    this.samples = [];
    this.pingCount = 10;
    this.drift = 0;
  }

  /**
   * Run initial calibration round of 8-10 high-precision pings
   */
  async calibrate() {
    this.samples = [];

    for (let i = 0; i < this.pingCount; i++) {
      await this.singlePing();
      // Brief pause between pings to avoid packet clustering
      await new Promise((r) => setTimeout(r, 40));
    }

    this.calculateOffset();
    this.calibrated = true;
    return { offset: this.offset, rtt: this.rtt, minRtt: this.minRtt };
  }

  singlePing() {
    return new Promise((resolve) => {
      const t0 = getPreciseTime();
      let finished = false;

      const cleanup = () => {
        finished = true;
        this.socket.off('ntp:pong', onPong);
      };

      const onPong = (data) => {
        if (!finished && data && data.t0 === t0) {
          cleanup();
          clearTimeout(timeoutId);
          const t3 = getPreciseTime();
          const t1 = data.t1;
          const t2 = data.t2 || data.t1;

          // Subtract server execution latency (t2 - t1) from total RTT
          const serverProc = Math.max(0, t2 - t1);
          const rtt = Math.max(0.1, (t3 - t0) - serverProc);
          const rawOffset = ((t1 - t0) + (t2 - t3)) / 2;

          this.samples.push({ t0, t1, t2, t3, rtt, rawOffset });
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
    // Take best 30-40% lowest-RTT samples to eliminate Wi-Fi airwave jitter
    const keepCount = Math.max(2, Math.min(4, Math.floor(sorted.length * 0.4)));
    const best = sorted.slice(0, keepCount);

    const avgOffset = best.reduce((acc, s) => acc + s.rawOffset, 0) / best.length;
    const avgRtt = best.reduce((acc, s) => acc + s.rtt, 0) / best.length;

    this.offset = Math.round(avgOffset * 10) / 10;
    this.rtt = Math.round(avgRtt * 10) / 10;
    this.minRtt = Math.round(sorted[0].rtt * 10) / 10;
  }

  /**
   * Send a quick burst of N pings and return the sample with lowest RTT (Cristian's algorithm)
   */
  async burstPing(count = 3, gapMs = 20) {
    const burstSamples = [];

    for (let i = 0; i < count; i++) {
      const sample = await new Promise((resolve) => {
        const t0 = getPreciseTime();
        let done = false;

        const onPong = (data) => {
          if (!done && data && data.t0 === t0) {
            done = true;
            clearTimeout(to);
            this.socket.off('ntp:pong', onPong);
            const t3 = getPreciseTime();
            const t1 = data.t1;
            const t2 = data.t2 || data.t1;
            const serverProc = Math.max(0, t2 - t1);
            const rtt = Math.max(0.1, (t3 - t0) - serverProc);
            const rawOffset = ((t1 - t0) + (t2 - t3)) / 2;
            resolve({ t0, t1, t2, t3, rtt, rawOffset });
          }
        };

        const to = setTimeout(() => {
          if (!done) {
            done = true;
            this.socket.off('ntp:pong', onPong);
            resolve(null);
          }
        }, 600);

        this.socket.on('ntp:pong', onPong);
        this.socket.emit('ntp:ping', { t0 });
      });

      if (sample) burstSamples.push(sample);
      if (i < count - 1) await new Promise((r) => setTimeout(r, gapMs));
    }

    if (burstSamples.length === 0) return null;
    burstSamples.sort((a, b) => a.rtt - b.rtt);
    return burstSamples[0];
  }

  /**
   * Pre-Roll Ultra-Burst Calibration (Critical for Zero-Delay Start)
   * Fires a 5-ping burst right during the 2.5s pre-roll window before audio starts.
   * Locks the exact current offset immediately before scheduling.
   */
  async preRollSync(count = 5) {
    const burstSamples = [];
    for (let i = 0; i < count; i++) {
      const s = await this.burstPing(1, 10);
      if (s) burstSamples.push(s);
      await new Promise((r) => setTimeout(r, 15));
    }

    if (burstSamples.length > 0) {
      burstSamples.sort((a, b) => a.rtt - b.rtt);
      // Select lowest RTT sample
      const best = burstSamples[0];
      if (best.rtt < this.minRtt) this.minRtt = best.rtt;
      
      // Update offset towards best fresh packet
      this.offset = Math.round((this.offset * 0.7 + best.rawOffset * 0.3) * 10) / 10;
      this.rtt = Math.round(best.rtt * 10) / 10;
    }

    return { offset: this.offset, rtt: this.rtt, minRtt: this.minRtt };
  }

  /**
   * Starts periodic NTP background check to maintain clock alignment continuously.
   * Runs non-intrusively every 2000ms.
   */
  startDriftMonitor(intervalMs = 2000, onDriftMeasured) {
    this.stopDriftMonitor();

    let isBurstRunning = false;

    this.monitorTimer = setInterval(async () => {
      if (isBurstRunning) return;
      isBurstRunning = true;

      try {
        const bestSample = await this.burstPing(2, 20);
        if (bestSample) {
          const { rtt, rawOffset } = bestSample;
          const baselineRtt = this.minRtt || this.rtt || 10;

          // If RTT is within sane bounds (< 2.0x baseline)
          if (rtt <= baselineRtt * 2.0 || this.rtt === 0) {
            if (rtt < (this.minRtt || 999999)) this.minRtt = rtt;

            // Continuously adapt offset via Exponential Moving Average (EMA) to prevent clock drift
            this.offset = Math.round((this.offset * 0.88 + rawOffset * 0.12) * 10) / 10;
            this.rtt = Math.round((this.rtt * 0.85 + rtt * 0.15) * 10) / 10;
            this.drift = Math.round((rawOffset - this.offset) * 10) / 10;

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

  getDrift() {
    return this.drift || 0;
  }

  /**
   * Converts local client timestamp to estimated Server Time
   */
  toServerTime(localTime = getPreciseTime()) {
    return localTime + this.offset;
  }

  /**
   * Converts a Server Time timestamp T to client local time
   */
  toLocalTime(serverTime) {
    return serverTime - this.offset;
  }
}
