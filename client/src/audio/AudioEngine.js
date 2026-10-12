import { ChannelRouter } from './ChannelRouter.js';
import { ParametricEqualizer } from './ParametricEqualizer.js';
import { getPreciseTime } from './ClockSynchronizer.js';

/**
 * Web Audio API Sample-Accurate Playback Engine
 * Features:
 * - Sub-millisecond hardware AudioContext clock scheduling
 * - Automatic hardware outputLatency + baseLatency compensation
 * - Manual device hardware latency calibration trim (±ms)
 * - Hardware DAC sleep prevention keep-alive transducer
 * - Active Phase-Locked Loop (PLL) micro-pitch drift compensation
 * - 3-Band Parametric Equalizer chain
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.audioBuffer = null;
    this.sourceNode = null;
    this.channelRouter = null;
    this.equalizer = null;
    this.keepAliveNode = null;
    this.isPlaying = false;
    this.currentTrackUrl = null;
    this.isUnlocked = false;
    this.currentPlaybackRate = 1.0;
    this.scheduledContextTime = null;
    this.startOffset = 0;
    this.userHardwareTrimMs = 0;

    // Recall saved hardware calibration trim if previously configured
    try {
      const saved = localStorage.getItem('synccast_hardware_trim_ms');
      if (saved) {
        this.userHardwareTrimMs = parseFloat(saved) || 0;
      }
    } catch (_) {}
  }

  /**
   * Initializes or resumes AudioContext and attaches silent DAC keep-alive (iOS WebKit / Android)
   */
  async initAudioContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass({
        latencyHint: 'interactive'
      });
      this.channelRouter = new ChannelRouter(this.ctx);
      this.equalizer = new ParametricEqualizer(this.ctx);
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (_) {}
    }

    // Keep mobile DAC hardware warm and awake with a permanent silent oscillator (0 gain)
    if (!this.keepAliveNode && this.ctx.state === 'running') {
      try {
        const osc = this.ctx.createOscillator();
        const silentGain = this.ctx.createGain();
        silentGain.gain.setValueAtTime(0, this.ctx.currentTime);
        osc.connect(silentGain);
        silentGain.connect(this.ctx.destination);
        osc.start();
        this.keepAliveNode = osc;
      } catch (_) {}
    }

    this.isUnlocked = this.ctx.state === 'running';
    return this.isUnlocked;
  }

  /**
   * Sets user manual hardware offset trim in milliseconds (persisted in localStorage)
   */
  setHardwareTrim(trimMs) {
    this.userHardwareTrimMs = Math.max(-150, Math.min(150, Math.round(Number(trimMs) || 0)));
    try {
      localStorage.setItem('synccast_hardware_trim_ms', String(this.userHardwareTrimMs));
    } catch (_) {}
    return this.userHardwareTrimMs;
  }

  getHardwareTrim() {
    return this.userHardwareTrimMs || 0;
  }

  /**
   * Returns estimated physical DAC and buffer latency in milliseconds
   */
  getHardwareLatencyMs() {
    if (!this.ctx) return 0;
    const base = (this.ctx.baseLatency || 0) * 1000;
    const output = (this.ctx.outputLatency || 0) * 1000;
    return Math.round(base + output + this.userHardwareTrimMs);
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

    // Decode audio data safely
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
   * Schedules audio to start exactly at server timestamp T with hardware latency compensation
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
    // 2. Compute delta until start in seconds using sub-millisecond precise time
    let delaySeconds = (clientWallclockTarget - getPreciseTime()) / 1000;

    // Safety guard against runaway network skew, but never clamp legitimate 2.5s scheduled start
    if (delaySeconds > 10.0) {
      delaySeconds = 10.0;
    }

    // 3. Hardware Latency Compensation:
    // Deduct physical DAC output latency, base latency, and user calibration trim
    // so sound waves physically hit the room simultaneously across all devices
    const hardwareLatencySeconds = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0) + (this.userHardwareTrimMs / 1000);

    let startOffset = position;
    let scheduledContextTime = this.ctx.currentTime + delaySeconds - hardwareLatencySeconds;

    if (scheduledContextTime <= this.ctx.currentTime + 0.02) {
      // Start time passed or is too close (<20ms queue headroom); advance into audio track
      const elapsedPassed = Math.max(0, (this.ctx.currentTime + 0.02) - scheduledContextTime);
      startOffset = Math.min(Math.max(0, (this.audioBuffer.duration || 100) - 0.2), position + elapsedPassed);
      scheduledContextTime = this.ctx.currentTime + 0.02; // Small 20ms safety cushion to prevent buffer underrun clicks
      console.warn(`[SyncCast] Scheduled start was in the past; adjusted startOffset=${startOffset.toFixed(3)}s`);
    }

    // Never exceed audio buffer duration
    if (this.audioBuffer.duration && startOffset >= this.audioBuffer.duration) {
      startOffset = Math.max(0, this.audioBuffer.duration - 0.5);
    }

    console.log(`[SyncCast AudioEngine] Scheduling playback: delay=${delaySeconds.toFixed(3)}s, hwLatency=${(hardwareLatencySeconds * 1000).toFixed(1)}ms, contextTime=${scheduledContextTime.toFixed(3)}, offset=${startOffset.toFixed(2)}s, channel=${channelMode}`);

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
    this.currentChannelMode = channelMode;
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
   * Phase-Locked Loop (PLL) Audio Playhead Drift Compensator
   * Computes true acoustic difference between this speaker and master room clock,
   * dynamically micro-tuning playback rate (±0.1% - 0.3%) so delay is imperceptible (<1.8ms).
   */
  compensateDrift(driftMs, expectedPosition) {
    if (!this.sourceNode || !this.isPlaying || !this.ctx) return { rate: 1.0, status: 'idle' };

    const now = this.ctx.currentTime;
    let targetRate = 1.0;
    let status = 'locked';

    const absDrift = Math.abs(driftMs);

    if (absDrift <= 1.8) {
      // Sub-2ms deadband: Acoustically indistinguishable to human ear in a shared room (<60cm acoustic travel)
      targetRate = 1.0;
      status = 'locked';
    } else if (absDrift <= 12.0) {
      // Micro-nudge: ±0.10% speed change (completely transparent to human hearing, imperceptible pitch change)
      // Recovers ~1ms drift every 1.0 second of playback
      targetRate = driftMs > 0 ? 0.9990 : 1.0010;
      status = 'micro-sync';
    } else if (absDrift <= 45.0) {
      // Phase-locking: ±0.30% speed change for moderate network or crystal clock divergence
      targetRate = driftMs > 0 ? 0.9970 : 1.0030;
      status = 'phase-locking';
    } else {
      // Catastrophic de-sync (>45ms, e.g. mobile tab backgrounding or CPU sleep)
      // Instant seamless re-alignment to target position
      if (typeof expectedPosition === 'number' && expectedPosition > 0) {
        this.seekResync(expectedPosition + 0.03);
      }
      targetRate = 1.0;
      status = 'resynced';
    }

    if (this.currentPlaybackRate !== targetRate) {
      // Smooth linear ramp over 0.6s to eliminate any sudden transient click or flutter
      this.sourceNode.playbackRate.linearRampToValueAtTime(targetRate, now + 0.6);
      this.currentPlaybackRate = targetRate;
    }

    return {
      rate: this.currentPlaybackRate,
      status,
      driftMs
    };
  }

  /**
   * Seamless hard re-alignment when drift exceeds 45ms (e.g., wake from sleep)
   */
  seekResync(targetPosition) {
    if (!this.audioBuffer || !this.isPlaying || !this.ctx) return;
    try {
      this.stop();
      const pos = Math.min(Math.max(0, targetPosition), (this.audioBuffer.duration || 100) - 0.2);
      this.sourceNode = this.ctx.createBufferSource();
      this.sourceNode.buffer = this.audioBuffer;
      this.currentPlaybackRate = 1.0;
      this.sourceNode.connect(this.equalizer.inputNode);
      this.channelRouter.route(this.equalizer.outputNode, this.currentChannelMode || 'mono');
      this.startOffset = pos;
      this.scheduledContextTime = this.ctx.currentTime;
      this.sourceNode.start(this.ctx.currentTime, pos);
      this.isPlaying = true;
      console.log('[SyncCast AudioEngine] Seamless hard re-sync executed at', pos.toFixed(2), 's');
    } catch (e) {
      console.warn('[SyncCast AudioEngine] Hard re-sync failed:', e);
    }
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
