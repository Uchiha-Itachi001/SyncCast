import { SOCKET_EVENTS } from './events.js';
import { roomService } from '../services/roomService.js';
import { clockSyncService } from '../services/clockSyncService.js';
import { CONFIG } from '../config/constants.js';

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    // 1. NTP Clock Synchronization ping-pong (High priority, fast return)
    socket.on(SOCKET_EVENTS.NTP_PING, (data) => {
      const { t0 } = data; // Client send timestamp
      const response = clockSyncService.processPing(t0);
      socket.emit(SOCKET_EVENTS.NTP_PONG, response);
    });

    // 2. Client reports computed offset & drift after calibration round
    socket.on(SOCKET_EVENTS.SYNC_REPORT, (report) => {
      const { clockOffset, rtt, drift } = report;
      const room = roomService.getRoomBySocketId(socket.id);
      if (room) {
        room.updateDeviceSync(socket.id, { clockOffset, rtt, drift });
        // Broadcast sync health update to room
        io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());

        // Check if drift threshold violated
        if (drift && Math.abs(drift) > CONFIG.MAX_DRIFT_MS) {
          socket.emit(SOCKET_EVENTS.SYNC_DRIFT_ALERT, { drift, maxAllowed: CONFIG.MAX_DRIFT_MS });
        }
      }
    });

    // 3. Room creation (Host)
    socket.on(SOCKET_EVENTS.ROOM_CREATE, ({ hostName }) => {
      try {
        const room = roomService.createRoom(socket.id, hostName || 'Host Phone');
        socket.join(room.code);
        socket.emit(SOCKET_EVENTS.ROOM_CREATED, room.toJSON());
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ROOM_ERROR, { message: err.message });
      }
    });

    // 4. Room join (Guest)
    socket.on(SOCKET_EVENTS.ROOM_JOIN, ({ roomCode, deviceName }) => {
      try {
        const room = roomService.joinRoom(roomCode, socket.id, deviceName || 'Guest Phone');
        socket.join(roomCode);
        socket.emit(SOCKET_EVENTS.ROOM_JOINED, room.toJSON());
        // Notify others
        socket.to(roomCode).emit(SOCKET_EVENTS.ROOM_USER_JOINED, {
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
    socket.on(SOCKET_EVENTS.TRACK_BUFFER_STATUS, ({ buffered }) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room) {
        room.setDeviceBuffered(socket.id, buffered);
        io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());
      }
    });

    // 6b. Device reports live download/decode progress percentage (Phase 3.3)
    socket.on(SOCKET_EVENTS.TRACK_BUFFER_PROGRESS, ({ progress }) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room) {
        room.updateDeviceBufferProgress(socket.id, progress);
        io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());
      }
    });

    // 6c. Device or host updates DSP acoustic profile (Phase 3.2)
    socket.on(SOCKET_EVENTS.DSP_PROFILE_CHANGE, ({ targetSocketId, profile }) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room) {
        const idToUpdate = targetSocketId || socket.id;
        room.updateDeviceDspProfile(idToUpdate, profile);
        io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());
      }
    });

    // 7. Audio unlock status (iOS Safari touch interaction)
    socket.on(SOCKET_EVENTS.AUDIO_UNLOCK, ({ isUnlocked }) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room) {
        room.setDeviceAudioUnlocked(socket.id, isUnlocked);
        io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());
      }
    });

    // 8. Scheduled playback trigger (Host)
    socket.on(SOCKET_EVENTS.PLAYBACK_SCHEDULE, ({ startDelayMs }) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room && room.hostSocketId === socket.id) {
        const delay = startDelayMs || CONFIG.SCHEDULE_AHEAD_MS;
        const { scheduledTime } = roomService.setScheduledPlayback(room.code, delay);
        io.to(room.code).emit(SOCKET_EVENTS.PLAYBACK_START, {
          scheduledTime, // Server timestamp T
          playbackPosition: room.playbackState.playbackPosition,
          room: room.toJSON()
        });
      }
    });

    // 9. Playback pause (Host)
    socket.on(SOCKET_EVENTS.PLAYBACK_PAUSE, ({ currentPosition }) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room && room.hostSocketId === socket.id) {
        const updated = roomService.pausePlayback(room.code, currentPosition || 0);
        io.to(room.code).emit(SOCKET_EVENTS.PLAYBACK_PAUSE, {
          playbackPosition: updated.playbackState.playbackPosition,
          room: updated.toJSON()
        });
      }
    });

    // 10. Channel assignment (Surround / Spatial mode)
    socket.on(SOCKET_EVENTS.CHANNEL_ASSIGN, ({ targetSocketId, channel }) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room && room.hostSocketId === socket.id) {
        room.updateDeviceChannel(targetSocketId, channel);
        io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());
      }
    });

    // 11. Spatial stage position update (2D drag & drop on radar stage)
    socket.on(SOCKET_EVENTS.STAGE_POSITION_UPDATE, ({ targetSocketId, position }) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room && room.hostSocketId === socket.id) {
        room.updateDevicePosition(targetSocketId, position);
        io.to(room.code).emit(SOCKET_EVENTS.ROOM_UPDATE, room.toJSON());
      }
    });

    // 12. Spatial channel test ping (Target device synthesizes an identification tone)
    socket.on(SOCKET_EVENTS.CHANNEL_TEST_PING, ({ targetSocketId }) => {
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
    socket.on(SOCKET_EVENTS.QUEUE_TRACK_ADD, ({ trackData }) => {
      const room = roomService.getRoomBySocketId(socket.id);
      if (room) {
        const dev = room.getDevice(socket.id);
        const wasEmpty = !room.currentTrack;
        const addedTrack = room.addTrackToQueue(trackData, dev?.name || 'Guest');
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

    socket.on(SOCKET_EVENTS.QUEUE_TRACK_REMOVE, ({ trackId }) => {
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
    socket.on(SOCKET_EVENTS.CLIENT_RECONNECT, ({ roomCode, deviceName, oldSocketId }) => {
      try {
        const result = roomService.reconnectDevice(roomCode, deviceName, socket.id, oldSocketId);
        if (result && result.room) {
          socket.join(roomCode);
          socket.emit(SOCKET_EVENTS.ROOM_JOINED, result.room.toJSON());
          io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATE, result.room.toJSON());
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
      const device = room.getDevice(socket.id);

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

