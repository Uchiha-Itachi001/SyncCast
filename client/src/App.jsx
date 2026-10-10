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
    voteToSkip
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
    }
  }, [connected, room, joinRoom]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header
        connected={connected}
        roomCode={room?.code}
        deviceCount={room?.devices?.length || 0}
      />

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
            onStartPlayback={startPlayback}
            onPausePlayback={pausePlayback}
            onAssignChannel={assignChannel}
            onUpdatePosition={updateStagePosition}
            onTestPing={testChannelPing}
            onSetDspProfile={setDspProfile}
            onAddTrack={addTrackToQueue}
            onRemoveTrack={removeTrackFromQueue}
            onNextTrack={advanceQueueNext}
            onVoteSkip={voteToSkip}
          />
        ) : (
          <GuestView
            room={room}
            syncStats={syncStats}
            buffering={buffering}
            bufferProgress={bufferProgress}
            driftCompensation={driftCompensation}
            currentDspProfile={currentDspProfile}
            onSetDspProfile={setDspProfile}
            onSetCustomEq={setCustomEq}
            testPingActive={testPingActive}
            onAddTrack={addTrackToQueue}
            onVoteSkip={voteToSkip}
          />
        )}
      </main>


      <footer style={{ textAlign: 'center', padding: '24px 16px', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
        SYNCCAST &bull; LOCAL AREA NETWORK DISTRIBUTED TRANSDUCER ARRAY &bull; WEB AUDIO CLOCK LOCK
      </footer>
    </div>
  );
}
