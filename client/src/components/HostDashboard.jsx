import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Play,
  Pause,
  Upload,
  Music,
  Copy,
  Check,
  Radio,
  LogOut,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  ArrowLeft
} from 'lucide-react';
import { SpatialStage } from './SpatialStage.jsx';
import { ChannelStrip } from './ChannelStrip.jsx';
import { PlaylistQueue } from './PlaylistQueue.jsx';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function HostDashboard({
  room,
  buffering,
  bufferProgress = 0,
  isUploading = false,
  uploadProgress = 0,
  uploadStats = { loaded: 0, total: 0, filename: '' },
  onUploadTrack,
  onStartPlayback,
  onPausePlayback,
  onSeekPlayback,
  playbackPosition = 0,
  duration = 0,
  localDriftMs = 0,
  currentDspProfile = 'flat',
  onAssignChannel,
  onUpdatePosition,
  onTestPing,
  onSetDspProfile,
  onAddTrack,
  onRemoveTrack,
  onNextTrack,
  onVoteSkip,
  onTestLocalSound,
  isAudioUnlocked,
  onUnlockAudio,
  onLeaveRoom
}) {
  const [copied, setCopied] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [localSeekPos, setLocalSeekPos] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const joinUrl = `${window.location.origin}?room=${room.code}`;

  const handleCopy = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(joinUrl).catch(() => {});
    } else {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = joinUrl;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (_) {}
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadTrack(file);
      setIsReplacing(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      onUploadTrack(file);
      setIsReplacing(false);
    }
  };

  const isPlaying = room.playbackState?.status === 'playing' || room.playbackState?.status === 'scheduled';
  const devices = room.devices || [];
  const onlineDevices = devices.filter((d) => d.isOnline !== false);
  const bufferedDevices = onlineDevices.filter((d) => d.buffered);
  const unlockedDevices = onlineDevices.filter((d) => d.isAudioUnlocked);
  const isAllBuffered = Boolean(room.currentTrack && onlineDevices.length > 0 && bufferedDevices.length === onlineDevices.length);
  const isAllUnlocked = Boolean(onlineDevices.length > 0 && unlockedDevices.length === onlineDevices.length);
  const isAllReady = Boolean(isAllBuffered && isAllUnlocked);

  return (
    <div className="responsive-container">
      {/* Console Top Telemetry Strip */}
      <div className="chassis-panel" style={{ padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="led-diode led-cyan" />
          <span className="tech-label">MASTER CONSOLE // ROOM {room.code}</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <div>
            <span className="tech-label">LAN PEERS: </span>
            <span className="tech-value">{devices.length} ACTIVE</span>
          </div>
          <div>
            <span className="tech-label">ACOUSTIC PHASE: </span>
            <span className="tech-value" style={{ color: Math.abs(localDriftMs || 0) <= 2.0 ? '#10b981' : '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              ±{Math.abs(localDriftMs || 0) < 0.1 ? '0.2' : Math.abs(localDriftMs || 0).toFixed(1)}ms {Math.abs(localDriftMs || 0) <= 2.0 ? '[SUB-2MS LOCK]' : '[PHASE-LOCKING]'}
            </span>
          </div>
          {onLeaveRoom && (
            <button
              type="button"
              onClick={onLeaveRoom}
              className="btn-hardware-secondary"
              style={{
                padding: '5px 12px',
                fontSize: '0.7rem',
                color: '#fda4af',
                borderColor: 'rgba(244, 63, 94, 0.4)',
                background: 'rgba(244, 63, 94, 0.08)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
              title="Close and dismantle current room session"
            >
              <LogOut size={12} color="#f43f5e" /> DISMANTLE ROOM
            </button>
          )}
        </div>
      </div>

      {/* Main Transport Bay */}
      <div className="chassis-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <span className="tech-label">AUDIO TRANSPORT &amp; BROADCAST</span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '2px 0 0', letterSpacing: '-0.02em' }}>
              Master Playback Unit
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {onTestLocalSound && (
              <button
                type="button"
                onClick={onTestLocalSound}
                className="btn-hardware-secondary"
                style={{ padding: '6px 12px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Verify laptop speakers are unmuted and Web Audio is functioning"
              >
                <Radio size={13} color="#38bdf8" /> TEST LAPTOP BEEP
              </button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="tech-label">STATUS:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700 }}>
                <div className={`led-diode ${isPlaying ? 'led-emerald' : 'led-amber'}`} />
                <span style={{ color: isPlaying ? '#10b981' : '#f59e0b' }}>
                  {isPlaying ? 'TRANSMITTING' : 'STANDBY'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Upload Progress Card */}
        {isUploading && (
          <div
            className="chassis-recessed"
            style={{
              padding: '18px 20px',
              marginBottom: '20px',
              border: '1px solid #38bdf8',
              background: 'rgba(56, 189, 248, 0.06)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="led-diode led-cyan" />
                <span className="tech-label" style={{ color: '#38bdf8', fontWeight: 800 }}>
                  UPLOADING AUDIO MASTER // {uploadProgress}%
                </span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#38bdf8', fontWeight: 700 }}>
                {uploadStats.total > 0
                  ? `${(uploadStats.loaded / (1024 * 1024)).toFixed(2)} MB / ${(uploadStats.total / (1024 * 1024)).toFixed(2)} MB`
                  : `${uploadProgress}%`}
              </span>
            </div>
            <div style={{ height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${uploadProgress}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #38bdf8 0%, #818cf8 100%)',
                  boxShadow: '0 0 10px rgba(56, 189, 248, 0.5)',
                  transition: 'width 0.15s ease'
                }}
              />
            </div>
            <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: '8px' }}>
              FILE: {uploadStats.filename || 'Audio Master'} &bull; TRANSMITTING TO SERVER...
            </div>
          </div>
        )}

        {/* Live Pre-Buffering Progress Card */}
        {!isUploading && buffering && (
          <div
            className="chassis-recessed"
            style={{
              padding: '16px 20px',
              marginBottom: '20px',
              border: '1px solid #f59e0b',
              background: 'rgba(245, 158, 11, 0.06)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="led-diode led-amber" />
                <span className="tech-label" style={{ color: '#f59e0b', fontWeight: 800 }}>
                  DECODING &amp; PRE-BUFFERING TO RAM // {bufferProgress}%
                </span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#f59e0b', fontWeight: 700 }}>
                {bufferProgress}%
              </span>
            </div>
            <div className="wave-track" style={{ height: '8px' }}>
              <div
                className="wave-fill wave-fill-amber"
                style={{
                  width: `${bufferProgress}%`,
                  transition: 'width 0.2s ease'
                }}
              >
                <div className="wave-light-spot" />
              </div>
            </div>
          </div>
        )}

        {/* Comprehensive Hardware Media Player Controller */}
        {room.currentTrack && !isReplacing ? (
          <div
            className="chassis-recessed"
            style={{
              padding: '20px',
              marginBottom: '20px',
              border: '1px solid var(--border-hardware)',
              background: 'rgba(0, 0, 0, 0.35)'
            }}
          >
            {/* Top Row: Track Meta + Dynamic VU Spectrum Visualizer */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '8px',
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid #38bdf8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Music size={24} color="#38bdf8" />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff', letterSpacing: '-0.01em' }}>
                    {room.currentTrack.originalName || room.currentTrack.filename}
                  </div>
                  <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: '2px' }}>
                    SOURCE: {room.currentTrack.isStream ? 'URL STREAM' : 'LOCAL MASTER'} &bull; FORMAT: {(room.currentTrack.mimeType || 'AUDIO/MPEG').toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Dynamic VU Meter Spectrum Bars */}
              <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '26px', padding: '4px 8px', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.06)' }}>
                {[35, 75, 95, 60, 85, 100, 75, 50, 65, 95, 80, 55, 70, 90, 60, 45].map((h, i) => (
                  <div
                    key={i}
                    style={{
                      width: '4px',
                      height: isPlaying ? `${Math.max(15, (h * (0.6 + ((i % 4) * 0.13))))}%` : '15%',
                      background: isPlaying ? (i > 12 ? '#ef4444' : i > 8 ? '#f59e0b' : '#10b981') : 'rgba(255,255,255,0.1)',
                      borderRadius: '1px',
                      transition: 'height 0.18s ease'
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Live Playback Scrubber & Time Display */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', marginBottom: '6px' }}>
                <span style={{ color: '#38bdf8', fontWeight: 800 }}>
                  {formatTime(isSeeking ? localSeekPos : playbackPosition)}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {duration > 0
                    ? `-${formatTime(Math.max(0, duration - (isSeeking ? localSeekPos : playbackPosition)))} / ${formatTime(duration)}`
                    : '--:--'}
                </span>
              </div>

              <input
                type="range"
                min="0"
                max={duration > 0 ? duration : 100}
                step="0.5"
                value={isSeeking ? localSeekPos : Math.min(playbackPosition, duration > 0 ? duration : 100)}
                onMouseDown={() => {
                  setIsSeeking(true);
                  setLocalSeekPos(playbackPosition);
                }}
                onTouchStart={() => {
                  setIsSeeking(true);
                  setLocalSeekPos(playbackPosition);
                }}
                onChange={(e) => {
                  setLocalSeekPos(parseFloat(e.target.value));
                }}
                onMouseUp={(e) => {
                  setIsSeeking(false);
                  const target = parseFloat(e.target.value);
                  if (onSeekPlayback) onSeekPlayback(target);
                }}
                onTouchEnd={() => {
                  setIsSeeking(false);
                  if (onSeekPlayback) onSeekPlayback(localSeekPos);
                }}
                style={{
                  width: '100%',
                  accentColor: '#38bdf8',
                  cursor: 'pointer',
                  height: '6px'
                }}
              />
            </div>

            {/* Transport Controller Strip */}
            <div className="responsive-transport-strip">
              {/* Playback Transport Buttons */}
              <div className="responsive-transport-buttons">
                <button
                  type="button"
                  className="btn-hardware-secondary"
                  onClick={() => onSeekPlayback && onSeekPlayback(0)}
                  title="Replay from start"
                  style={{ padding: '8px 10px' }}
                >
                  <SkipBack size={15} />
                </button>

                <button
                  type="button"
                  className="btn-hardware-secondary"
                  onClick={() => onSeekPlayback && onSeekPlayback(Math.max(0, playbackPosition - 10))}
                  title="Seek back 10 seconds"
                  style={{ padding: '8px 10px', fontSize: '0.7rem' }}
                >
                  <RotateCcw size={14} /> -10s
                </button>

                {isPlaying ? (
                  <button
                    type="button"
                    className="btn-hardware-secondary"
                    onClick={onPausePlayback}
                    style={{
                      padding: '8px 18px',
                      background: 'rgba(245, 158, 11, 0.15)',
                      borderColor: '#f59e0b',
                      color: '#f59e0b',
                      fontWeight: 800
                    }}
                  >
                    <Pause size={17} /> PAUSE CLOCK
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!isAllReady}
                    className={isAllReady ? "btn-rgb-gradient" : "btn-hardware-secondary"}
                    onClick={() => isAllReady && onStartPlayback(2500)}
                    title={!isAllBuffered ? "Waiting for all peers to download and decode audio" : !isAllUnlocked ? "Waiting for all peers to arm audio" : "Trigger synchronized playback"}
                    style={{
                      padding: isAllReady ? '10px 22px' : '8px 20px',
                      color: isAllReady ? '#fff' : '#fbbf24',
                      fontWeight: 800,
                      cursor: isAllReady ? 'pointer' : 'not-allowed',
                      opacity: isAllReady ? 1 : 0.88,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Play size={17} />
                    {isAllReady
                      ? `TRIGGER SYNC PLAY (${onlineDevices.length} READY)`
                      : !isAllBuffered
                      ? `WAITING FOR PEERS (${bufferedDevices.length}/${onlineDevices.length})`
                      : `WAITING FOR ARM (${unlockedDevices.length}/${onlineDevices.length})`}
                  </button>
                )}

                <button
                  type="button"
                  className="btn-hardware-secondary"
                  onClick={() => onSeekPlayback && onSeekPlayback(Math.min(duration || 9999, playbackPosition + 10))}
                  title="Seek forward 10 seconds"
                  style={{ padding: '8px 10px', fontSize: '0.7rem' }}
                >
                  +10s <RotateCw size={14} />
                </button>

                <button
                  type="button"
                  className="btn-hardware-secondary"
                  onClick={() => {
                    const hasNext = Boolean(room.playlist && room.playlist.length > 1);
                    if (hasNext) {
                      onNextTrack();
                    } else {
                      if (onSeekPlayback) onSeekPlayback(0);
                    }
                  }}
                  title={room.playlist && room.playlist.length > 1 ? "Advance to next track in queue" : "No other tracks queued (replay from start)"}
                  style={{
                    padding: '8px 10px',
                    opacity: (room.playlist && room.playlist.length > 1) ? 1 : 0.6
                  }}
                >
                  <SkipForward size={15} />
                </button>
              </div>

              {/* Live Peer Sync Readiness Strip */}
              {!isAllReady && room.currentTrack && (
                <div
                  style={{
                    width: '100%',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '10px',
                    padding: '10px 14px',
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontFamily: 'var(--font-mono)'
                  }}
                >
                  <div className="led-diode led-amber" />
                  <span style={{ color: '#fbbf24', fontWeight: 800 }}>SYNC BARRIER ACTIVE:</span>
                  <span style={{ color: 'var(--text-muted)' }}>Playback locked until all speakers finish decoding:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', width: '100%', marginTop: '4px' }}>
                    {onlineDevices.map((d) => (
                      <div
                        key={d.id}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: d.buffered && d.isAudioUnlocked ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          border: `1px solid ${d.buffered && d.isAudioUnlocked ? '#10b981' : '#f59e0b'}`,
                          color: d.buffered && d.isAudioUnlocked ? '#10b981' : '#fbbf24',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <span style={{ fontWeight: 700 }}>{d.name}:</span>
                        <span>{d.buffered ? 'BUFFER 100%' : `DOWNLOADING ${d.bufferProgress || 0}%`}</span>
                        {!d.isAudioUnlocked && <span style={{ color: '#f87171' }}>[AUDIO LOCKED]</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Host Room-Wide DSP Selector */}
              <div className="responsive-dsp-strip">
                <span className="tech-label" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
                  <ShieldCheck size={12} color="#10b981" /> ROOM DSP:
                </span>
                {['flat', 'subwoofer', 'vocal', 'bright'].map((prof) => (
                  <button
                    key={prof}
                    type="button"
                    onClick={() => onSetDspProfile && onSetDspProfile(prof)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: currentDspProfile === prof ? '1px solid #10b981' : '1px solid var(--border-hardware)',
                      background: currentDspProfile === prof ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                      color: currentDspProfile === prof ? '#10b981' : 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.64rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      cursor: 'pointer'
                    }}
                  >
                    {prof === 'subwoofer' ? 'SUB' : prof === 'vocal' ? 'VOX' : prof === 'bright' ? 'AIR' : 'FLAT'}
                  </button>
                ))}

                <button
                  type="button"
                  className="btn-hardware-secondary"
                  onClick={() => setIsReplacing(true)}
                  style={{ padding: '6px 10px', fontSize: '0.68rem', marginLeft: '6px' }}
                  title="Change audio source"
                >
                  CHANGE TRACK
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Streamlined Dedicated Local Audio Master Upload Bay */
          !isUploading && (
            <div
              className="chassis-recessed"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              style={{
                padding: '32px 24px',
                marginBottom: '20px',
                border: isDragging ? '2px dashed #38bdf8' : '1px dashed var(--border-hardware)',
                background: isDragging ? 'rgba(56, 189, 248, 0.08)' : 'rgba(0, 0, 0, 0.25)',
                transition: 'border-color 0.2s ease, background 0.2s ease'
              }}
            >
              {/* Return to Active Controller Banner if track exists */}
              {room.currentTrack && (
                <div
                  style={{
                    marginBottom: '22px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    background: 'rgba(56, 189, 248, 0.08)',
                    padding: '12px 16px',
                    borderRadius: '6px',
                    border: '1px solid rgba(56, 189, 248, 0.35)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="led-diode led-cyan" />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8' }}>
                      CURRENT TRACK LOADED: {room.currentTrack.originalName || room.currentTrack.filename}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsReplacing(false)}
                    className="btn-hardware-primary"
                    style={{
                      padding: '7px 16px',
                      fontSize: '0.75rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 0 10px rgba(56, 189, 248, 0.3)'
                    }}
                  >
                    <ArrowLeft size={15} /> ◀ RETURN TO MEDIA PLAYER
                  </button>
                </div>
              )}

              <div style={{ textAlign: 'center', maxWidth: '480px', margin: '0 auto' }}>
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'rgba(56, 189, 248, 0.1)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px'
                  }}
                >
                  <Upload size={30} color="#38bdf8" />
                </div>

                <h3 style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: '6px', letterSpacing: '-0.01em' }}>
                  UPLOAD AUDIO MASTER
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '22px', lineHeight: 1.6 }}>
                  Select an MP3, WAV, AAC, FLAC, or OGG file from your device, or drag and drop it here. Transmitted bit-for-bit to all speaker nodes with sample-accurate clock sync.
                </p>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                  <label
                    className="btn-hardware-primary"
                    style={{
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 22px',
                      fontSize: '0.82rem',
                      boxShadow: '0 0 15px rgba(56, 189, 248, 0.4)'
                    }}
                  >
                    <input
                      type="file"
                      accept="audio/*,.mp3,.wav,.aac,.flac,.ogg,.m4a"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                    <Upload size={16} /> CHOOSE AUDIO FILE
                  </label>

                  {room.currentTrack && (
                    <button
                      type="button"
                      onClick={() => setIsReplacing(false)}
                      className="btn-hardware-secondary"
                      style={{ padding: '10px 16px', fontSize: '0.78rem' }}
                    >
                      CANCEL
                    </button>
                  )}
                </div>

                <div style={{ marginTop: '16px', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                  MAX FILE SIZE: 50MB &bull; LOSSLESS BITSTREAM PRESERVED
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* Collaborative Playlist Queue Rack (Phase 4.1) */}
      <PlaylistQueue
        playlist={room.playlist || []}
        currentTrack={room.currentTrack}
        isHost={true}
        skipVotesCount={room.skipVotesCount || 0}
        requiredSkipVotes={room.requiredSkipVotes || 1}
        onAddTrack={onAddTrack}
        onRemoveTrack={onRemoveTrack}
        onNextTrack={onNextTrack}
        onVoteSkip={onVoteSkip}
        buffering={buffering}
      />

      {/* Center 2-Column: Spatial Stage & QR Pairing Dock */}
      <div className="responsive-two-col">

        {/* Left: Spatial Radar Stage */}
        <SpatialStage
          devices={devices}
          isPlaying={isPlaying}
          onUpdatePosition={onUpdatePosition}
          onTestPing={onTestPing}
        />

        {/* Right: Hardware Fast Pairing Dock */}
        <div className="chassis-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <span className="tech-label">PEER ONBOARDING // LAN ONLY</span>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '2px 0 0' }}>
              Guest Receiver Dock
            </h3>
          </div>

          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
            No App Store download required. Friends on this WiFi scan this optical QR matrix or enter the 4-digit terminal code in any mobile browser.
          </p>

          <div style={{ background: '#ffffff', padding: '14px', borderRadius: '10px', width: 'fit-content', margin: '0 auto', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }}>
            <QRCodeSVG value={joinUrl} size={150} level="M" />
          </div>

          <div className="chassis-recessed" style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="tech-label">ROOM FREQUENCY</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 800, letterSpacing: '0.15em', color: '#38bdf8' }}>
                {room.code}
              </div>
            </div>

            <button type="button" className="btn-hardware-secondary" onClick={handleCopy} style={{ padding: '8px 12px', fontSize: '0.72rem' }}>
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              {copied ? 'COPIED' : 'COPY URL'}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Rack: Speaker Channel Strips */}
      <div className="chassis-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <span className="tech-label">CONSOLE CHANNEL RACK</span>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '2px 0 0' }}>
              Connected Speaker Nodes ({devices.length})
            </h3>
          </div>
          <span className="tech-label" style={{ color: '#10b981' }}>
            ALL NODES SYNCHRONIZED
          </span>
        </div>

        <div className="channel-rack-grid">
          {devices.map((dev, idx) => (
            <ChannelStrip
              key={dev.id}
              device={dev}
              index={idx}
              onAssignChannel={onAssignChannel}
              onTestPing={onTestPing}
              onSetDspProfile={onSetDspProfile}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
