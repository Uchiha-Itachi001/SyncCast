import React, { useEffect } from 'react';
import { useSyncCast } from './hooks/useSyncCast.js';
import { useWakeLock } from './hooks/useWakeLock.js';
import { Header } from './components/Header.jsx';
import { AudioUnlockBanner } from './components/AudioUnlockBanner.jsx';
import { RoomLobby } from './components/RoomLobby.jsx';
import { HostDashboard } from './components/HostDashboard.jsx';
import { GuestView } from './components/GuestView.jsx';

export default function App() {
  const {
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
    driftCompensation,
    localDriftMs,
    playbackPosition,
    duration,
    isExtractingYt,
    ytProgress,
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
    playLocalTestTone
  } = useSyncCast();

  // Prevent mobile device screen from sleeping during audio session
  useWakeLock(!!room);

  // Check URL query parameters for QR code quick join
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && !room && connected) {
      const defaultDeviceName = /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'iPhone Node' : 'Phone Node';
      joinRoom(roomParam, defaultDeviceName);
      // Remove query param from browser URL so user does not get re-trapped in the room on exit
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [connected, room, joinRoom]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header
        connected={connected}
        roomCode={room?.code}
        deviceCount={room?.devices?.length || 0}
        onLeaveRoom={leaveRoom}
      />

      {/* Global Error Banner */}
      {error && (
        <div
          style={{
            margin: '0 16px 14px',
            padding: '10px 16px',
            border: '1px solid #f43f5e',
            background: 'rgba(244, 63, 94, 0.12)',
            color: '#fda4af',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
            <div className="led-diode led-rose" />
            <span>[AUDIO ENGINE ERROR] {error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="btn-hardware-secondary"
            style={{ fontSize: '0.65rem', padding: '3px 8px', color: '#fda4af', borderColor: '#f43f5e' }}
          >
            DISMISS
          </button>
        </div>
      )}

      {/* Host Migration Alert Banner (Phase 4.2) */}
      {hostMigrationNotice && (
        <div
          style={{
            background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0.08) 100%)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.4)',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            color: '#fbbf24',
            animation: 'fadeIn 0.2s ease'
          }}
        >
          <div className="led-diode led-amber" />
          <span>{hostMigrationNotice}</span>
        </div>
      )}

      <AudioUnlockBanner
        isUnlocked={isAudioUnlocked}
        onUnlock={unlockAudio}
        onTestSound={playLocalTestTone}
      />

      <main style={{ flex: 1 }}>
        {!room ? (
          <RoomLobby
            onCreateRoom={createRoom}
            onJoinRoom={joinRoom}
            error={error}
          />
        ) : isHost ? (
          <HostDashboard
            room={room}
            buffering={buffering}
            onUploadTrack={uploadAndSelectTrack}
            onExtractYtTrack={extractAndSelectYtTrack}
            isExtractingYt={isExtractingYt}
            ytProgress={ytProgress}
            onStartPlayback={startPlayback}
            onPausePlayback={pausePlayback}
            onSeekPlayback={seekPlayback}
            playbackPosition={playbackPosition}
            duration={duration}
            localDriftMs={localDriftMs}
            onAssignChannel={assignChannel}
            onUpdatePosition={updateStagePosition}
            onTestPing={testChannelPing}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            uploadStats={uploadStats}
            bufferProgress={bufferProgress}
            currentDspProfile={currentDspProfile}
            onSetDspProfile={setDspProfile}
            onAddTrack={addTrackToQueue}
            onRemoveTrack={removeTrackFromQueue}
            onNextTrack={advanceQueueNext}
            onVoteSkip={voteToSkip}
            onTestLocalSound={playLocalTestTone}
            isAudioUnlocked={isAudioUnlocked}
            onUnlockAudio={unlockAudio}
            onLeaveRoom={leaveRoom}
          />
        ) : (
          <GuestView
            room={room}
            syncStats={syncStats}
            buffering={buffering}
            bufferProgress={bufferProgress}
            driftCompensation={driftCompensation}
            localDriftMs={localDriftMs}
            playbackPosition={playbackPosition}
            duration={duration}
            currentDspProfile={currentDspProfile}
            testPingActive={testPingActive}
            onAddTrack={addTrackToQueue}
            onVoteSkip={voteToSkip}
            onTestLocalSound={playLocalTestTone}
            isAudioUnlocked={isAudioUnlocked}
            onUnlockAudio={unlockAudio}
            onLeaveRoom={leaveRoom}
          />
        )}
      </main>


      <footer style={{ textAlign: 'center', padding: '24px 16px', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
        SYNCCAST &bull; LOCAL AREA NETWORK DISTRIBUTED TRANSDUCER ARRAY &bull; WEB AUDIO CLOCK LOCK
      </footer>
    </div>
  );
}
