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

    const contentLength = response.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

    let arrayBuffer;
    if (response.body && totalBytes > 0) {
      const reader = response.body.getReader();
      const chunks = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedBytes += value.length;
        if (onProgress) {
          const percent = Math.min(99, Math.round((receivedBytes / totalBytes) * 100));
          onProgress(percent);
        }
      }

      const allChunks = new Uint8Array(receivedBytes);
      let position = 0;
      for (const chunk of chunks) {
        allChunks.set(chunk, position);
        position += chunk.length;
      }
      arrayBuffer = allChunks.buffer;
    } else {
      arrayBuffer = await response.arrayBuffer();
    }

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

    // Safety guard against runaway network skew, but never clamp legitimate 2.5s scheduled start
    if (delaySeconds > 10.0) {
      console.warn(`[SyncCast] Excessive delay ${delaySeconds.toFixed(2)}s clamped to 10s`);
      delaySeconds = 10.0;
    }

    let startOffset = position;
    let scheduledContextTime;

    if (delaySeconds < 0) {
      // Start time passed: advance into audio track by the elapsed delay
      const elapsedPassed = Math.abs(delaySeconds);
      startOffset = Math.min(Math.max(0, (this.audioBuffer.duration || 100) - 0.2), position + elapsedPassed);
      scheduledContextTime = this.ctx.currentTime;
      console.warn(`[SyncCast] Scheduled start was ${elapsedPassed.toFixed(3)}s ago; starting from offset ${startOffset.toFixed(2)}s`);
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

    if (absDrift <= 10) {
      // Deadband: drift within 10ms is imperceptible and within Wi-Fi jitter window; maintain exact 1.0x rate
      targetRate = 1.0;
      status = 'locked';
    } else if (absDrift <= 30) {
      // Ultra-gentle nudge: ±0.05% speed change (completely transparent to human ear)
      targetRate = driftMs > 0 ? 0.9995 : 1.0005;
      status = 'micro-nudging';
    } else if (absDrift <= 60) {
      // Moderate nudge: ±0.15% speed change
      targetRate = driftMs > 0 ? 0.9985 : 1.0015;
      status = 'recovering';
    } else {
      // Catastrophic packet loss / clock jump (>60ms)
      status = 'resync-needed';
    }

    if (this.currentPlaybackRate !== targetRate) {
      this.sourceNode.playbackRate.linearRampToValueAtTime(targetRate, now + 2.0);
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
