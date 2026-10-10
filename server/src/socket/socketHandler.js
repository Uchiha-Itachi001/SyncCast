import { SOCKET_EVENTS } from './events.js';
import { roomService } from '../services/roomService.js';
import { clockSyncService } from '../services/clockSyncService.js';
import { CONFIG } from '../config/constants.js';
import { sanitizeString } from '../utils/security.js';

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    // 1. NTP Clock Synchronization ping-pong (High priority, fast return)
    socket.on(SOCKET_EVENTS.NTP_PING, (data) => {
      const t0 = typeof data?.t0 === 'number' ? data.t0 : Date.now();
      const response = clockSyncService.processPing(t0);
      socket.emit(SOCKET_EVENTS.NTP_PONG, response);
    });

    // 2. Client reports computed offset & drift after calibration round
    socket.on(SOCKET_EVENTS.SYNC_REPORT, (report) => {
      if (!report || typeof report !== 'object') return;
      const { clockOffset, rtt, drift } = report;
      const room = roomService.getRoomBySocketId(socket.id);
      if (room) {
        room.updateDeviceSync(socket.id, {
          clockOffset: typeof clockOffset === 'number' ? clockOffset : 0,
          rtt: typeof rtt === 'number' ? rtt : 0,
          drift: typeof drift === 'number' ? drift : 0
        });
        // Broadcast sync health update to room
        io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());

        // Check if drift threshold violated
        if (drift && Math.abs(drift) > CONFIG.MAX_DRIFT_MS) {
          socket.emit(SOCKET_EVENTS.SYNC_DRIFT_ALERT, { drift, maxAllowed: CONFIG.MAX_DRIFT_MS });
        }
      }
    });

    // 3. Room creation (Host)
    socket.on(SOCKET_EVENTS.ROOM_CREATE, ({ hostName } = {}) => {
      try {
        const cleanHostName = sanitizeString(hostName, 30, 'Host Phone');
        const room = roomService.createRoom(socket.id, cleanHostName);
        socket.join(room.code);
        socket.emit(SOCKET_EVENTS.ROOM_CREATED, room.toJSON());
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ROOM_ERROR, { message: err.message });
      }
    });

    // 4. Room join (Guest)
    socket.on(SOCKET_EVENTS.ROOM_JOIN, ({ roomCode, deviceName } = {}) => {
      try {
        const cleanCode = String(roomCode || '').trim();
        if (!/^\d{4}$/.test(cleanCode)) {
          return socket.emit(SOCKET_EVENTS.ROOM_ERROR, { message: 'Invalid room code. Must be 4 digits.' });
        }

        const cleanDeviceName = sanitizeString(deviceName, 30, 'Guest Phone');
        const room = roomService.joinRoom(cleanCode, socket.id, cleanDeviceName);
        socket.join(cleanCode);
        socket.emit(SOCKET_EVENTS.ROOM_JOINED, room.toJSON());
        // Notify others
        socket.to(cleanCode).emit(SOCKET_EVENTS.ROOM_USER_JOINED, {
          device: room.getDevice(socket.id),
          room: room.toJSON()
        });
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ROOM_ERROR, { message: err.message });
      }
    });

    // 4b. Explicit Room Exit / Leave
    socket.on(SOCKET_EVENTS.ROOM_LEAVE, () => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room) {
        const roomCode = room.code;
        const result = roomService.leaveRoom(socket.id);
        socket.leave(roomCode);
        if (result) {
          if (result.destroyed) {
            io.to(roomCode).emit(SOCKET_EVENTS.ROOM_ERROR, { message: 'Room closed.' });
          } else if (result.room) {
            if (result.migratedHost) {
              io.to(roomCode).emit(SOCKET_EVENTS.HOST_MIGRATED, {
                newHostSocketId: result.migratedHost.id,
                newHostName: result.migratedHost.name,
                room: result.room.toJSON()
              });
            }
            io.to(roomCode).emit(SOCKET_EVENTS.ROOM_USER_LEFT, {
              socketId: socket.id,
              room: result.room.toJSON()
            });
            io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATE, result.room.toJSON());
          }
        }
      }
    });

    // 5. Track selection (Host)
    socket.on(SOCKET_EVENTS.TRACK_SELECT, (trackData) => {
      if (!trackData || typeof trackData !== 'object') return;
      const room = roomService.getRoomBySocketId(socket.id);
      if (room && room.hostSocketId === socket.id) {
        roomService.setTrack(room.code, trackData);
        io.to(room.code).emit(SOCKET_EVENTS.TRACK_SELECT, {
          track: trackData,
          room: room.toJSON()
        });
      }
    });

    // 6. Device reports buffer completion
    socket.on(SOCKET_EVENTS.TRACK_BUFFER_STATUS, ({ buffered } = {}) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room) {
        room.setDeviceBuffered(socket.id, Boolean(buffered));
        io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());
      }
    });

    // 6b. Device reports live download/decode progress percentage (Phase 3.3)
    socket.on(SOCKET_EVENTS.TRACK_BUFFER_PROGRESS, ({ progress } = {}) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room) {
        const validProgress = typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : 0;
        room.updateDeviceBufferProgress(socket.id, validProgress);
        io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());
      }
    });

    // 6c. Host updates DSP acoustic profile (Phase 3.2 - Host Only Authority)
    socket.on(SOCKET_EVENTS.DSP_PROFILE_CHANGE, ({ targetSocketId, profile } = {}) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room && room.hostSocketId === socket.id) {
        const allowedProfiles = ['flat', 'subwoofer', 'vocal', 'bright'];
        const cleanProfile = allowedProfiles.includes(profile) ? profile : 'flat';
        const idToUpdate = targetSocketId || socket.id;
        room.updateDeviceDspProfile(idToUpdate, cleanProfile);
        io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());
      } else if (room) {
        socket.emit(SOCKET_EVENTS.ROOM_ERROR, {
          message: 'Unauthorized: Only the host has DSP configuration authority.'
        });
      }
    });

    // 7. Audio unlock status (iOS Safari touch interaction)
    socket.on(SOCKET_EVENTS.AUDIO_UNLOCK, ({ isUnlocked } = {}) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room) {
        room.setDeviceAudioUnlocked(socket.id, Boolean(isUnlocked));
        io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());
      }
    });

    // 8. Scheduled playback trigger (Host)
    socket.on(SOCKET_EVENTS.PLAYBACK_SCHEDULE, ({ startDelayMs } = {}) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room && room.hostSocketId === socket.id) {
        const delay = (typeof startDelayMs === 'number' && startDelayMs >= 500 && startDelayMs <= 10000)
          ? startDelayMs
          : CONFIG.SCHEDULE_AHEAD_MS;
        const { scheduledTime } = roomService.setScheduledPlayback(room.code, delay);
        io.to(room.code).emit(SOCKET_EVENTS.PLAYBACK_START, {
          scheduledTime, // Server timestamp T
          playbackPosition: room.playbackState.playbackPosition,
          room: room.toJSON()
        });
      }
    });

    // 9. Playback pause (Host)
    socket.on(SOCKET_EVENTS.PLAYBACK_PAUSE, ({ currentPosition } = {}) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room && room.hostSocketId === socket.id) {
        const pos = typeof currentPosition === 'number' && currentPosition >= 0 ? currentPosition : 0;
        const updated = roomService.pausePlayback(room.code, pos);
        io.to(room.code).emit(SOCKET_EVENTS.PLAYBACK_PAUSE, {
          playbackPosition: updated.playbackState.playbackPosition,
          room: updated.toJSON()
        });
      }
    });

    // 9b. Playback Seek (Host Only)
    socket.on(SOCKET_EVENTS.PLAYBACK_SEEK, ({ position, startDelayMs } = {}) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room && room.hostSocketId === socket.id) {
        const delay = (typeof startDelayMs === 'number' && startDelayMs >= 500 && startDelayMs <= 10000)
          ? startDelayMs
          : CONFIG.SCHEDULE_AHEAD_MS;
        const pos = typeof position === 'number' && position >= 0 ? position : 0;
        const { room: updatedRoom, scheduledTime } = roomService.seekPlayback(room.code, pos, delay);
        if (scheduledTime) {
          io.to(room.code).emit(SOCKET_EVENTS.PLAYBACK_START, {
            scheduledTime,
            playbackPosition: pos,
            room: updatedRoom.toJSON()
          });
        } else {
          io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, updatedRoom.toJSON());
        }
      }
    });

    // 10. Channel assignment (Surround / Spatial mode)
    socket.on(SOCKET_EVENTS.CHANNEL_ASSIGN, ({ targetSocketId, channel } = {}) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room && room.hostSocketId === socket.id) {
        const allowedChannels = ['mono', 'left', 'right', 'center', 'ambient', 'stereo'];
        const cleanChannel = allowedChannels.includes(channel) ? channel : 'mono';
        room.updateDeviceChannel(targetSocketId, cleanChannel);
        io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());
      }
    });

    // 11. Spatial stage position update (2D drag & drop on radar stage)
    socket.on(SOCKET_EVENTS.STAGE_POSITION_UPDATE, ({ targetSocketId, position } = {}) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room && room.hostSocketId === socket.id && position && typeof position.x === 'number' && typeof position.y === 'number') {
        const clampedPos = {
          x: Math.max(-1, Math.min(1, position.x)),
          y: Math.max(-1, Math.min(1, position.y))
        };
        room.updateDevicePosition(targetSocketId, clampedPos);
        io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());
      }
    });

    // 12. Spatial channel test ping (Target device synthesizes an identification tone)
    socket.on(SOCKET_EVENTS.CHANNEL_TEST_PING, ({ targetSocketId } = {}) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room && room.hostSocketId === socket.id) {
        const targetDev = room.getDevice(targetSocketId);
        const freq = targetDev?.channel === 'left' ? 880 : targetDev?.channel === 'right' ? 1200 : 660;
        io.to(targetSocketId).emit(SOCKET_EVENTS.CHANNEL_TEST_PING, {
          channel: targetDev?.channel || 'mono',
          frequency: freq,
          duration: 0.35
        });
      }
    });

    // 13. Collaborative Playlist Queue (Phase 4.1)
    socket.on(SOCKET_EVENTS.QUEUE_TRACK_ADD, ({ trackData } = {}) => {
      if (!trackData || typeof trackData !== 'object') return;
      const room = roomService.getRoomBySocketId(socket.id);
      if (room) {
        const dev = room.getDevice(socket.id);
        const wasEmpty = !room.currentTrack;
        const sanitizedTrack = {
          ...trackData,
          originalName: sanitizeString(trackData.originalName, 100, 'Audio Track'),
          artist: sanitizeString(trackData.artist, 60, 'Unknown Artist')
        };
        const addedTrack = room.addTrackToQueue(sanitizedTrack, dev?.name || 'Guest');
        io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());

        // If newly added track became active track, broadcast track select
        if (wasEmpty && room.currentTrack) {
          io.to(room.code).emit(SOCKET_EVENTS.TRACK_SELECT, {
            track: room.currentTrack,
            room: room.toJSON()
          });
        }
      }
    });

    socket.on(SOCKET_EVENTS.QUEUE_TRACK_REMOVE, ({ trackId } = {}) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room && room.hostSocketId === socket.id) {
        room.removeTrackFromQueue(trackId);
        io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());
      }
    });

    socket.on(SOCKET_EVENTS.QUEUE_NEXT, () => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room && room.hostSocketId === socket.id) {
        const nextTrack = room.advanceQueue();
        if (nextTrack) {
          io.to(room.code).emit(SOCKET_EVENTS.TRACK_SELECT, {
            track: nextTrack,
            room: room.toJSON()
          });
        } else {
          io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());
        }
      }
    });

    // 14. Democratic Vote to Skip (Phase 4.1)
    socket.on(SOCKET_EVENTS.QUEUE_VOTE_SKIP, () => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room) {
        const result = room.voteSkip(socket.id);
        if (result.shouldSkip && room.currentTrack) {
          io.to(room.code).emit(SOCKET_EVENTS.TRACK_SELECT, {
            track: room.currentTrack,
            room: room.toJSON()
          });
        } else {
          io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());
        }
      }
    });

    // 15. Graceful Reconnection (Phase 4.2)
    socket.on(SOCKET_EVENTS.CLIENT_RECONNECT, ({ roomCode, deviceName, oldSocketId } = {}) => {
      try {
        const cleanCode = String(roomCode || '').trim();
        if (!/^\d{4}$/.test(cleanCode)) {
          return socket.emit(SOCKET_EVENTS.ROOM_ERROR, { message: 'Invalid room code.' });
        }
        const cleanDeviceName = sanitizeString(deviceName, 30, 'Guest Phone');
        const result = roomService.reconnectDevice(cleanCode, cleanDeviceName, socket.id, oldSocketId);
        if (result && result.room) {
          socket.join(cleanCode);
          socket.emit(SOCKET_EVENTS.ROOM_JOINED, result.room.toJSON());
          io.to(cleanCode).emit(SOCKET_EVENTS.ROOM_UPDATE, result.room.toJSON());
        } else {
          socket.emit(SOCKET_EVENTS.ROOM_ERROR, { message: 'Reconnection session expired or room closed.' });
        }
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ROOM_ERROR, { message: err.message });
      }
    });

    // 16. Disconnect handling with 15-second grace window and host migration (Phase 4.2)
    socket.on('disconnect', () => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (!room) return;

      const roomCode = room.code;

      roomService.handleDeviceDisconnect(socket.id, ({ room: updatedRoom, migratedHost, destroyed, socketId }) => {
        if (destroyed) {
          io.to(roomCode).emit(SOCKET_EVENTS.ROOM_ERROR, {
            message: 'All devices disconnected. Room closed.'
          });
        } else if (updatedRoom) {
          if (migratedHost) {
            io.to(roomCode).emit(SOCKET_EVENTS.HOST_MIGRATED, {
              newHostSocketId: migratedHost.id,
              newHostName: migratedHost.name,
              room: updatedRoom.toJSON()
            });
          }
          io.to(roomCode).emit(SOCKET_EVENTS.ROOM_USER_LEFT, {
            socketId,
            room: updatedRoom.toJSON()
          });
        }
      });

      // Broadcast immediate offline status in room so peers know node is reconnecting
      io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());
    });
  });
}
