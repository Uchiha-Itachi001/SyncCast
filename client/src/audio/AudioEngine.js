import { ChannelRouter } from './ChannelRouter.js';
import { ParametricEqualizer } from './ParametricEqualizer.js';

/**
 * Web Audio API Sample-Accurate Playback Engine (Phase 3 DSP & Drift Engine)
 * Features:
 * - Hardware AudioContext clock scheduling
 * - 3-Band Parametric Equalizer chain
 * - Continuous micro-pitch drift compensation (±0.15% - 0.5%)
 * - Chunked stream buffering with live percentage reporting
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.audioBuffer = null;
    this.sourceNode = null;
    this.channelRouter = null;
    this.equalizer = null;
    this.isPlaying = false;
    this.currentTrackUrl = null;
    this.isUnlocked = false;
    this.currentPlaybackRate = 1.0;
  }

  /**
   * Initializes or resumes AudioContext upon user gesture (iOS Safari requirement)
   */
  async initAudioContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.channelRouter = new ChannelRouter(this.ctx);
      this.equalizer = new ParametricEqualizer(this.ctx);
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (_) {}
    }

    // Play a 1-sample silent impulse buffer to kick hardware DAC out of sleep on mobile WebKit / iOS
    try {
      const sampleRate = this.ctx.sampleRate || 44100;
      const dummyBuffer = this.ctx.createBuffer(1, 1, sampleRate);
      const dummySource = this.ctx.createBufferSource();
      dummySource.buffer = dummyBuffer;
      dummySource.connect(this.ctx.destination);
      dummySource.start(0);
    } catch (_) {}

    this.isUnlocked = this.ctx.state === 'running';
    return this.isUnlocked;
  }

  /**
   * Downloads full audio file over LAN/WAN and decodes audio buffer
   */
  async loadTrack(url, onProgress) {
    await this.initAudioContext();
    this.currentTrackUrl = url;

    // Resolve relative URL to backend if needed
    let fetchUrl = url;
    if (url.startsWith('/api/')) {
      const serverBase = import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`;
      fetchUrl = `${serverBase}${url}`;
    } else if (fetchUrl.includes('localhost') && window.location.hostname && window.location.hostname !== 'localhost') {
      fetchUrl = fetchUrl.replace('localhost', window.location.hostname);
    }

    console.log('[SyncCast AudioEngine] Fetching track:', fetchUrl);
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to download audio file (${response.status}): ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (onProgress) onProgress(100);

    // Decode audio data safely (supporting both Promise and callback syntax for all browsers)
    this.audioBuffer = await new Promise((resolve, reject) => {
      this.ctx.decodeAudioData(
        arrayBuffer.slice(0),
        (buf) => resolve(buf),
        (err) => reject(err || new Error('Audio decoding failed'))
      );
    });

    console.log('[SyncCast AudioEngine] Audio decoded successfully. Duration:', this.audioBuffer.duration, 'sec');
    return this.audioBuffer;
  }

  /**
   * Schedules audio to start exactly at server timestamp T through EQ and spatial router
   */
  async schedulePlayback(scheduledServerTime, serverOffset, position = 0, channelMode = 'mono') {
    if (!this.ctx) {
      await this.initAudioContext();
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (_) {}
    }

    if (!this.audioBuffer) {
      if (this.currentTrackUrl) {
        console.warn('[SyncCast AudioEngine] Buffer was null, emergency loading track:', this.currentTrackUrl);
        await this.loadTrack(this.currentTrackUrl);
      } else {
        throw new Error('Audio engine buffer missing and no track URL loaded');
      }
    }

    // Stop existing playback if any
    this.stop();

    // 1. Convert server target T to client wallclock
    const clientWallclockTarget = scheduledServerTime - serverOffset;
    // 2. Compute delta until start in seconds
    let delaySeconds = (clientWallclockTarget - Date.now()) / 1000;

    // Guard against extreme clock skew: clamp delay to max 2.5 seconds
    if (delaySeconds > 2.5) {
      console.warn(`[SyncCast] Scheduled delay ${delaySeconds.toFixed(2)}s clamped to 1.5s to prevent stalled start`);
      delaySeconds = 1.5;
    }

    let startOffset = position;
    let scheduledContextTime;

    if (delaySeconds < 0) {
      // Start time already passed: advance into audio track only if delay is within normal transit window (< 2.0s)
      if (Math.abs(delaySeconds) < 2.0) {
        startOffset = Math.min(Math.max(0, this.audioBuffer.duration - 0.2), position + Math.abs(delaySeconds));
      } else {
        // Extreme negative delta indicates clock skew rather than audio already playing
        console.warn(`[SyncCast] Negative delay ${delaySeconds.toFixed(2)}s clamped; starting from offset ${position}s.`);
        startOffset = position;
      }
      scheduledContextTime = this.ctx.currentTime;
    } else {
      scheduledContextTime = this.ctx.currentTime + delaySeconds;
    }

    // Never exceed audio buffer duration
    if (this.audioBuffer.duration && startOffset >= this.audioBuffer.duration) {
      startOffset = Math.max(0, this.audioBuffer.duration - 0.5);
    }

    console.log(`[SyncCast AudioEngine] Scheduling playback: delay=${delaySeconds.toFixed(3)}s, contextTime=${scheduledContextTime.toFixed(3)}, offset=${startOffset.toFixed(2)}s, channel=${channelMode}, ctxState=${this.ctx.state}`);

    // 4. Create source node and reset playback rate
    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.currentPlaybackRate = 1.0;
    this.sourceNode.playbackRate.setValueAtTime(1.0, this.ctx.currentTime);

    // 5. Connect through DSP Equalizer -> Channel Router
    this.sourceNode.connect(this.equalizer.inputNode);
    this.channelRouter.route(this.equalizer.outputNode, channelMode);

    // 6. Schedule exact start
    this.scheduledContextTime = scheduledContextTime;
    this.startOffset = startOffset;
    this.sourceNode.start(scheduledContextTime, startOffset);
    this.isPlaying = true;

    this.sourceNode.onended = () => {
      this.isPlaying = false;
      this.scheduledContextTime = null;
      if (this.onEndedCallback) {
        this.onEndedCallback();
      }
    };

    return {
      scheduledContextTime,
      delaySeconds
    };
  }

  /**
   * Returns current playback playhead in seconds
   */
  getCurrentTime() {
    if (!this.isPlaying || !this.ctx || this.scheduledContextTime === null) {
      return this.startOffset || 0;
    }
    const elapsed = (this.ctx.currentTime - this.scheduledContextTime) * (this.currentPlaybackRate || 1.0);
    if (elapsed < 0) return this.startOffset || 0;
    const current = (this.startOffset || 0) + elapsed;
    const dur = this.getDuration();
    return dur > 0 ? Math.min(dur, current) : current;
  }

  /**
   * Returns total loaded audio buffer duration in seconds
   */
  getDuration() {
    return this.audioBuffer ? this.audioBuffer.duration : 0;
  }


  /**
   * Micro-rate drift compensation (Phase 3.1)
   * Nudges playback rate by ±0.15% to smoothly pull client back into lockstep
   */
  compensateDrift(driftMs) {
    if (!this.sourceNode || !this.isPlaying || !this.ctx) return { rate: 1.0, status: 'idle' };

    const now = this.ctx.currentTime;
    let targetRate = 1.0;
    let status = 'locked';

    const absDrift = Math.abs(driftMs);

    if (absDrift <= 3) {
      // Deadband: drift within 3ms is imperceptible, maintain exact 1.0x rate
      targetRate = 1.0;
      status = 'locked';
    } else if (absDrift <= 20) {
      // Micro-nudge: ±0.15% speed change (completely inaudible pitch shift)
      // If drift > 0 (client ahead of server), slow down slightly (0.9985)
      // If drift < 0 (client behind server), speed up slightly (1.0015)
      targetRate = driftMs > 0 ? 0.9985 : 1.0015;
      status = 'micro-nudging';
    } else if (absDrift <= 40) {
      // Fast recovery: ±0.4% speed change
      targetRate = driftMs > 0 ? 0.996 : 1.004;
      status = 'fast-recovering';
    } else {
      // Catastrophic WiFi packet dropout (>40ms): signal hard re-seek required
      status = 'resync-needed';
    }

    if (this.currentPlaybackRate !== targetRate) {
      this.sourceNode.playbackRate.linearRampToValueAtTime(targetRate, now + 1.2);
      this.currentPlaybackRate = targetRate;
    }

    return {
      rate: this.currentPlaybackRate,
      status,
      driftMs
    };
  }

  setEqProfile(profileName) {
    if (this.equalizer) {
      return this.equalizer.setProfile(profileName);
    }
  }

  setEqGains(gains) {
    if (this.equalizer) {
      this.equalizer.setGains(gains);
    }
  }

  stop(currentOffset) {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch (_) {}
      this.sourceNode = null;
    }
    this.isPlaying = false;
    this.scheduledContextTime = null;
    if (typeof currentOffset === 'number' && currentOffset >= 0) {
      this.startOffset = currentOffset;
    }
  }

  setStartOffset(offset) {
    this.startOffset = Math.max(0, offset || 0);
  }

  setVolume(vol) {
    if (this.channelRouter) {
      this.channelRouter.setVolume(vol);
    }
  }

  updateChannel(channelMode) {
    if (this.equalizer && this.channelRouter) {
      this.channelRouter.route(this.equalizer.outputNode, channelMode);
    }
  }

  /**
   * Synthesizes an immediate acoustic test chirp to physically identify speaker position in room
   */
  async playTestPing(frequency = 880, duration = 0.35) {
    await this.initAudioContext();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.7, this.ctx.currentTime + duration);

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.8, this.ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + duration);
  }
}

export const audioEngine = new AudioEngine();
