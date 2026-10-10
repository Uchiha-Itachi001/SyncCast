import React, { useState } from 'react';
import { LogIn, Sparkles, Smartphone, Delete } from 'lucide-react';

export function RoomLobby({ onCreateRoom, onJoinRoom, error }) {
  const [activeTab, setActiveTab] = useState('join'); // 'join' | 'create'
  const [roomCode, setRoomCode] = useState('');
  const [deviceName, setDeviceName] = useState(
    /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'iPhone Node' :
    /Android/.test(navigator.userAgent) ? 'Android Node' : 'Workstation Node'
  );

  const handleKeypadPress = (val) => {
    if (val === 'del') {
      setRoomCode(prev => prev.slice(0, -1));
    } else if (roomCode.length < 4) {
      setRoomCode(prev => prev + val);
    }
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (roomCode.trim().length === 4) {
      onJoinRoom(roomCode.trim(), deviceName);
    }
  };

  const handleCreate = (e) => {
    e.preventDefault();
    onCreateRoom(deviceName);
  };

  return (
    <div style={{ maxWidth: '440px', margin: '30px auto', padding: '0 16px' }}>
      <div className="chassis-panel" style={{ padding: '24px' }}>
        {/* Hardware Mode Switch */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', background: 'var(--bg-recessed)', padding: '4px', borderRadius: '8px', marginBottom: '24px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('join')}
            style={{
              padding: '10px',
              border: activeTab === 'join' ? '1px solid #38bdf8' : 'none',
              borderRadius: '6px',
              background: activeTab === 'join' ? '#18202f' : 'transparent',
              color: activeTab === 'join' ? '#38bdf8' : 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <LogIn size={15} /> SATELLITE JOIN
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            style={{
              padding: '10px',
              border: activeTab === 'create' ? '1px solid #38bdf8' : 'none',
              borderRadius: '6px',
              background: activeTab === 'create' ? '#18202f' : 'transparent',
              color: activeTab === 'create' ? '#38bdf8' : 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <Sparkles size={15} /> HOST CONSOLE
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid var(--accent-rose)', color: '#fda4af', padding: '10px 14px', borderRadius: '8px', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', marginBottom: '18px' }}>
            [ERROR] {error}
          </div>
        )}

        {activeTab === 'join' ? (
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <span className="tech-label" style={{ display: 'block', marginBottom: '8px' }}>
                4-DIGIT FREQUENCY CODE
              </span>

              {/* 4-Box Digital Readout */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
                {[0, 1, 2, 3].map((idx) => {
                  const char = roomCode[idx] || '';
                  return (
                    <div
                      key={idx}
                      className="chassis-recessed"
                      style={{
                        height: '56px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '1.8rem',
                        fontWeight: 900,
                        color: char ? '#38bdf8' : 'var(--text-dim)',
                        border: idx === roomCode.length ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)'
                      }}
                    >
                      {char || '·'}
                    </div>
                  );
                })}
              </div>

              {/* Mobile Tactile Keypad */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '12px' }}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key, i) => {
                  if (key === '') return <div key={i} />;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleKeypadPress(key)}
                      className="btn-hardware-secondary"
                      style={{
                        height: '46px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '1.1rem',
                        fontWeight: 700
                      }}
                    >
                      {key === 'del' ? <Delete size={18} /> : key}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="tech-label" style={{ display: 'block', marginBottom: '6px' }}>
                DEVICE CALLSIGN
              </span>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="chassis-recessed"
                style={{
                  width: '100%',
                  padding: '12px',
                  color: '#fff',
                  fontSize: '0.88rem',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none'
                }}
                required
              />
            </div>

            <button
              type="submit"
              className="btn-hardware-primary"
              disabled={roomCode.length !== 4}
              style={{
                width: '100%',
                padding: '14px',
                marginTop: '6px',
                opacity: roomCode.length === 4 ? 1 : 0.4
              }}
            >
              LOCK &amp; CONNECT SPEAKER
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <span className="tech-label" style={{ display: 'block', marginBottom: '6px' }}>
                HOST CALLSIGN
              </span>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="chassis-recessed"
                style={{
                  width: '100%',
                  padding: '12px',
                  color: '#fff',
                  fontSize: '0.88rem',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none'
                }}
                required
              />
            </div>

            <div className="chassis-recessed" style={{ padding: '14px', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              This phone coordinates room timing via Socket.io NTP. Broadcasts target timestamps so all joined speaker nodes fire in lockstep.
            </div>

            <button type="submit" className="btn-hardware-primary" style={{ width: '100%', padding: '14px', marginTop: '6px' }}>
              INITIALIZE MASTER CONSOLE
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
