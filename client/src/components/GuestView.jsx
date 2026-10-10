import React, { useState } from 'react';
import { Volume2, Sliders, ShieldCheck, Radio, Music, Cpu, Sparkles, Activity } from 'lucide-react';
import { audioEngine } from '../audio/AudioEngine.js';
import { PlaylistQueue } from './PlaylistQueue.jsx';

export function GuestView({
  room,
  syncStats,
  buffering,
  bufferProgress = 0,
  driftCompensation = { rate: 1.0, status: 'locked', driftMs: 0 },
  currentDspProfile = 'flat',
  onSetDspProfile,
  onSetCustomEq,
  testPingActive,
  onAddTrack,
  onVoteSkip
}) {
  const [localVolume, setLocalVolume] = useState(1);
  const [eqGains, setEqGains] = useState({ low: 0, mid: 0, high: 0 });


  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setLocalVolume(val);
    audioEngine.setVolume(val);
  };

  const handleEqChange = (band, val) => {
    const updated = { ...eqGains, [band]: parseFloat(val) };
    setEqGains(updated);
    if (onSetCustomEq) onSetCustomEq(updated);
    else audioEngine.setEqGains(updated);
  };

  const currentDevice = room?.devices?.find((d) => d.id === room.hostSocketId ? false : true);
  const channelRole = currentDevice?.channel || 'mono';
  const drift = Math.abs(currentDevice?.drift || 0);

  const channelColor =
    channelRole === 'left' ? '#38bdf8' :
    channelRole === 'right' ? '#f59e0b' :
    channelRole === 'center' ? '#10b981' : '#cbd5e1';

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
            <div className="led-diode led-emerald" />
            <span className="tech-label">RECEIVER SYNCED</span>
          </div>
          <span className="tech-label" style={{ color: 'var(--text-main)' }}>
            ROOM {room.code}
          </span>
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

        {/* Sync Telemetry & Micro-Pitch Nudge Trim Readout (Phase 3.1) */}
        <div className="chassis-recessed" style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ textAlign: 'left' }}>
            <div className="tech-label">DRIFT METRIC</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 700, color: '#10b981' }}>
              ±{drift}ms
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

        {/* Buffering Progress Bar (Phase 3.3) */}
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

        {/* Track info banner */}
        <div className="chassis-recessed" style={{ padding: '12px 14px', textAlign: 'left', marginBottom: '16px' }}>
          <div className="tech-label" style={{ marginBottom: '4px' }}>BROADCAST TRACK</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', fontWeight: 600, fontSize: '0.88rem' }}>
            <Music size={15} color={channelColor} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {room.currentTrack ? (room.currentTrack.originalName || room.currentTrack.filename) : 'AWAITING TRACK...'}
            </span>
          </div>
        </div>

        {/* 3-Band Parametric Equalizer Faders (Phase 3.2) */}
        <div className="chassis-recessed" style={{ padding: '14px', textAlign: 'left', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span className="tech-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sliders size={12} /> 3-BAND HARDWARE DSP
            </span>
            <div style={{ display: 'flex', gap: '3px' }}>
              {['flat', 'subwoofer', 'vocal', 'bright'].map((prof) => (
                <button
                  key={prof}
                  type="button"
                  onClick={() => onSetDspProfile && onSetDspProfile(prof)}
                  style={{
                    padding: '3px 6px',
                    borderRadius: '4px',
                    border: currentDspProfile === prof ? '1px solid #10b981' : '1px solid var(--border-hardware)',
                    background: currentDspProfile === prof ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                    color: currentDspProfile === prof ? '#10b981' : 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    cursor: 'pointer'
                  }}
                >
                  {prof === 'subwoofer' ? 'SUB' : prof === 'vocal' ? 'VOX' : prof === 'bright' ? 'AIR' : 'FLAT'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', marginBottom: '3px' }}>
                <span style={{ color: 'var(--text-muted)' }}>LOW</span>
                <span style={{ color: '#10b981', fontWeight: 700 }}>{eqGains.low > 0 ? `+${eqGains.low}` : eqGains.low}dB</span>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={eqGains.low}
                onChange={(e) => handleEqChange('low', e.target.value)}
                style={{ width: '100%', accentColor: '#10b981', cursor: 'pointer' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', marginBottom: '3px' }}>
                <span style={{ color: 'var(--text-muted)' }}>MID</span>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>{eqGains.mid > 0 ? `+${eqGains.mid}` : eqGains.mid}dB</span>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={eqGains.mid}
                onChange={(e) => handleEqChange('mid', e.target.value)}
                style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', marginBottom: '3px' }}>
                <span style={{ color: 'var(--text-muted)' }}>HIGH</span>
                <span style={{ color: '#f59e0b', fontWeight: 700 }}>{eqGains.high > 0 ? `+${eqGains.high}` : eqGains.high}dB</span>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={eqGains.high}
                onChange={(e) => handleEqChange('high', e.target.value)}
                style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }}
              />
            </div>
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

      <div style={{ textAlign: 'center', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
        WAKE_LOCK ENGAGED &bull; CONTINUOUS DRIFT COMPENSATION ACTIVE
      </div>
    </div>

  );
}
