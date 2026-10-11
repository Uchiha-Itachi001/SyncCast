import React, { useRef, useState, useCallback } from 'react';
import { Volume2, Radio, Disc, Navigation } from 'lucide-react';

export function SpatialStage({
  devices = [],
  isPlaying = false,
  onUpdatePosition,
  onTestPing
}) {
  const stageRef = useRef(null);
  const [activeDragId, setActiveDragId] = useState(null);
  const [recentPings, setRecentPings] = useState(new Set());

  const handlePointerDown = (e, devId) => {
    e.stopPropagation();
    setActiveDragId(devId);
  };

  const handlePointerMove = useCallback((e) => {
    if (!activeDragId || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = rect.width / 2;

    // Normalize coordinates to -1 to 1 range (clamped to circle perimeter)
    const rawX = (e.clientX - centerX) / (radius * 0.85);
    const rawY = (centerY - e.clientY) / (radius * 0.85); // positive is front

    const dist = Math.sqrt(rawX * rawX + rawY * rawY);
    const scale = dist > 1 ? 1 / dist : 1;

    const normX = Math.round(rawX * scale * 100) / 100;
    const normY = Math.round(rawY * scale * 100) / 100;

    onUpdatePosition(activeDragId, { x: normX, y: normY });
  }, [activeDragId, onUpdatePosition]);

  const handlePointerUp = () => {
    setActiveDragId(null);
  };

  const triggerPing = (devId) => {
    onTestPing(devId);
    setRecentPings(prev => new Set(prev).add(devId));
    setTimeout(() => {
      setRecentPings(prev => {
        const next = new Set(prev);
        next.delete(devId);
        return next;
      });
    }, 800);
  };

  // Quick spatial layout presets
  const applyPreset = (preset) => {
    if (devices.length === 0) return;
    if (preset === 'stereo' && devices.length >= 2) {
      onUpdatePosition(devices[0].id, { x: -0.65, y: 0.5 });
      onUpdatePosition(devices[1].id, { x: 0.65, y: 0.5 });
    } else if (preset === 'trio' && devices.length >= 3) {
      onUpdatePosition(devices[0].id, { x: 0, y: 0.7 });
      onUpdatePosition(devices[1].id, { x: -0.7, y: 0.4 });
      onUpdatePosition(devices[2].id, { x: 0.7, y: 0.4 });
    } else if (preset === 'quad' && devices.length >= 4) {
      onUpdatePosition(devices[0].id, { x: -0.65, y: 0.5 });
      onUpdatePosition(devices[1].id, { x: 0.65, y: 0.5 });
      onUpdatePosition(devices[2].id, { x: -0.65, y: -0.5 });
      onUpdatePosition(devices[3].id, { x: 0.65, y: -0.5 });
    }
  };

  return (
    <div className="chassis-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className="tech-label">ACOUSTIC RADAR // PHASE 2</span>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '2px 0 0', letterSpacing: '-0.01em' }}>
            Spatial Soundstage Placement
          </h3>
        </div>

        {/* Layout Presets */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className="btn-hardware-secondary" onClick={() => applyPreset('stereo')} style={{ padding: '6px 10px', fontSize: '0.72rem' }}>
            2.0 Stereo
          </button>
          <button className="btn-hardware-secondary" onClick={() => applyPreset('trio')} style={{ padding: '6px 10px', fontSize: '0.72rem' }}>
            3.0 Front
          </button>
          <button className="btn-hardware-secondary" onClick={() => applyPreset('quad')} style={{ padding: '6px 10px', fontSize: '0.72rem' }}>
            4.0 Quad
          </button>
        </div>
      </div>

      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        Drag speaker nodes to match physical positions in your room. Channel roles auto-map based on angle relative to the center sweet spot.
      </div>

      {/* Radar Canvas Container */}
      <div
        ref={stageRef}
        className="radar-grid"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          width: '100%',
          maxWidth: '380px',
          aspectRatio: '1 / 1',
          margin: '0 auto',
          position: 'relative',
          overflow: 'hidden',
          touchAction: 'none',
          userSelect: 'none'
        }}
      >
        <div className="radar-sweep-arm" />

        {/* Concentric rings */}
        <div style={{ position: 'absolute', inset: '15%', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: '32%', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: '50%', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '50%', pointerEvents: 'none' }} />

        {/* Axis Crosshairs */}
        <div style={{ position: 'absolute', top: '50%', left: '0', right: '0', height: '1px', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '0', bottom: '0', left: '50%', width: '1px', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />

        {/* Cardinal Markers */}
        <span style={{ position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
          FRONT 0°
        </span>
        <span style={{ position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
          REAR 180°
        </span>
        <span style={{ position: 'absolute', top: '50%', left: '8px', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
          LEFT 270°
        </span>
        <span style={{ position: 'absolute', top: '50%', right: '8px', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
          RIGHT 90°
        </span>

        {/* Center Listener Sweet Spot */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid #38bdf8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 12px rgba(56, 189, 248, 0.3)',
            pointerEvents: 'none'
          }}
        >
          <Navigation size={14} color="#38bdf8" />
        </div>

        {/* Speaker Nodes */}
        {devices.map((dev) => {
          const pos = dev.position || { x: 0, y: 0.6 };
          // Convert normalized -1 to 1 coords to percentage (0% to 100%)
          const leftPercent = 50 + pos.x * 40;
          const topPercent = 50 - pos.y * 40;
          const isPinged = recentPings.has(dev.id);

          const channelColor =
            dev.channel === 'left' ? '#38bdf8' :
            dev.channel === 'right' ? '#f59e0b' :
            dev.channel === 'center' ? '#10b981' : '#94a3b8';

          return (
            <div
              key={dev.id}
              onPointerDown={(e) => handlePointerDown(e, dev.id)}
              style={{
                position: 'absolute',
                left: `${leftPercent}%`,
                top: `${topPercent}%`,
                transform: 'translate(-50%, -50%)',
                cursor: 'grab',
                zIndex: activeDragId === dev.id ? 20 : 10,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              {/* Ping ripple effect */}
              {isPinged && <div className="chirp-ripple" style={{ width: '48px', height: '48px', borderColor: channelColor }} />}

              {/* Node Body */}
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #181d26 0%, #0a0d12 100%)',
                  border: `2px solid ${channelColor}`,
                  boxShadow: isPinged ? `0 0 20px ${channelColor}` : '0 4px 10px rgba(0,0,0,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: channelColor,
                  transition: 'box-shadow 0.2s ease, transform 0.1s ease',
                  transform: activeDragId === dev.id ? 'scale(1.15)' : 'scale(1)'
                }}
              >
                {dev.channel === 'left' ? 'L' : dev.channel === 'right' ? 'R' : dev.channel === 'center' ? 'C' : 'M'}
              </div>

              {/* Label & Ping trigger */}
              <div
                style={{
                  background: 'rgba(10, 12, 16, 0.9)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  whiteSpace: 'nowrap'
                }}
              >
                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  {dev.name.split(' ')[0]}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerPing(dev.id);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '0',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    color: 'var(--text-muted)'
                  }}
                  title="Play acoustic test tone"
                >
                  <Volume2 size={11} color={channelColor} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
