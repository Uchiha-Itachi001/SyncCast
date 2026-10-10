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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStats, setUploadStats] = useState({ loaded: 0, total: 0, filename: '' });
  const [driftCompensation, setDriftCompensation] = useState({ rate: 1.0, status: 'locked', driftMs: 0 });
  const [localDriftMs, setLocalDriftMs] = useState(0);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isExtractingYt, setIsExtractingYt] = useState(false);
  const [ytProgress, setYtProgress] = useState({
    percent: 0,
    downloadPercent: 0,
    total: '',
    speed: '',
    eta: '',
    step: 'idle',
    message: ''
  });
  const [currentDspProfile, setCurrentDspProfile] = useState('flat');
  const [testPingActive, setTestPingActive] = useState(false);
  const [hostMigrationNotice, setHostMigrationNotice] = useState(null);
  const [error, setError] = useState(null);

  const clockSyncRef = useRef(null);
  const socketRef = useRef(null);
  const roomRef = useRef(room);
  roomRef.current = room;
  const currentDspProfileRef = useRef(currentDspProfile);
  currentDspProfileRef.current = currentDspProfile;

  const loadingTrackUrlRef = useRef(null);

  // Auto-buffer helper ensuring audio buffer is downloaded as soon as a track exists
  const ensureTrackLoaded = useCallback(async (track) => {
    if (!track || !track.url) return;
    if (audioEngine.currentTrackUrl === track.url && audioEngine.audioBuffer) return;
    if (loadingTrackUrlRef.current === track.url) return;

    loadingTrackUrlRef.current = track.url;
    try {
      setBuffering(true);
      setBufferProgress(0);
      console.log('[SyncCast] Buffering track:', track.originalName || track.filename);
      await audioEngine.loadTrack(track.url, (progress) => {
        setBufferProgress(progress);
      });
      const dur = audioEngine.getDuration();
      if (dur > 0) setDuration(dur);
      else if (track.duration > 0) setDuration(track.duration);
      setBuffering(false);
      setBufferProgress(100);
      socketRef.current?.emit('track:buffer_status', { buffered: true });
    } catch (err) {
      setBuffering(false);
      console.error('[SyncCast] Audio buffer failed:', err);
      setError(`Audio loading failed: ${err.message}`);
    } finally {
      loadingTrackUrlRef.current = null;
    }
  }, []);

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
      console.warn('[SyncCast] Clock sync failed:', err);
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

  // Global first-interaction unlock (any touch/click anywhere unlocks mobile Web Audio)
  useEffect(() => {
    const handleFirstGesture = async () => {
      try {
        const unlocked = await audioEngine.initAudioContext();
        if (unlocked) {
          setIsAudioUnlocked(true);
          socketRef.current?.emit('audio:unlock', { isUnlocked: true });
        }
      } catch (_) {}
    };

    window.addEventListener('click', handleFirstGesture, { passive: true });
    window.addEventListener('touchstart', handleFirstGesture, { passive: true });
    window.addEventListener('keydown', handleFirstGesture, { passive: true });

    return () => {
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };
  }, []);

  // Handle track playback natural end cleanly
  useEffect(() => {
    audioEngine.onEndedCallback = () => {
      console.log('[SyncCast] Audio playback reached natural end');
      if (roomRef.current?.hostSocketId === socketRef.current?.id) {
        if (roomRef.current?.playlist && roomRef.current.playlist.length > 1) {
          socketRef.current?.emit('queue:next');
        } else {
          socketRef.current?.emit('playback:pause', { currentPosition: 0 });
          audioEngine.setStartOffset(0);
          setPlaybackPosition(0);
        }
      }
    };
    return () => {
      audioEngine.onEndedCallback = null;
    };
  }, []);

  // Initialize socket & clock synchronizer once
  useEffect(() => {
    const socket = socketService.getSocket();
    socketRef.current = socket;
    if (!clockSyncRef.current) {
      clockSyncRef.current = new ClockSynchronizer(socket);
    }

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
      if (roomData.currentTrack) ensureTrackLoaded(roomData.currentTrack);
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
      // Auto-load track if room already has an active track loaded!
      if (roomData.currentTrack) ensureTrackLoaded(roomData.currentTrack);
    });

    socket.on('room:update', (roomData) => {
      setRoom(roomData);
      setIsHost(roomData.hostSocketId === socket.id);

      // Auto-load track if it appeared or changed
      if (roomData.currentTrack && roomData.currentTrack.url !== audioEngine.currentTrackUrl) {
        ensureTrackLoaded(roomData.currentTrack);
      }

      // Sync DSP profile if changed remotely
      const myDev = roomData.devices?.find((d) => d.id === socket.id);
      if (myDev?.dspProfile && myDev.dspProfile !== currentDspProfileRef.current) {
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
      ensureTrackLoaded(track);
    });

    // When host triggers playback, schedule with sample accuracy and start drift monitor (Phase 3.1)
    socket.on('playback:start', async ({ scheduledTime, playbackPosition }) => {
      try {
        const offset = clockSyncRef.current?.offset || 0;
        const currentRoom = roomRef.current;
        const myDevice = currentRoom?.devices?.find((d) => d.id === socket.id);
        const myChannel = myDevice?.channel || 'mono';

        console.log('[SyncCast] Received playback:start. Server T:', scheduledTime, 'Offset:', offset, 'Channel:', myChannel);

        await audioEngine.schedulePlayback(
          scheduledTime,
          offset,
          playbackPosition || 0,
          myChannel
        );

        // Start continuous drift monitoring loop (fast 1200ms burst with min-RTT filtering)
        clockSyncRef.current?.startDriftMonitor(1200, ({ drift, offset: newOffset, rtt: newRtt }) => {
          const compensation = audioEngine.compensateDrift(drift);
          setDriftCompensation(compensation);
          setLocalDriftMs(drift);
          setSyncStats(prev => ({ ...prev, offset: newOffset, rtt: newRtt }));

          socket.emit('sync:report', {
            clockOffset: newOffset,
            rtt: newRtt,
            drift
          });
        });
      } catch (err) {
        console.error('[SyncCast] Playback schedule error:', err);
        setError(`Playback error: ${err.message}`);
      }
    });

    socket.on('playback:pause', ({ playbackPosition: pos }) => {
      audioEngine.stop(pos);
      clockSyncRef.current?.stopDriftMonitor();
      if (pos !== undefined) {
        audioEngine.setStartOffset(pos);
        setPlaybackPosition(pos);
      }
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

    // Real-time YouTube audio extraction telemetry from backend
    socket.on('youtube:progress', (data) => {
      if (data) {
        setYtProgress(data);
      }
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
      socket.off('youtube:progress');
    };
  }, [ensureTrackLoaded, performSync]);

  // Continuous playback playhead position & duration ticker (Phase 3 Media Controller)
  useEffect(() => {
    const isPlaying = room?.playbackState?.status === 'playing' || room?.playbackState?.status === 'scheduled';
    if (!isPlaying) {
      if (room?.playbackState?.playbackPosition !== undefined) {
        setPlaybackPosition(room.playbackState.playbackPosition);
      }
      const dur = audioEngine.getDuration();
      if (dur > 0) setDuration(dur);
      else if (room?.currentTrack?.duration > 0) setDuration(room.currentTrack.duration);
      return;
    }

    const timer = setInterval(() => {
      const pos = audioEngine.getCurrentTime();
      const dur = audioEngine.getDuration();
      setPlaybackPosition(pos);
      if (dur > 0) setDuration(dur);
      else if (room?.currentTrack?.duration > 0) setDuration(room.currentTrack.duration);
    }, 100);

    return () => clearInterval(timer);
  }, [room?.playbackState?.status, room?.playbackState?.playbackPosition, room?.currentTrack]);

  const createRoom = useCallback(async (hostName) => {
    setError(null);
    try {
      await audioEngine.initAudioContext();
      setIsAudioUnlocked(true);
    } catch (_) {}
    socketRef.current?.emit('room:create', { hostName });
  }, []);

  const joinRoom = useCallback(async (roomCode, deviceName) => {
    setError(null);
    try {
      await audioEngine.initAudioContext();
      setIsAudioUnlocked(true);
    } catch (_) {}
    socketRef.current?.emit('room:join', { roomCode, deviceName });
  }, []);

  const uploadAndSelectTrack = useCallback(async (file) => {
    try {
      await audioEngine.initAudioContext();
      setIsAudioUnlocked(true);
      setError(null);
      setIsUploading(true);
      setUploadProgress(0);
      setUploadStats({ loaded: 0, total: file.size, filename: file.name });

      const trackData = await apiService.uploadAudio(file, (p) => {
        setUploadProgress(p.percent);
        setUploadStats(p);
      });

      setIsUploading(false);
      setUploadProgress(100);

      socketRef.current?.emit('track:select', trackData);

      // Host buffers own track with live download & decode progress tracking
      setBuffering(true);
      setBufferProgress(0);
      await audioEngine.loadTrack(trackData.url, (p) => {
        setBufferProgress(p);
      });
      const dur = audioEngine.getDuration();
      if (dur > 0) setDuration(dur);
      else if (trackData.duration > 0) setDuration(trackData.duration);
      setBuffering(false);
      setBufferProgress(100);
      socketRef.current?.emit('track:buffer_status', { buffered: true });
    } catch (err) {
      setIsUploading(false);
      setBuffering(false);
      setError(`Upload error: ${err.message}`);
    }
  }, []);

  // YouTube Audio Extractor & Broadcaster (Phase 4.4)
  const extractAndSelectYtTrack = useCallback(async (youtubeUrl) => {
    try {
      await audioEngine.initAudioContext();
      setIsAudioUnlocked(true);
      setError(null);
      setIsExtractingYt(true);
      setYtProgress({
        percent: 5,
        downloadPercent: 0,
        total: '',
        speed: '',
        eta: '',
        step: 'metadata',
        message: 'Initializing YouTube extraction pipeline...'
      });

      const trackData = await apiService.extractYoutubeAudio(youtubeUrl, socketRef.current?.id);
      setIsExtractingYt(false);

      socketRef.current?.emit('track:select', trackData);

      setBuffering(true);
      setBufferProgress(0);
      await audioEngine.loadTrack(trackData.url, (p) => {
        setBufferProgress(p);
      });
      const ytDur = audioEngine.getDuration();
      if (ytDur > 0) setDuration(ytDur);
      else if (trackData.duration > 0) setDuration(trackData.duration);
      setBuffering(false);
      setBufferProgress(100);
      socketRef.current?.emit('track:buffer_status', { buffered: true });
      return trackData;
    } catch (err) {
      setIsExtractingYt(false);
      setBuffering(false);
      setError(`YouTube Extraction error: ${err.message}`);
      throw err;
    }
  }, []);

  const leaveRoom = useCallback(() => {
    sessionStorage.removeItem('synccast_session');
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    audioEngine.stop();
    clockSyncRef.current?.stopDriftMonitor();
    setRoom(null);
    setIsHost(false);
    setBuffering(false);
    setBufferProgress(0);
    setIsUploading(false);
    setUploadProgress(0);
    setIsExtractingYt(false);
    setError(null);

    // Disconnect and immediately reconnect to guarantee clean unregistration on server
    if (socketRef.current) {
      socketRef.current.emit('room:leave');
      socketRef.current.disconnect();
      socketRef.current.connect();
    }
  }, []);

  const startPlayback = useCallback(async (delayMs = 2000) => {
    try {
      await audioEngine.initAudioContext();
      setIsAudioUnlocked(true);
    } catch (_) {}
    socketRef.current?.emit('playback:schedule', { startDelayMs: delayMs });
  }, []);

  const pausePlayback = useCallback(() => {
    const curPos = audioEngine.getCurrentTime();
    socketRef.current?.emit('playback:pause', { currentPosition: curPos });
  }, []);

  const seekPlayback = useCallback((positionSeconds) => {
    const pos = Math.max(0, positionSeconds);
    audioEngine.setStartOffset(pos);
    setPlaybackPosition(pos);
    socketRef.current?.emit('playback:seek', { position: pos });
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
  const addTrackToQueue = useCallback(async (fileOrUrl, isUrl = false, title = '', isYoutube = false) => {
    try {
      let trackData;
      if (isYoutube) {
        setIsExtractingYt(true);
        trackData = await apiService.extractYoutubeAudio(fileOrUrl);
        setIsExtractingYt(false);
      } else if (isUrl) {
        trackData = apiService.createUrlTrack(fileOrUrl, title);
      } else {
        setIsUploading(true);
        setUploadProgress(0);
        setUploadStats({ loaded: 0, total: fileOrUrl.size, filename: fileOrUrl.name });
        trackData = await apiService.uploadAudio(fileOrUrl, (p) => {
          setUploadProgress(p.percent);
          setUploadStats(p);
        });
        setIsUploading(false);
      }
      socketRef.current?.emit('queue:track_add', { trackData });
      return trackData;
    } catch (err) {
      setIsUploading(false);
      setIsExtractingYt(false);
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

  const playLocalTestTone = useCallback(async () => {
    try {
      await audioEngine.initAudioContext();
      setIsAudioUnlocked(true);
      await audioEngine.playTestPing(880, 0.4);
    } catch (err) {
      console.warn('Test tone failed:', err);
    }
  }, []);

  return {
    connected,
    room,
    isHost,
    isAudioUnlocked,
    syncStats,
    buffering,
    bufferProgress,
    isUploading,
    uploadProgress,
    uploadStats,
    isExtractingYt,
    ytProgress,
    playbackPosition,
    duration,
    localDriftMs,
    driftCompensation,
    currentDspProfile,
    testPingActive,
    hostMigrationNotice,
    error,
    setError,
    unlockAudio,
    createRoom,
    joinRoom,
    leaveRoom,
    uploadAndSelectTrack,
    extractAndSelectYtTrack,
    startPlayback,
    pausePlayback,
    seekPlayback,
    assignChannel,
    updateStagePosition,
    testChannelPing,
    setDspProfile,
    setCustomEq,
    addTrackToQueue,
    removeTrackFromQueue,
    advanceQueueNext,
    voteToSkip,
    performSync,
    playLocalTestTone
  };
}
