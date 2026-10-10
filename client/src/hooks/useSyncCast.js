import { useState, useEffect, useRef, useCallback } from 'react';
import { socketService } from '../services/socketService.js';
import { apiService } from '../services/apiService.js';
import { ClockSynchronizer } from '../audio/ClockSynchronizer.js';
import { audioEngine } from '../audio/AudioEngine.js';

export function useSyncCast() {
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const [syncStats, setSyncStats] = useState({ offset: 0, rtt: 0, calibrated: false });
  const [buffering, setBuffering] = useState(false);
  const [bufferProgress, setBufferProgress] = useState(0);
  const [driftCompensation, setDriftCompensation] = useState({ rate: 1.0, status: 'locked', driftMs: 0 });
  const [currentDspProfile, setCurrentDspProfile] = useState('flat');
  const [testPingActive, setTestPingActive] = useState(false);
  const [hostMigrationNotice, setHostMigrationNotice] = useState(null);
  const [error, setError] = useState(null);

  const clockSyncRef = useRef(null);
  const socketRef = useRef(null);

  // Initialize socket & clock synchronizer
  useEffect(() => {
    const socket = socketService.getSocket();
    socketRef.current = socket;
    clockSyncRef.current = new ClockSynchronizer(socket);

    socket.on('connect', () => {
      setConnected(true);
      const savedSession = sessionStorage.getItem('synccast_session');
      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession);
          if (parsed?.roomCode) {
            socket.emit('client:reconnect', {
              roomCode: parsed.roomCode,
              deviceName: parsed.deviceName,
              oldSocketId: parsed.lastSocketId
            });
          }
        } catch (e) {
          sessionStorage.removeItem('synccast_session');
        }
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
      clockSyncRef.current?.stopDriftMonitor();
    });

    socket.on('room:created', (roomData) => {
      setRoom(roomData);
      setIsHost(true);
      sessionStorage.setItem('synccast_session', JSON.stringify({
        roomCode: roomData.code,
        deviceName: 'Host Phone',
        isHost: true,
        lastSocketId: socket.id
      }));
      performSync();
    });

    socket.on('room:joined', (roomData) => {
      setRoom(roomData);
      const amIHost = roomData.hostSocketId === socket.id;
      setIsHost(amIHost);
      const myDev = roomData.devices?.find((d) => d.id === socket.id);
      sessionStorage.setItem('synccast_session', JSON.stringify({
        roomCode: roomData.code,
        deviceName: myDev?.name || 'Guest Node',
        isHost: amIHost,
        lastSocketId: socket.id
      }));
      performSync();
    });

    socket.on('room:update', (roomData) => {
      setRoom(roomData);
      setIsHost(roomData.hostSocketId === socket.id);
      // Sync DSP profile if changed remotely
      const myDev = roomData.devices?.find((d) => d.id === socket.id);
      if (myDev?.dspProfile && myDev.dspProfile !== currentDspProfile) {
        audioEngine.setEqProfile(myDev.dspProfile);
        setCurrentDspProfile(myDev.dspProfile);
      }
    });

    socket.on('room:error', (err) => {
      setError(err.message);
      if (err.message?.includes('expired') || err.message?.includes('closed') || err.message?.includes('not found')) {
        sessionStorage.removeItem('synccast_session');
      }
    });


    // When track is selected, download with live progress tracking (Phase 3.3)
    socket.on('track:select', async ({ track }) => {
      try {
        setBuffering(true);
        setBufferProgress(0);

        await audioEngine.loadTrack(track.url, (progress) => {
          setBufferProgress(progress);
          socket.emit('track:buffer_progress', { progress });
        });

        setBuffering(false);
        setBufferProgress(100);
        socket.emit('track:buffer_status', { buffered: true });
      } catch (err) {
        setBuffering(false);
        setError(`Audio loading failed: ${err.message}`);
      }
    });

    // When host triggers playback, schedule with sample accuracy and start drift monitor (Phase 3.1)
    socket.on('playback:start', ({ scheduledTime, playbackPosition }) => {
      try {
        const offset = clockSyncRef.current?.offset || 0;
        const myDevice = room?.devices?.find((d) => d.id === socket.id);
        const myChannel = myDevice?.channel || 'mono';

        audioEngine.schedulePlayback(
          scheduledTime,
          offset,
          playbackPosition || 0,
          myChannel
        );

        // Start continuous drift monitoring loop (runs every 4 seconds)
        clockSyncRef.current?.startDriftMonitor(4000, ({ drift, offset: newOffset, rtt: newRtt }) => {
          const compensation = audioEngine.compensateDrift(drift);
          setDriftCompensation(compensation);
          setSyncStats(prev => ({ ...prev, offset: newOffset, rtt: newRtt }));

          socket.emit('sync:report', {
            clockOffset: newOffset,
            rtt: newRtt,
            drift
          });
        });
      } catch (err) {
        setError(`Playback scheduling error: ${err.message}`);
      }
    });

    socket.on('playback:pause', () => {
      audioEngine.stop();
      clockSyncRef.current?.stopDriftMonitor();
      setDriftCompensation({ rate: 1.0, status: 'locked', driftMs: 0 });
    });

    // Host Migration (Phase 4.2)
    socket.on('host:migrated', ({ newHostSocketId, newHostName, room: updatedRoom }) => {
      setRoom(updatedRoom);
      const amIHost = newHostSocketId === socket.id;
      setIsHost(amIHost);
      setHostMigrationNotice(amIHost ? 'Host phone disconnected. You are now the Master Host!' : `Host migrated to ${newHostName}`);
      setTimeout(() => setHostMigrationNotice(null), 6000);
    });

    // Acoustic test chirp received
    socket.on('channel:test_ping', ({ frequency, duration }) => {
      audioEngine.playTestPing(frequency, duration);
      setTestPingActive(true);
      setTimeout(() => setTestPingActive(false), 600);
    });

    return () => {
      clockSyncRef.current?.stopDriftMonitor();
      socket.off('connect');
      socket.off('disconnect');
      socket.off('room:created');
      socket.off('room:joined');
      socket.off('room:update');
      socket.off('room:error');
      socket.off('track:select');
      socket.off('playback:start');
      socket.off('playback:pause');
      socket.off('channel:test_ping');
      socket.off('host:migrated');
    };
  }, [room?.devices, currentDspProfile]);


  const performSync = useCallback(async () => {
    if (!clockSyncRef.current || !socketRef.current) return;
    try {
      const stats = await clockSyncRef.current.calibrate();
      setSyncStats({ ...stats, calibrated: true });
      socketRef.current.emit('sync:report', {
        clockOffset: stats.offset,
        rtt: stats.rtt,
        drift: 0
      });
    } catch (err) {
      console.warn('Clock sync failed:', err);
    }
  }, []);

  const unlockAudio = useCallback(async () => {
    const success = await audioEngine.initAudioContext();
    setIsAudioUnlocked(success);
    if (socketRef.current && success) {
      socketRef.current.emit('audio:unlock', { isUnlocked: true });
    }
    return success;
  }, []);

  const createRoom = useCallback((hostName) => {
    setError(null);
    socketRef.current?.emit('room:create', { hostName });
  }, []);

  const joinRoom = useCallback((roomCode, deviceName) => {
    setError(null);
    socketRef.current?.emit('room:join', { roomCode, deviceName });
  }, []);

  const uploadAndSelectTrack = useCallback(async (file) => {
    try {
      setBuffering(true);
      setBufferProgress(0);
      setError(null);
      const trackData = await apiService.uploadAudio(file);
      socketRef.current?.emit('track:select', trackData);
      // Host buffers own track with progress tracking
      await audioEngine.loadTrack(trackData.url, (p) => {
        setBufferProgress(p);
      });
      setBuffering(false);
      setBufferProgress(100);
      socketRef.current?.emit('track:buffer_status', { buffered: true });
    } catch (err) {
      setBuffering(false);
      setError(`Upload error: ${err.message}`);
    }
  }, []);

  const startPlayback = useCallback((delayMs = 2000) => {
    socketRef.current?.emit('playback:schedule', { startDelayMs: delayMs });
  }, []);

  const pausePlayback = useCallback(() => {
    socketRef.current?.emit('playback:pause', { currentPosition: 0 });
  }, []);

  const assignChannel = useCallback((targetSocketId, channel) => {
    socketRef.current?.emit('channel:assign', { targetSocketId, channel });
  }, []);

  const updateStagePosition = useCallback((targetSocketId, position) => {
    socketRef.current?.emit('stage:position_update', { targetSocketId, position });
  }, []);

  const testChannelPing = useCallback((targetSocketId) => {
    socketRef.current?.emit('channel:test_ping', { targetSocketId });
  }, []);

  const setDspProfile = useCallback((profile, targetSocketId) => {
    audioEngine.setEqProfile(profile);
    setCurrentDspProfile(profile);
    socketRef.current?.emit('dsp:profile_change', {
      targetSocketId: targetSocketId || socketRef.current?.id,
      profile
    });
  }, []);

  const setCustomEq = useCallback((gains) => {
    audioEngine.setEqGains(gains);
  }, []);

  // Phase 4: Collaborative Playlist Queue
  const addTrackToQueue = useCallback(async (fileOrUrl, isUrl = false, title = '') => {
    try {
      let trackData;
      if (isUrl) {
        trackData = apiService.createUrlTrack(fileOrUrl, title);
      } else {
        setBuffering(true);
        trackData = await apiService.uploadAudio(fileOrUrl);
        setBuffering(false);
      }
      socketRef.current?.emit('queue:track_add', { trackData });
      return trackData;
    } catch (err) {
      setBuffering(false);
      setError(`Add to queue error: ${err.message}`);
    }
  }, []);

  const removeTrackFromQueue = useCallback((trackId) => {
    socketRef.current?.emit('queue:track_remove', { trackId });
  }, []);

  const advanceQueueNext = useCallback(() => {
    socketRef.current?.emit('queue:next');
  }, []);

  const voteToSkip = useCallback(() => {
    socketRef.current?.emit('queue:vote_skip');
  }, []);

  return {
    connected,
    room,
    isHost,
    isAudioUnlocked,
    syncStats,
    buffering,
    bufferProgress,
    driftCompensation,
    currentDspProfile,
    testPingActive,
    hostMigrationNotice,
    error,
    unlockAudio,
    createRoom,
    joinRoom,
    uploadAndSelectTrack,
    startPlayback,
    pausePlayback,
    assignChannel,
    updateStagePosition,
    testChannelPing,
    setDspProfile,
    setCustomEq,
    addTrackToQueue,
    removeTrackFromQueue,
    advanceQueueNext,
    voteToSkip,
    performSync
  };
}
