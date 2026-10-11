/**
 * In-memory Room model managing devices, sync state, and audio track
 */
export class Room {
  constructor(code, hostSocketId, hostName = 'Host Phone') {
    this.code = code;
    this.hostSocketId = hostSocketId;
    this.createdAt = Date.now();
    this.devices = new Map();
    this.playlist = [];
    this.skipVotes = new Set();
    this.currentTrack = null;
    this.playbackState = {
      status: 'idle', // 'idle' | 'buffering' | 'scheduled' | 'playing' | 'paused'
      scheduledStartTime: null, // Server timestamp T
      playbackPosition: 0, // In seconds
      updatedAt: Date.now()
    };

    // Add host as first device
    this.addDevice(hostSocketId, hostName, 'host', 'mono');
  }

  addDevice(socketId, name, role = 'guest', channel = 'mono') {
    // Default initial spread across spatial stage
    const count = this.devices.size;
    let initialPos = { x: 0, y: 0.6 }; // Center front
    if (count === 1) initialPos = { x: -0.6, y: 0.5 }; // Left front
    else if (count === 2) initialPos = { x: 0.6, y: 0.5 }; // Right front
    else if (count === 3) initialPos = { x: -0.5, y: -0.5 }; // Surround left
    else if (count === 4) initialPos = { x: 0.5, y: -0.5 }; // Surround right

    this.devices.set(socketId, {
      id: socketId,
      name,
      role,
      channel, // 'mono' | 'left' | 'right' | 'center' | 'ambient'
      position: initialPos,
      dspProfile: 'flat', // 'flat' | 'subwoofer' | 'vocal' | 'bright'
      clockOffset: 0,
      rtt: 0,
      drift: 0,
      buffered: false,
      bufferProgress: 0, // 0 - 100%
      isAudioUnlocked: false,
      isOnline: true,
      disconnectedAt: null,
      joinedAt: Date.now()
    });
  }

  markDeviceOffline(socketId) {
    const dev = this.devices.get(socketId);
    if (dev) {
      dev.isOnline = false;
      dev.disconnectedAt = Date.now();
      return dev;
    }
    return null;
  }

  reconnectDevice(oldSocketId, newSocketId, name) {
    let dev = this.devices.get(oldSocketId);
    let targetKey = oldSocketId;

    if (!dev && name) {
      for (const [key, d] of this.devices.entries()) {
        if (d.name === name) {
          dev = d;
          targetKey = key;
          break;
        }
      }
    }

    if (dev) {
      this.devices.delete(targetKey);
      dev.id = newSocketId;
      dev.isOnline = true;
      dev.disconnectedAt = null;
      this.devices.set(newSocketId, dev);

      if (this.hostSocketId === targetKey) {
        this.hostSocketId = newSocketId;
      }
      return dev;
    }
    return null;
  }

  removeDevice(socketId) {
    this.devices.delete(socketId);
  }


  getDevice(socketId) {
    return this.devices.get(socketId);
  }

  updateDeviceSync(socketId, { clockOffset, rtt, drift }) {
    const dev = this.devices.get(socketId);
    if (dev) {
      if (clockOffset !== undefined) dev.clockOffset = clockOffset;
      if (rtt !== undefined) dev.rtt = rtt;
      if (drift !== undefined) dev.drift = drift;
    }
  }

  updateDeviceChannel(socketId, channel) {
    const dev = this.devices.get(socketId);
    if (dev) dev.channel = channel;
  }

  updateDevicePosition(socketId, position) {
    const dev = this.devices.get(socketId);
    if (dev && position) {
      dev.position = {
        x: Math.max(-1, Math.min(1, position.x)),
        y: Math.max(-1, Math.min(1, position.y))
      };
      // Auto-assign channel based on position relative to center listener
      if (dev.position.x < -0.25) {
        dev.channel = 'left';
      } else if (dev.position.x > 0.25) {
        dev.channel = 'right';
      } else {
        dev.channel = 'center';
      }
    }
  }

  setDeviceBuffered(socketId, buffered) {
    const dev = this.devices.get(socketId);
    if (dev) {
      dev.buffered = buffered;
      if (buffered) dev.bufferProgress = 100;
    }
  }

  updateDeviceBufferProgress(socketId, progress) {
    const dev = this.devices.get(socketId);
    if (dev) {
      dev.bufferProgress = Math.min(100, Math.max(0, Math.round(progress)));
      if (dev.bufferProgress === 100) dev.buffered = true;
    }
  }

  updateDeviceDspProfile(socketId, profile) {
    const dev = this.devices.get(socketId);
    if (dev) {
      dev.dspProfile = profile;
    }
  }

  setDeviceAudioUnlocked(socketId, isUnlocked) {
    const dev = this.devices.get(socketId);
    if (dev) dev.isAudioUnlocked = isUnlocked;
  }

  isAllBuffered() {
    if (this.devices.size === 0) return false;
    const online = Array.from(this.devices.values()).filter(d => d.isOnline !== false);
    if (online.length === 0) return false;
    return online.every(d => Boolean(d.buffered));
  }

  isAllReadyForPlayback() {
    if (this.devices.size === 0) return false;
    if (!this.currentTrack) return false;
    const online = Array.from(this.devices.values()).filter(d => d.isOnline !== false);
    if (online.length === 0) return false;
    // Every active device must have finished buffering and have audio unlocked
    return online.every(d => Boolean(d.buffered) && Boolean(d.isAudioUnlocked));
  }

  // Phase 4: Collaborative Playlist Queue
  addTrackToQueue(trackData, addedByName = 'Anonymous') {
    const trackItem = {
      ...trackData,
      id: trackData.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      addedBy: addedByName,
      addedAt: Date.now()
    };
    this.playlist.push(trackItem);

    // If no track is currently playing or loaded, make this the active track
    if (!this.currentTrack) {
      this.currentTrack = trackItem;
      this.resetBufferStates();
    }
    return trackItem;
  }

  removeTrackFromQueue(trackId) {
    this.playlist = this.playlist.filter(t => t.id !== trackId);
    if (this.currentTrack?.id === trackId) {
      this.advanceQueue();
    }
  }

  advanceQueue() {
    this.skipVotes.clear();
    // If there is another track queued up in the playlist, advance to it
    if (this.playlist.length > 1) {
      if (this.playlist[0].id === this.currentTrack?.id) {
        this.playlist.shift();
      }
      this.currentTrack = this.playlist[0] || this.currentTrack;
      this.resetBufferStates();
      return this.currentTrack;
    }

    // If no subsequent track in queue, preserve current track and rewind to start (never destroy currentTrack)
    if (this.currentTrack) {
      this.playbackState.status = 'paused';
      this.playbackState.scheduledStartTime = null;
      this.playbackState.playbackPosition = 0;
    }
    return this.currentTrack;
  }

  resetBufferStates() {
    for (const dev of this.devices.values()) {
      dev.buffered = false;
      dev.bufferProgress = 0;
    }
    this.playbackState.status = 'buffering';
    this.playbackState.playbackPosition = 0;
    this.playbackState.scheduledStartTime = null;
  }

  // Phase 4: Democratic Vote to Skip
  voteSkip(socketId) {
    this.skipVotes.add(socketId);
    const voteCount = this.skipVotes.size;
    const requiredVotes = Math.max(1, Math.ceil(this.devices.size / 2));
    const shouldSkip = voteCount >= requiredVotes;

    if (shouldSkip) {
      this.advanceQueue();
    }

    return {
      voteCount,
      requiredVotes,
      shouldSkip
    };
  }

  // Phase 4: Host Migration
  migrateHost() {
    // Pick the oldest online connected device
    const remaining = Array.from(this.devices.values());
    const onlineDevices = remaining.filter(d => d.isOnline !== false);
    const candidate = onlineDevices.length > 0 ? onlineDevices[0] : (remaining[0] || null);
    if (!candidate) return null;

    candidate.role = 'host';
    this.hostSocketId = candidate.id;
    return candidate;
  }


  toJSON() {
    const requiredVotes = Math.max(1, Math.ceil(this.devices.size / 2));
    return {
      code: this.code,
      hostSocketId: this.hostSocketId,
      currentTrack: this.currentTrack,
      playlist: this.playlist,
      skipVotesCount: this.skipVotes.size,
      requiredSkipVotes: requiredVotes,
      playbackState: this.playbackState,
      devices: Array.from(this.devices.values()),
      deviceCount: this.devices.size,
      isAllBuffered: this.isAllBuffered(),
      isAllReady: this.isAllReadyForPlayback()
    };
  }
}
