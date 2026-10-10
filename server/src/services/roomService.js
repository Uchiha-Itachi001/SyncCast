import { Room } from '../models/Room.js';
import { CONFIG } from '../config/constants.js';

export class RoomService {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    /** @type {Map<string, string>} socketId -> roomCode */
    this.socketRoomMap = new Map();
  }

  generateRoomCode() {
    let code;
    do {
      code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostSocketId, hostName) {
    const code = this.generateRoomCode();
    const room = new Room(code, hostSocketId, hostName);
    this.rooms.set(code, room);
    this.socketRoomMap.set(hostSocketId, code);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(code);
  }

  getRoomBySocketId(socketId) {
    const code = this.socketRoomMap.get(socketId);
    return code ? this.rooms.get(code) : null;
  }

  joinRoom(code, socketId, deviceName) {
    const room = this.rooms.get(code);
    if (!room) {
      throw new Error(`Room ${code} not found`);
    }

    if (room.devices.size >= CONFIG.MAX_ROOM_DEVICES) {
      throw new Error(`Room ${code} is full (max ${CONFIG.MAX_ROOM_DEVICES} devices)`);
    }

    room.addDevice(socketId, deviceName, 'guest', 'mono');
    this.socketRoomMap.set(socketId, code);
    return room;
  }

  // Phase 4.2: Graceful Disconnection with 15-second Heartbeat Window
  handleDeviceDisconnect(socketId, onGraceExpired) {
    const code = this.socketRoomMap.get(socketId);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (!room) {
      this.socketRoomMap.delete(socketId);
      return null;
    }

    const device = room.markDeviceOffline(socketId);
    if (!device) return null;

    const graceTimerKey = `${code}:${socketId}`;
    if (!this.graceTimers) this.graceTimers = new Map();

    const timer = setTimeout(() => {
      this.graceTimers.delete(graceTimerKey);
      this.socketRoomMap.delete(socketId);

      // Permanently remove expired device
      room.removeDevice(socketId);

      // Check if room has zero remaining devices
      if (room.devices.size === 0) {
        this.rooms.delete(code);
        if (onGraceExpired) onGraceExpired({ room, destroyed: true, socketId });
        return;
      }

      // If disconnected device was host, migrate to longest-standing online peer
      let migratedHost = null;
      if (room.hostSocketId === socketId) {
        migratedHost = room.migrateHost();
      }

      if (onGraceExpired) {
        onGraceExpired({ room, migratedHost, destroyed: false, socketId });
      }
    }, CONFIG.GRACE_PERIOD_MS || 15000);

    this.graceTimers.set(graceTimerKey, timer);
    return { room, device, inGrace: true };
  }

  reconnectDevice(code, deviceName, newSocketId, oldSocketId) {
    const room = this.rooms.get(code);
    if (!room) return null;

    if (!this.graceTimers) this.graceTimers = new Map();

    // Cancel pending grace timers for this device
    if (oldSocketId) {
      const key = `${code}:${oldSocketId}`;
      if (this.graceTimers.has(key)) {
        clearTimeout(this.graceTimers.get(key));
        this.graceTimers.delete(key);
      }
      this.socketRoomMap.delete(oldSocketId);
    }

    // Also scan any timer for matching device name
    for (const [key, timer] of this.graceTimers.entries()) {
      if (key.startsWith(`${code}:`)) {
        const sid = key.split(':')[1];
        const dev = room.getDevice(sid);
        if (dev && dev.name === deviceName) {
          clearTimeout(timer);
          this.graceTimers.delete(key);
          this.socketRoomMap.delete(sid);
          break;
        }
      }
    }

    const restoredDev = room.reconnectDevice(oldSocketId, newSocketId, deviceName);
    if (!restoredDev) {
      // If not previously offline, add as normal guest
      return { room: this.joinRoom(code, newSocketId, deviceName), device: room.getDevice(newSocketId) };
    }

    this.socketRoomMap.set(newSocketId, code);
    return {
      room,
      device: restoredDev,
      wasHost: room.hostSocketId === newSocketId
    };
  }

  leaveRoom(socketId) {
    const code = this.socketRoomMap.get(socketId);
    if (!code) return null;

    const room = this.rooms.get(code);
    this.socketRoomMap.delete(socketId);

    if (!room) return null;

    room.removeDevice(socketId);

    // If room is empty, dismantle room
    if (room.devices.size === 0) {
      this.rooms.delete(code);
      return { roomCode: code, destroyed: true };
    }

    // Phase 4: Host Migration if disconnected device was the host
    let migratedHost = null;
    if (room.hostSocketId === socketId) {
      migratedHost = room.migrateHost();
    }

    return { roomCode: code, destroyed: false, room, migratedHost };
  }


  setTrack(code, trackData) {
    const room = this.rooms.get(code);
    if (!room) throw new Error(`Room ${code} not found`);

    room.currentTrack = trackData;
    // Reset buffer statuses when a new track is selected
    for (const dev of room.devices.values()) {
      dev.buffered = false;
    }
    room.playbackState.status = 'buffering';
    room.playbackState.playbackPosition = 0;
    room.playbackState.scheduledStartTime = null;
    return room;
  }

  setScheduledPlayback(code, startDelayMs = CONFIG.SCHEDULE_AHEAD_MS) {
    const room = this.rooms.get(code);
    if (!room) throw new Error(`Room ${code} not found`);

    const scheduledTime = Date.now() + startDelayMs;
    room.playbackState.status = 'scheduled';
    room.playbackState.scheduledStartTime = scheduledTime;
    room.playbackState.updatedAt = Date.now();
    return { room, scheduledTime };
  }

  pausePlayback(code, currentPosition) {
    const room = this.rooms.get(code);
    if (!room) throw new Error(`Room ${code} not found`);

    room.playbackState.status = 'paused';
    room.playbackState.scheduledStartTime = null;
    room.playbackState.playbackPosition = currentPosition;
    room.playbackState.updatedAt = Date.now();
    return room;
  }

  seekPlayback(code, positionSeconds, startDelayMs = CONFIG.SCHEDULE_AHEAD_MS) {
    const room = this.rooms.get(code);
    if (!room) throw new Error(`Room ${code} not found`);

    room.playbackState.playbackPosition = Math.max(0, positionSeconds);
    room.playbackState.updatedAt = Date.now();
    let scheduledTime = null;

    if (room.playbackState.status === 'playing' || room.playbackState.status === 'scheduled') {
      scheduledTime = Date.now() + startDelayMs;
      room.playbackState.scheduledStartTime = scheduledTime;
    }
    return { room, scheduledTime, position: room.playbackState.playbackPosition };
  }
}

export const roomService = new RoomService();
