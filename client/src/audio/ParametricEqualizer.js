/**
 * 3-Band Parametric Equalizer Node Chain (Phase 3.2)
 * Low Shelf, Peaking Mid, High Shelf filters using Web Audio BiquadFilterNodes.
 */
export class ParametricEqualizer {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.currentProfile = 'flat';

    // 1. Low Shelf Filter (Bass / Subwoofer)
    this.lowShelf = this.ctx.createBiquadFilter();
    this.lowShelf.type = 'lowshelf';
    this.lowShelf.frequency.value = 140; // Hz
    this.lowShelf.gain.value = 0; // dB

    // 2. Peaking Mid Filter (Vocals / Presence)
    this.midPeak = this.ctx.createBiquadFilter();
    this.midPeak.type = 'peaking';
    this.midPeak.frequency.value = 1600; // Hz
    this.midPeak.Q.value = 1.0;
    this.midPeak.gain.value = 0; // dB

    // 3. High Shelf Filter (Air / Treble Sparkle)
    this.highShelf = this.ctx.createBiquadFilter();
    this.highShelf.type = 'highshelf';
    this.highShelf.frequency.value = 7500; // Hz
    this.highShelf.gain.value = 0; // dB

    // Chain nodes: input -> lowShelf -> midPeak -> highShelf -> output
    this.lowShelf.connect(this.midPeak);
    this.midPeak.connect(this.highShelf);

    this.inputNode = this.lowShelf;
    this.outputNode = this.highShelf;

    this.gains = { low: 0, mid: 0, high: 0 };
  }

  /**
   * Smoothly transitions filter gains using linear ramp to avoid audio clicks
   */
  setGains({ low = 0, mid = 0, high = 0 }, rampTime = 0.08) {
    const now = this.ctx.currentTime;
    this.gains = { low, mid, high };

    try {
      this.lowShelf.gain.setValueAtTime(this.lowShelf.gain.value, now);
      this.lowShelf.gain.linearRampToValueAtTime(low, now + rampTime);

      this.midPeak.gain.setValueAtTime(this.midPeak.gain.value, now);
      this.midPeak.gain.linearRampToValueAtTime(mid, now + rampTime);

      this.highShelf.gain.setValueAtTime(this.highShelf.gain.value, now);
      this.highShelf.gain.linearRampToValueAtTime(high, now + rampTime);
    } catch (_) {
      this.lowShelf.gain.value = low;
      this.midPeak.gain.value = mid;
      this.highShelf.gain.value = high;
    }
  }

  /**
   * Applies pre-calibrated acoustic role presets
   */
  setProfile(profileName) {
    this.currentProfile = profileName;

    switch (profileName) {
      case 'subwoofer':
        // Bass Subwoofer Node: boost low-end, roll off harsh highs
        this.setGains({ low: 8.0, mid: -2.5, high: -5.0 });
        break;

      case 'vocal':
        // Vocal / Center Node: boost speech presence, cut sub-bass rumble
        this.setGains({ low: -3.5, mid: 5.5, high: 1.5 });
        break;

      case 'bright':
        // Ambient Sparkle Node: boost air, clean up bass mud
        this.setGains({ low: -2.0, mid: 1.0, high: 6.5 });
        break;

      case 'flat':
      default:
        // Flat Neutral response
        this.setGains({ low: 0, mid: 0, high: 0 });
        break;
    }

    return this.gains;
  }
}
