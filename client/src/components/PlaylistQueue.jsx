import React, { useState } from 'react';
import {
  Music,
  Plus,
  Trash2,
  SkipForward,
  Globe,
  Upload,
  Radio,
  Vote,
  Check,
  Link2,
  ChevronDown,
  ChevronUp,
  Disc
} from 'lucide-react';

export function PlaylistQueue({
  playlist = [],
  currentTrack = null,
  isHost = false,
  skipVotesCount = 0,
  requiredSkipVotes = 1,
  onAddTrack,
  onRemoveTrack,
  onNextTrack,
  onVoteSkip,
  buffering = false
}) {
  const [showAddBay, setShowAddBay] = useState(false);
  const [activeTab, setActiveTab] = useState('file'); // 'file' | 'url'
  const [urlInput, setUrlInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleFileSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onAddTrack(selectedFile, false);
      setSelectedFile(null);
      setShowAddBay(false);
    } catch (err) {
      console.error('Queue file upload failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUrlSubmit = async (e) => {
    e.preventDefault();
    if (!urlInput.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const trimmed = urlInput.trim();
      const isYt = trimmed.includes('youtube.com') || trimmed.includes('youtu.be');
      await onAddTrack(trimmed, !isYt, titleInput.trim(), isYt);
      setUrlInput('');
      setTitleInput('');
      setShowAddBay(false);
    } catch (err) {
      console.error('Queue URL submission failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVote = () => {
    if (onVoteSkip) {
      onVoteSkip();
      setHasVoted(true);
      setTimeout(() => setHasVoted(false), 3000);
    }
  };

  return (
    <div className="chassis-panel" style={{ padding: '20px' }}>
      {/* Rack Telemetry Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="led-diode led-cyan" />
            <span className="tech-label">DEMOCRATIC PLAYLIST RACK</span>
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '2px 0 0', letterSpacing: '-0.01em' }}>
            Collaborative Queue ({playlist.length})
          </h3>
        </div>

        {/* Action Controls Cluster */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          {/* Vote-to-Skip Button */}
          {currentTrack && (
            <button
              type="button"
              className="btn-hardware-secondary"
              onClick={handleVote}
              title="Cast vote to skip currently playing track"
              style={{
                fontSize: '0.72rem',
                padding: '8px 12px',
                borderColor: hasVoted ? 'var(--accent-amber)' : undefined
              }}
            >
              <Vote size={14} color={skipVotesCount > 0 ? '#f59e0b' : 'currentColor'} />
              <span>
                VOTE SKIP ({skipVotesCount}/{requiredSkipVotes})
              </span>
              {hasVoted && <Check size={12} color="#10b981" />}
            </button>
          )}

          {/* Host Fast Next Track */}
          {isHost && playlist.length > 0 && (
            <button
              type="button"
              className="btn-hardware-secondary"
              onClick={onNextTrack}
              title="Master Host override to play next track"
              style={{ fontSize: '0.72rem', padding: '8px 12px' }}
            >
              <SkipForward size={14} />
              NEXT
            </button>
          )}

          {/* Toggle Add Track Bay */}
          <button
            type="button"
            className={showAddBay ? 'btn-hardware-secondary' : 'btn-hardware-primary'}
            onClick={() => setShowAddBay(!showAddBay)}
            style={{ fontSize: '0.72rem', padding: '8px 14px' }}
          >
            {showAddBay ? <ChevronUp size={14} /> : <Plus size={14} />}
            {showAddBay ? 'CLOSE BAY' : 'ADD TRACK'}
          </button>
        </div>
      </div>

      {/* Collapsible Track Ingestion Bay */}
      {showAddBay && (
        <div
          className="chassis-recessed"
          style={{
            padding: '16px',
            marginBottom: '16px',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            animation: 'fadeIn 0.15s ease'
          }}
        >
          {/* Mode Switcher Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('file')}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: activeTab === 'file' ? '#1e293b' : 'transparent',
                border: `1px solid ${activeTab === 'file' ? '#38bdf8' : 'var(--border-hardware)'}`,
                borderRadius: '6px',
                color: activeTab === 'file' ? '#38bdf8' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <Upload size={14} /> LOCAL AUDIO FILE
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('url')}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: activeTab === 'url' ? '#1e293b' : 'transparent',
                border: `1px solid ${activeTab === 'url' ? '#38bdf8' : 'var(--border-hardware)'}`,
                borderRadius: '6px',
                color: activeTab === 'url' ? '#38bdf8' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <Globe size={14} /> DIRECT HTTP STREAM
            </button>
          </div>

          {/* Tab 1: Local File Upload */}
          {activeTab === 'file' && (
            <form onSubmit={handleFileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                style={{
                  border: '1px dashed var(--border-hardware)',
                  borderRadius: '6px',
                  padding: '16px',
                  textAlign: 'center',
                  background: 'rgba(0,0,0,0.2)'
                }}
              >
                <input
                  id="playlist-file-input"
                  type="file"
                  accept="audio/*"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <label
                  htmlFor="playlist-file-input"
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Music size={22} color="var(--text-muted)" />
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    {selectedFile ? selectedFile.name : 'Choose Audio File (.MP3, .WAV, .FLAC)'}
                  </span>
                  <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                    {selectedFile ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB` : 'TAP TO BROWSE DEVICE'}
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-hardware-secondary"
                  onClick={() => {
                    setSelectedFile(null);
                    setShowAddBay(false);
                  }}
                  style={{ fontSize: '0.72rem', padding: '8px 12px' }}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={!selectedFile || isSubmitting}
                  className="btn-hardware-primary"
                  style={{
                    fontSize: '0.72rem',
                    padding: '8px 16px',
                    opacity: !selectedFile || isSubmitting ? 0.5 : 1
                  }}
                >
                  {isSubmitting ? 'BUFFERING...' : 'ENQUEUE MASTER'}
                </button>
              </div>
            </form>
          )}

          {/* Tab 2: Direct HTTP Stream URL */}
          {activeTab === 'url' && (
            <form onSubmit={handleUrlSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label className="tech-label" style={{ display: 'block', marginBottom: '4px' }}>
                  STREAM AUDIO URL (HTTP/HTTPS)
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://example.com/audio/live-stream.mp3"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#090b0e',
                    border: '1px solid var(--border-hardware)',
                    color: 'var(--text-main)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.78rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label className="tech-label" style={{ display: 'block', marginBottom: '4px' }}>
                  CALLSIGN / TRACK TITLE (OPTIONAL)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Synthwave FM Relay"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#090b0e',
                    border: '1px solid var(--border-hardware)',
                    color: 'var(--text-main)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.78rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  className="btn-hardware-secondary"
                  onClick={() => {
                    setUrlInput('');
                    setTitleInput('');
                    setShowAddBay(false);
                  }}
                  style={{ fontSize: '0.72rem', padding: '8px 12px' }}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={!urlInput.trim() || isSubmitting}
                  className="btn-hardware-primary"
                  style={{
                    fontSize: '0.72rem',
                    padding: '8px 16px',
                    opacity: !urlInput.trim() || isSubmitting ? 0.5 : 1
                  }}
                >
                  {isSubmitting ? 'PROXIED RELAY...' : 'INGEST STREAM'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Playlist Tracks List */}
      {playlist.length === 0 ? (
        <div
          className="chassis-recessed"
          style={{
            padding: '24px 16px',
            textAlign: 'center',
            border: '1px dashed var(--border-hardware)'
          }}
        >
          <Disc size={26} color="var(--text-dim)" style={{ margin: '0 auto 8px' }} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            QUEUE VACANT &bull; NO TRACKS STAGED
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', margin: '4px 0 0' }}>
            Any connected phone can tap &quot;ADD TRACK&quot; above to contribute an audio file or web stream.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {playlist.map((track, idx) => {
            const isCurrent = currentTrack && currentTrack.id === track.id;

            return (
              <div
                key={track.id || idx}
                className="chassis-recessed"
                style={{
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  border: isCurrent ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(0,0,0,0.5)',
                  background: isCurrent ? 'rgba(16, 185, 129, 0.04)' : undefined
                }}
              >
                {/* Left Track Index & Title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: isCurrent ? '#10b981' : 'var(--text-dim)',
                      minWidth: '24px'
                    }}
                  >
                    #{String(idx + 1).padStart(2, '0')}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isCurrent && <div className="led-diode led-emerald" />}
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '0.86rem',
                          color: isCurrent ? '#fff' : 'var(--text-main)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {track.originalName || track.filename || 'Audio Track'}
                      </span>
                      {isCurrent && (
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontFamily: 'var(--font-mono)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            fontWeight: 700
                          }}
                        >
                          ACTIVE
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        fontSize: '0.68rem',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-dim)',
                        marginTop: '2px'
                      }}
                    >
                      <span>
                        SOURCE: {track.isStream ? 'URL STREAM' : 'LOCAL FILE'}
                      </span>
                      <span>&bull;</span>
                      <span>
                        REQUESTER: {track.addedBy || 'PEER'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {isHost && (
                    <button
                      type="button"
                      onClick={() => onRemoveTrack(track.id)}
                      title="Remove track from queue"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-dim)',
                        cursor: 'pointer',
                        padding: '6px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 0.1s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#f43f5e')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
