/**
 * NTP-style Clock Synchronization Service
 * Handles microsecond/millisecond server timestamp generation and outlier filtering.
 */
export class ClockSyncService {
  /**
   * Generates timestamp for incoming NTP ping
   * @param {number} clientT0 Timestamp client sent request
   */
  processPing(clientT0) {
    const serverT1 = Date.now();
    return {
      t0: clientT0,
      t1: serverT1
    };
  }

  /**
   * Computes robust clock offset and RTT by filtering network jitter and spikes
   * @param {Array<{t0: number, t1: number, t2: number}>} samples 
   * t0 = client send time, t1 = server receive/response time, t2 = client receipt time
   */
  filterAndComputeOffset(samples) {
    if (!samples || samples.length === 0) {
      return { offset: 0, rtt: 0 };
    }

    // Compute RTT and raw offset for each sample
    const parsed = samples.map(s => {
      const rtt = s.t2 - s.t0;
      const offset = s.t1 - (s.t0 + s.t2) / 2;
      return { rtt, offset };
    });

    // If only 1-2 samples, return mean
    if (parsed.length <= 2) {
      const avgOffset = parsed.reduce((sum, p) => sum + p.offset, 0) / parsed.length;
      const avgRtt = parsed.reduce((sum, p) => sum + p.rtt, 0) / parsed.length;
      return { offset: Math.round(avgOffset), rtt: Math.round(avgRtt) };
    }

    // Sort by RTT ascending (lowest latency samples have least asymmetric delay error)
    parsed.sort((a, b) => a.rtt - b.rtt);

    // Keep best 60% of samples (discard top 40% WiFi jitter spikes)
    const keepCount = Math.max(2, Math.floor(parsed.length * 0.6));
    const bestSamples = parsed.slice(0, keepCount);

    const avgOffset = bestSamples.reduce((sum, p) => sum + p.offset, 0) / bestSamples.length;
    const avgRtt = bestSamples.reduce((sum, p) => sum + p.rtt, 0) / bestSamples.length;

    return {
      offset: Math.round(avgOffset),
      rtt: Math.round(avgRtt)
    };
  }
}

export const clockSyncService = new ClockSyncService();
