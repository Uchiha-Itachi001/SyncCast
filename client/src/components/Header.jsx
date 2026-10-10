import React from 'react';
import { Radio, Wifi, WifiOff, Users, Activity, LogOut } from 'lucide-react';

export function Header({ connected, roomCode, deviceCount, onLeaveRoom }) {
  return (
    <header className="chassis-panel" style={{ margin: '14px 16px 20px', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'linear-gradient(135deg, #18202f 0%, #0c0f14 100%)', border: '1px solid #38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 10px rgba(56, 189, 248, 0.25)' }}>
          <Radio size={18} color="#38bdf8" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '0.04em', margin: 0, fontFamily: 'var(--font-mono)' }}>
              SYNCCAST
            </h1>
            <span style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
              v2.0 // SPATIAL
            </span>
          </div>
          <p className="tech-label" style={{ fontSize: '0.65rem', margin: 0 }}>
            LAN DISTRIBUTED AUDIO ARRAY &bull; SUB-20MS NTP CLOCK
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {roomCode && (
          <div className="chassis-recessed" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px' }}>
            <span className="tech-label" style={{ color: '#38bdf8' }}>CH</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.1em' }}>
              {roomCode}
            </span>
            {deviceCount > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '4px' }}>
                <Users size={12} /> {deviceCount}
              </span>
            )}
          </div>
        )}

        {roomCode && onLeaveRoom && (
          <button
            type="button"
            onClick={onLeaveRoom}
            className="btn-hardware-secondary"
            style={{
              padding: '6px 12px',
              fontSize: '0.72rem',
              color: '#fda4af',
              borderColor: 'rgba(244, 63, 94, 0.35)',
              background: 'rgba(244, 63, 94, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Disconnect and leave this room"
          >
            <LogOut size={13} color="#f43f5e" /> EXIT ROOM
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
          {connected ? (
            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div className="led-diode led-emerald" /> LAN ONLINE
            </span>
          ) : (
            <span style={{ color: '#f43f5e', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div className="led-diode led-rose" /> OFFLINE
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
