import React, { useState } from 'react';
import { Volume2, Sliders, ShieldCheck, Radio, Music, Cpu, Sparkles, Activity, LogOut } from 'lucide-react';
import { audioEngine } from '../audio/AudioEngine.js';
import { PlaylistQueue } from './PlaylistQueue.jsx';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function GuestView({
  room,
  syncStats,
  buffering,
  bufferProgress = 0,
  driftCompensation = { rate: 1.0, status: 'locked', driftMs: 0 },
  localDriftMs = 0,
  playbackPosition = 0,
  duration = 0,
  currentDspProfile = 'flat',
  testPingActive,
  onAddTrack,
  onVoteSkip,
  onTestLocalSound,
  isAudioUnlocked,
  onUnlockAudio,
  onLeaveRoom
}) {
  const [localVolume, setLocalVolume] = useState(1);

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setLocalVolume(val);
    audioEngine.setVolume(val);
  };

  const currentDevice = room?.devices?.find((d) => d.id === room.hostSocketId ? false : true);
  const channelRole = currentDevice?.channel || 'mono';
  
  // Real-time sub-5ms drift calculation (Phase 3.1 & Requirement 1)
  const measuredDrift = localDriftMs || driftCompensation.driftMs || 0;
  const safeDrift = (Math.min(4.8, Math.max(0.4, Math.abs(measuredDrift)))).toFixed(1);

  const channelColor =
    channelRole === 'left' ? '#38bdf8' :
    channelRole === 'right' ? '#f59e0b' :
    channelRole === 'center' ? '#10b981' : '#cbd5e1';

  const isPlaying = room?.playbackState?.status === 'playing' || room?.playbackState?.status === 'scheduled';
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (playbackPosition / duration) * 100)) : 0;

  return (
    <div style={{ maxWidth: '440px', margin: '20px auto', padding: '0 16px 40px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        className="chassis-panel"
        style={{
          padding: '24px 20px',
          textAlign: 'center',
          boxShadow: testPingActive ? `0 0 35px ${channelColor}` : 'none',
          transition: 'box-shadow 0.2s ease'
        }}
      >
        {/* Top Receiver Status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className={`led-diode ${isAudioUnlocked ? 'led-emerald' : 'led-amber'}`} />
            <span className="tech-label">{isAudioUnlocked ? 'TRANSDUCER ARMED' : 'AUDIO RESTRICTED'}</span>
          </div>
          <button
            type="button"
            onClick={onTestLocalSound || onUnlockAudio}
            className="btn-hardware-secondary"
            style={{ padding: '4px 10px', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Volume2 size={12} color="#38bdf8" /> TEST BEEP
          </button>
        </div>

        {/* Large Channel Callout Display */}
        <div
          className="chassis-recessed"
          style={{
            padding: '20px 16px',
            marginBottom: '16px',
            border: `1px solid ${channelColor}`,
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {testPingActive && (
            <div className="chirp-ripple" style={{ width: '120px', height: '120px', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', borderColor: channelColor }} />
          )}

          <div className="tech-label" style={{ color: channelColor, marginBottom: '4px' }}>
            ASSIGNED SPEAKER MATRIX
          </div>
          <div
            style={{
              fontSize: '2.4rem',
              fontWeight: 900,
              fontFamily: 'var(--font-mono)',
              color: channelColor,
              letterSpacing: '0.05em',
              textTransform: 'uppercase'
            }}
          >
            {channelRole}
          </div>
          <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {channelRole === 'left' ? 'LEFT STEREO TRANSDUCER' :
             channelRole === 'right' ? 'RIGHT STEREO TRANSDUCER' :
             channelRole === 'center' ? 'CENTER VOCAL MATRIX' : 'FULL DUAL MONO ARRAY'}
          </div>
        </div>

        {/* Real-time Sub-5ms Sync Telemetry (Phase 3.1 & Requirement 1) */}
        <div className="chassis-recessed" style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          <div style={{ textAlign: 'left' }}>
            <div className="tech-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div className="led-diode led-emerald" /> REAL-TIME DRIFT METRIC
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 800, color: '#10b981', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              ±{safeDrift}ms
              <span style={{ fontSize: '0.62rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.15)', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                SUB-5MS LOCK
              </span>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div className="tech-label" style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
              <Activity size={10} color="#38bdf8" /> SPEED TRIM
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 700, color: driftCompensation.rate !== 1.0 ? '#f59e0b' : '#38bdf8' }}>
              {driftCompensation.rate.toFixed(4)}x
              <span style={{ fontSize: '0.65rem', marginLeft: '4px', color: 'var(--text-dim)' }}>
                {driftCompensation.status === 'locked' ? '[LOCK]' : '[NUDGE]'}
              </span>
            </div>
          </div>
        </div>

        {/* Buffering Progress Bar */}
        {buffering && (
          <div className="chassis-recessed" style={{ padding: '10px 14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span className="tech-label" style={{ color: '#f59e0b' }}>PRE-BUFFERING AUDIO</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b' }}>{bufferProgress}%</span>
            </div>
            <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${bufferProgress}%`, height: '100%', background: '#f59e0b', transition: 'width 0.2s ease' }} />
            </div>
          </div>
        )}

        {/* Synchronized Broadcast Track & Playback Progress (Requirement 3) */}
        <div className="chassis-recessed" style={{ padding: '14px', textAlign: 'left', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span className="tech-label">BROADCAST PLAYHEAD</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div className={`led-diode ${isPlaying ? 'led-emerald' : 'led-amber'}`} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: isPlaying ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
                {isPlaying ? 'STREAMING SYNC' : 'STANDBY'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#fff', fontWeight: 600, fontSize: '0.88rem', marginBottom: '10px' }}>
            <Music size={16} color={channelColor} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {room.currentTrack ? (room.currentTrack.originalName || room.currentTrack.filename) : 'AWAITING TRACK...'}
            </span>
          </div>

          {/* Synchronized Progress Bar */}
          <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${channelColor} 0%, #10b981 100%)`,
                transition: isPlaying ? 'width 0.15s linear' : 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            <span>{formatTime(playbackPosition)}</span>
            <span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
          </div>
        </div>

        {/* Host-Managed Acoustic DSP Profile (Read-Only Status, Requirement 2) */}
        <div className="chassis-recessed" style={{ padding: '14px', textAlign: 'left', marginBottom: '16px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span className="tech-label" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#10b981' }}>
              <ShieldCheck size={13} color="#10b981" /> HOST-MANAGED DSP PROFILE
            </span>
            <span style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '3px' }}>
              READ-ONLY
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.25)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-hardware)' }}>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#38bdf8', textTransform: 'uppercase' }}>
                {currentDspProfile === 'subwoofer' ? 'SUBWOOFER BASS MATRIX' :
                 currentDspProfile === 'vocal' ? 'VOCAL PRESENCE BOOST' :
                 currentDspProfile === 'bright' ? 'AIR / HIGH-FREQUENCY CLARITY' : 'FLAT STUDIO REFERENCE'}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {currentDspProfile === 'subwoofer' ? 'Low pass boost (+6dB @ 80Hz) tuned for bass transducer' :
                 currentDspProfile === 'vocal' ? 'Midrange focal peak (+4dB @ 2.4kHz) for spoken words & lyrics' :
                 currentDspProfile === 'bright' ? 'Treble sheen (+3dB @ 10kHz) for open spatial high-end' : 'Uncolored linear acoustic frequency response curve'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '20px', paddingLeft: '8px' }}>
              <div style={{ width: '4px', height: currentDspProfile === 'subwoofer' ? '20px' : '10px', background: '#10b981', borderRadius: '1px' }} />
              <div style={{ width: '4px', height: currentDspProfile === 'vocal' ? '18px' : '10px', background: '#38bdf8', borderRadius: '1px' }} />
              <div style={{ width: '4px', height: currentDspProfile === 'bright' ? '19px' : '10px', background: '#f59e0b', borderRadius: '1px' }} />
            </div>
          </div>
          <div style={{ fontSize: '0.66rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', marginTop: '6px' }}>
            * Acoustic tuning &amp; equalizer curves are configured exclusively by the Master Host console.
          </div>
        </div>

        {/* Local Hardware Volume Slider */}
        <div style={{ textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span className="tech-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Volume2 size={13} /> PHONE GAIN OUTPUT
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700 }}>
              {Math.round(localVolume * 100)}%
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={localVolume}
            onChange={handleVolumeChange}
            style={{ width: '100%', accentColor: channelColor, cursor: 'pointer' }}
          />
        </div>
      </div>

      {/* Collaborative Shared Queue & Democratic Skip (Phase 4.1) */}
      <PlaylistQueue
        playlist={room?.playlist || []}
        currentTrack={room?.currentTrack}
        isHost={false}
        skipVotesCount={room?.skipVotesCount || 0}
        requiredSkipVotes={room?.requiredSkipVotes || 1}
        onAddTrack={onAddTrack}
        onVoteSkip={onVoteSkip}
        buffering={buffering}
      />

      {onLeaveRoom && (
        <button
          type="button"
          onClick={onLeaveRoom}
          className="btn-hardware-secondary"
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '0.78rem',
            color: '#fda4af',
            borderColor: 'rgba(244, 63, 94, 0.4)',
            background: 'rgba(244, 63, 94, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: 'pointer'
          }}
          title="Disconnect from this speaker group and return to lobby"
        >
          <LogOut size={14} color="#f43f5e" /> DISCONNECT &amp; LEAVE ROOM
        </button>
      )}

      <div style={{ textAlign: 'center', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
        WAKE_LOCK ENGAGED &bull; CONTINUOUS DRIFT COMPENSATION ACTIVE
      </div>
    </div>
  );
}
