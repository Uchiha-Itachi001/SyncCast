/**
 * High-Precision NTP-style Clock Synchronization Service
 * Handles sub-millisecond server timestamp generation (performance.timeOrigin + performance.now)
 * and true 4-timestamp Cristian/NTP outlier filtering with server processing delay subtraction.
 */
export class ClockSyncService {
  /**
   * Generates high-precision timestamps for incoming NTP ping
   * @param {number} clientT0 Timestamp client sent request
   */
  processPing(clientT0) {
    const t1 = typeof performance !== 'undefined' && performance.timeOrigin
      ? performance.timeOrigin + performance.now()
      : Date.now();
    const t2 = typeof performance !== 'undefined' && performance.timeOrigin
      ? performance.timeOrigin + performance.now()
      : Date.now();

    return {
      t0: clientT0,
      t1,
      t2
    };
  }

  /**
   * Computes robust clock offset and RTT by filtering network jitter and spikes
   * @param {Array<{t0: number, t1: number, t2: number, t3: number}>} samples 
   * t0 = client transmit, t1 = server receive, t2 = server transmit, t3 = client receive
   */
  filterAndComputeOffset(samples) {
    if (!samples || samples.length === 0) {
      return { offset: 0, rtt: 0 };
    }

    // Compute RTT and raw offset for each sample subtracting server processing delay (t2 - t1)
    const parsed = samples.map(s => {
      const serverProc = Math.max(0, (s.t2 || s.t1) - s.t1);
      const rtt = Math.max(0.1, (s.t3 - s.t0) - serverProc);
      const offset = ((s.t1 - s.t0) + ((s.t2 || s.t1) - s.t3)) / 2;
      return { rtt, offset };
    });

    // If only 1-2 samples, return mean
    if (parsed.length <= 2) {
      const avgOffset = parsed.reduce((sum, p) => sum + p.offset, 0) / parsed.length;
      const avgRtt = parsed.reduce((sum, p) => sum + p.rtt, 0) / parsed.length;
      return { offset: Math.round(avgOffset * 10) / 10, rtt: Math.round(avgRtt * 10) / 10 };
    }

    // Sort by RTT ascending (lowest latency samples have least asymmetric delay error)
    parsed.sort((a, b) => a.rtt - b.rtt);

    // Keep best 30-40% of samples (discard WiFi jitter spikes and queuing delays)
    const keepCount = Math.max(2, Math.floor(parsed.length * 0.4));
    const bestSamples = parsed.slice(0, keepCount);

    const avgOffset = bestSamples.reduce((sum, p) => sum + p.offset, 0) / bestSamples.length;
    const avgRtt = bestSamples.reduce((sum, p) => sum + p.rtt, 0) / bestSamples.length;

    return {
      offset: Math.round(avgOffset * 10) / 10,
      rtt: Math.round(avgRtt * 10) / 10
    };
  }
}

export const clockSyncService = new ClockSyncService();
