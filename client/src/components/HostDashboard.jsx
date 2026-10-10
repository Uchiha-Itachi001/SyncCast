import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Play, Pause, Upload, Music, Disc, Copy, Check, Radio, Cpu, LogOut } from 'lucide-react';
import { SpatialStage } from './SpatialStage.jsx';
import { ChannelStrip } from './ChannelStrip.jsx';
import { PlaylistQueue } from './PlaylistQueue.jsx';

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

  const joinUrl = `${window.location.origin}?room=${room.code}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadTrack(file);
    }
  };

  const isPlaying = room.playbackState?.status === 'playing' || room.playbackState?.status === 'scheduled';
  const devices = room.devices || [];

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0 16px 60px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
            <span className="tech-label">CLOCK JITTER: </span>
            <span className="tech-value" style={{ color: '#10b981' }}>SUB-20MS PASS</span>
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
            <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${bufferProgress}%`,
                  height: '100%',
                  background: '#f59e0b',
                  boxShadow: '0 0 8px rgba(245, 158, 11, 0.4)',
                  transition: 'width 0.15s ease'
                }}
              />
            </div>
          </div>
        )}

        {/* Current Track Slot */}
        {room.currentTrack ? (
          <div className="chassis-recessed" style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Music size={22} color="#38bdf8" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>
                  {room.currentTrack.originalName || room.currentTrack.filename}
                </div>
                <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: '2px' }}>
                  FORMAT: {(room.currentTrack.mimeType || 'AUDIO/MPEG').toUpperCase()} &bull; {buffering ? 'BUFFERING PEERS...' : 'BIT-FOR-BIT VERIFIED'}
                </div>
              </div>
            </div>

            {/* Play/Pause & Swap Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label
                className="btn-hardware-secondary"
                style={{ padding: '8px 12px', fontSize: '0.72rem', cursor: isUploading ? 'not-allowed' : 'pointer', opacity: isUploading ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Select a different audio file"
              >
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileChange}
                  disabled={isUploading}
                  style={{ display: 'none' }}
                />
                <Upload size={14} /> REPLACE AUDIO
              </label>

              {isPlaying ? (
                <button type="button" className="btn-hardware-secondary" onClick={onPausePlayback}>
                  <Pause size={16} /> PAUSE CLOCK
                </button>
              ) : (
                <button type="button" className="btn-hardware-primary" onClick={() => onStartPlayback(2000)}>
                  <Play size={16} /> TRIGGER SYNC PLAY
                </button>
              )}
            </div>
          </div>
        ) : (
          !isUploading && (
            <div className="chassis-recessed" style={{ padding: '32px 20px', textAlign: 'center', marginBottom: '20px', border: '1px dashed var(--border-hardware)' }}>
              <Upload size={30} color="var(--text-muted)" style={{ margin: '0 auto 10px' }} />
              <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>
                LOAD AUDIO MASTER
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px', maxWidth: '420px', margin: '0 auto 16px' }}>
                Drop an MP3 or WAV file. The audio will be uploaded with live progress and pre-buffered identically on all joined phones.
              </p>
              <label className="btn-hardware-primary" style={{ cursor: 'pointer' }}>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                SELECT AUDIO FILE
              </label>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>

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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
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
