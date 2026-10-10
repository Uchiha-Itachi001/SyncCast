import React from 'react';
import { Volume2 } from 'lucide-react';

export function AudioUnlockBanner({ isUnlocked, onUnlock }) {
  if (isUnlocked) return null;

  return (
    <div
      className="chassis-panel"
      style={{
        margin: '0 16px 16px',
        padding: '12px 18px',
        border: '1px solid #f59e0b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        background: 'rgba(245, 158, 11, 0.05)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div className="led-diode led-amber" />
        <div>
          <div className="tech-label" style={{ color: '#f59e0b' }}>
            BROWSER AUTOPLAY RESTRICTION
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
            Tap to engage Web Audio hardware clock for sample-accurate scheduling.
          </span>
        </div>
      </div>
      <button
        type="button"
        className="btn-hardware-primary"
        onClick={onUnlock}
        style={{ padding: '8px 14px', fontSize: '0.75rem', borderColor: '#f59e0b', color: '#f59e0b' }}
      >
        <Volume2 size={14} /> UNMUTE TRANSDUCER
      </button>
    </div>
  );
}
