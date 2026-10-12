import React from 'react';
import { Volume2, Sliders, CheckCircle2, Disc } from 'lucide-react';

export function ChannelStrip({
  device,
  index,
  onAssignChannel,
  onTestPing,
  onSetDspProfile
}) {
  const drift = Math.abs(device.drift || 0);
  const bufferProgress = device.bufferProgress || (device.buffered ? 100 : 0);

  // 8-segment VU meter calculation
  const totalSegments = 8;
  const activeSegments = drift <= 5 ? 8 : drift <= 12 ? 6 : drift <= 20 ? 4 : 2;

  const channelColor =
    device.channel === 'left' ? '#38bdf8' :
    device.channel === 'right' ? '#f59e0b' :
    device.channel === 'center' ? '#10b981' : '#94a3b8';

  const dspProfile = device.dspProfile || 'flat';

  return (
    <div
      className="chassis-panel"
      style={{
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        borderLeft: `3px solid ${channelColor}`
      }}
    >
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="tech-label">CH-0{index + 1}</span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                fontWeight: 700,
                color: channelColor,
                textTransform: 'uppercase'
              }}
            >
              // {device.channel}
            </span>
          </div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '2px', color: 'var(--text-main)' }}>
            {device.name}
          </div>
        </div>

        {/* Sync Drift Tag */}
        <div style={{ textAlign: 'right' }}>
          <div className="tech-label">DRIFT METRIC</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, color: drift <= 5 ? '#10b981' : drift <= 15 ? '#38bdf8' : '#f59e0b' }}>
            ±{typeof drift === 'number' ? drift.toFixed(1) : drift}ms
          </div>
        </div>
      </div>

      {/* Latency / Sync LED VU Meter */}
      <div className="chassis-recessed" style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="tech-label" style={{ fontSize: '0.62rem' }}>SYNC FIDELITY</span>
        <div className="vu-meter-bar">
          {Array.from({ length: totalSegments }).map((_, i) => {
            const isActive = i < activeSegments;
            const isWarning = i >= 6;
            const cls = !isActive
              ? 'vu-segment'
              : isWarning
              ? 'vu-segment active-red'
              : i >= 4
              ? 'vu-segment active-amber'
              : 'vu-segment active-green';
            return <div key={i} className={cls} />;
          })}
        </div>
      </div>

      {/* Hardware Channel Selector Dial */}
      <div>
        <div className="tech-label" style={{ marginBottom: '6px' }}>CHANNEL MATRIX</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
          {['left', 'center', 'right', 'mono'].map((mode) => {
            const isSelected = (device.channel || 'mono') === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onAssignChannel(device.id, mode)}
                style={{
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: isSelected ? '1px solid #38bdf8' : '1px solid var(--border-hardware)',
                  background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'rgba(0,0,0,0.3)',
                  color: isSelected ? '#38bdf8' : 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.1s ease'
                }}
              >
                {mode === 'left' ? 'L' : mode === 'right' ? 'R' : mode === 'center' ? 'CTR' : 'MONO'}
              </button>
            );
          })}
        </div>
      </div>

      {/* DSP Parametric Profile Selector (Phase 3.2) */}
      <div>
        <div className="tech-label" style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Sliders size={11} /> DSP ACOUSTIC PROFILE
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
          {[
            { id: 'flat', label: 'FLAT' },
            { id: 'subwoofer', label: 'SUB' },
            { id: 'vocal', label: 'VOX' },
            { id: 'bright', label: 'AIR' }
          ].map((prof) => {
            const isSelected = dspProfile === prof.id;
            return (
              <button
                key={prof.id}
                type="button"
                onClick={() => onSetDspProfile && onSetDspProfile(prof.id, device.id)}
                style={{
                  padding: '5px 2px',
                  borderRadius: '5px',
                  border: isSelected ? '1px solid #10b981' : '1px solid var(--border-hardware)',
                  background: isSelected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(0,0,0,0.25)',
                  color: isSelected ? '#10b981' : 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.1s ease'
                }}
              >
                {prof.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic Buffer Progress Bar (Phase 3.3) */}
      {!device.buffered && (
        <div className="chassis-recessed" style={{ padding: '6px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span className="tech-label" style={{ fontSize: '0.6rem', color: '#f59e0b' }}>LAN BUFFERING</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b' }}>{bufferProgress}%</span>
          </div>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${bufferProgress}%`, height: '100%', background: '#f59e0b', transition: 'width 0.2s ease' }} />
          </div>
        </div>
      )}

      {/* Bottom Bar: Test Ping + Buffer Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
        <button
          type="button"
          className="btn-hardware-secondary"
          onClick={() => onTestPing(device.id)}
          style={{ padding: '6px 10px', fontSize: '0.72rem' }}
        >
          <Volume2 size={13} color="#38bdf8" /> Ping Test
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
          {device.buffered ? (
            <>
              <div className="led-diode led-emerald" />
              <span style={{ color: '#10b981' }}>BUF READY</span>
            </>
          ) : (
            <>
              <div className="led-diode led-amber" />
              <span style={{ color: '#f59e0b' }}>STREAMING</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
