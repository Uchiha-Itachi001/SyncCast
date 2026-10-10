import React from 'react';
import { Volume2, VolumeX, BellRing } from 'lucide-react';

export function AudioUnlockBanner({ isUnlocked, onUnlock, onTestSound }) {
  if (isUnlocked) return null;

  return (
    <div
      className="chassis-panel"
      style={{
        margin: '0 16px 16px',
        padding: '14px 18px',
        border: '1px solid #f59e0b',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        background: 'rgba(245, 158, 11, 0.08)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div className="led-diode led-amber" />
        <div>
          <div className="tech-label" style={{ color: '#f59e0b', fontWeight: 800 }}>
            SPEAKER HARDWARE LOCKED (BROWSER AUTOPLAY POLICY)
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', display: 'block', marginTop: '2px' }}>
            Tap button below to unlock audio. <strong style={{ color: '#fbbf24' }}>iPhone users:</strong> Flip the physical Silent switch on side of phone to ring.
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {onTestSound && (
          <button
            type="button"
            className="btn-hardware-secondary"
            onClick={onTestSound}
            style={{ padding: '8px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <BellRing size={14} color="#38bdf8" /> TEST BEEP
          </button>
        )}
        <button
          type="button"
          className="btn-hardware-primary"
          onClick={onUnlock}
          style={{ padding: '8px 16px', fontSize: '0.75rem', borderColor: '#f59e0b', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Volume2 size={14} /> UNMUTE TRANSDUCER
        </button>
      </div>
    </div>
  );
}
