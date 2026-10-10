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
      await this.ctx.resume();
    }

    this.isUnlocked = this.ctx.state === 'running';
    return this.isUnlocked;
  }

  /**
   * Downloads full audio file over LAN with chunked stream progress tracking (Phase 3.3)
   */
  async loadTrack(url, onProgress) {
    await this.initAudioContext();
    this.currentTrackUrl = url;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download audio file: ${response.statusText}`);
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

      // Combine chunks into single ArrayBuffer
      const combined = new Uint8Array(receivedBytes);
      let position = 0;
      for (const chunk of chunks) {
        combined.set(chunk, position);
        position += chunk.length;
      }
      arrayBuffer = combined.buffer;
    } else {
      arrayBuffer = await response.arrayBuffer();
    }

    if (onProgress) onProgress(100);
    this.audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    return this.audioBuffer;
  }

  /**
   * Schedules audio to start exactly at server timestamp T through EQ and spatial router
   */
  schedulePlayback(scheduledServerTime, serverOffset, position = 0, channelMode = 'mono') {
    if (!this.audioBuffer || !this.ctx) {
      throw new Error('Audio engine not loaded or buffer missing');
    }

    // Stop existing playback if any
    this.stop();

    // 1. Convert server target T to client wallclock
    const clientWallclockTarget = scheduledServerTime - serverOffset;
    // 2. Compute delta until start in seconds
    const delaySeconds = (clientWallclockTarget - Date.now()) / 1000;

    // 3. Convert to AudioContext hardware clock
    const scheduledContextTime = this.ctx.currentTime + Math.max(0, delaySeconds);

    // 4. Create source node and reset playback rate
    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.currentPlaybackRate = 1.0;
    this.sourceNode.playbackRate.setValueAtTime(1.0, this.ctx.currentTime);

    // 5. Connect through DSP Equalizer -> Channel Router
    this.sourceNode.connect(this.equalizer.inputNode);
    this.channelRouter.route(this.equalizer.outputNode, channelMode);

    // 6. Schedule exact start
    this.sourceNode.start(scheduledContextTime, position);
    this.isPlaying = true;

    this.sourceNode.onended = () => {
      this.isPlaying = false;
    };

    return {
      scheduledContextTime,
      delaySeconds
    };
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

  stop() {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch (_) {}
      this.sourceNode = null;
    }
    this.isPlaying = false;
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
