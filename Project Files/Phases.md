# SyncCast — Architecture & Development Phases

**Author:** Pankoj Roy  
**Project:** SyncCast (Multi-Device Synced Audio System over LAN)  
**Target Precision:** &lt;20ms cross-device audio drift  
**Architecture Spec:** Clean Layered Architecture (`models`, `services`, `audio`, `socket`, `components`, `hooks`)

---

## Executive Roadmap Overview

SyncCast transforms multiple phones connected to the same local WiFi network into a distributed, synchronized speaker array without requiring native app store downloads.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SyncCast Roadmap Pipeline                       │
├──────────────────┬──────────────────┬──────────────────┬───────────────┤
│     Phase 1      │     Phase 2      │     Phase 3      │    Phase 4    │
│  LAN Mono Sync   │ Spatial Sound    │  Acoustic Tuning │ Shared Queue  │
│  & NTP Protocol  │ & Surround Stage │  & Resilience    │ & Persistence │
│     [ACTIVE]     │     [PLANNED]    │    [PLANNED]     │   [ROADMAP]   │
└──────────────────┴──────────────────┴──────────────────┴───────────────┘
```

---

## Phase 1 — Core Foundation: LAN Mono Sync Engine & PWA (MVP)

**Objective:** Deliver synchronized audio playback across 2–6 devices with under 20ms drift, running entirely within mobile browsers on a local WiFi network.

### 1.1 Backend Coordination & Network Discovery
- [x] **Modular Express + Socket.io Server**: Lightweight local daemon listening on `0.0.0.0` to permit LAN communication.
- [x] **Local IPv4 Discovery**: Auto-detect host IP on WiFi interface to construct direct guest join URLs without manual IP entry.
- [x] **In-Memory Room State Store** ([Room.js](file:///d:/coding/Project/SyncCast/server/src/models/Room.js)): Manages room lifecycle, device metadata, buffer confirmation flags, and playback triggers.
- [x] **Static Audio Delivery API** ([audioRoutes.js](file:///d:/coding/Project/SyncCast/server/src/routes/audioRoutes.js)): Multer-powered upload and static byte streaming endpoint ensuring all devices fetch the identical audio file for local decoding.

### 1.2 NTP Emulation & Clock Synchronization Protocol
- [x] **Sub-millisecond Ping-Pong Engine** ([clockSyncService.js](file:///d:/coding/Project/SyncCast/server/src/services/clockSyncService.js)):
  1. Client sends $t_0$ timestamp.
  2. Server responds with $t_1$ server timestamp.
  3. Client receives packet at $t_2$.
  4. Round-Trip Time $RTT = (t_2 - t_0)$; Estimated Offset $\theta = t_1 - \frac{t_0 + t_2}{2}$.
- [x] **Network Jitter Rejection**: Run 10 initial calibration pings, sort by ascending RTT, discard top 40% WiFi jitter spikes, and average remaining low-latency samples.
- [x] **Scheduled Playback Trigger**: Host initiates playback $\rightarrow$ Server broadcasts target start time $T = \text{serverTime} + 2000\text{ms}$. Every device calculates local start delay $\Delta t = (T - \theta) - \text{clientTime}$.

### 1.3 Web Audio API Sample-Accurate Playback Engine
- [x] **Bit-for-Bit Pre-Buffering** ([AudioEngine.js](file:///d:/coding/Project/SyncCast/client/src/audio/AudioEngine.js)): Avoid live streaming jitter by downloading entire audio files and decoding via `AudioContext.decodeAudioData`.
- [x] **Hardware AudioContext Clock Scheduling**: Use `sourceNode.start(audioContext.currentTime + delaySeconds, offset)` rather than non-deterministic JavaScript timers (`setTimeout`/`setInterval`).
- [x] **iOS Safari Autoplay Unlock** ([AudioUnlockBanner.jsx](file:///d:/coding/Project/SyncCast/client/src/components/AudioUnlockBanner.jsx)): Explicit user-interaction resume protocol to satisfy strict iOS media policies.

### 1.4 PWA Interface & Onboarding
- [x] **Responsive Mobile UI**: Sleek dark-mode aesthetic with custom audio design tokens, zero-clutter glass panels, and Lucide icons.
- [x] **QR Code & Short Code Onboarding**: Host displays dynamic SVG QR code containing the room link; guests scan or type 4-digit numeric code.
- [x] **Screen Wake Lock API** ([useWakeLock.js](file:///d:/coding/Project/SyncCast/client/src/hooks/useWakeLock.js)): Prevents mobile screens from locking and throttling audio scheduling threads.

**Phase 1 Acceptance Criteria:**
- Room created and joined in &lt;15 seconds via QR code scan.
- Playback trigger starts concurrently on 3 test phones with &lt;20ms audible drift.
- Audio plays without interruptions or iOS autoplay blocks.

---

## Phase 2 — Multi-Device Spatial & Surround Sound Stage

**Objective:** Split audio channels across physical phones to create a true multi-speaker soundstage (Left, Right, Center, Mono).

### 2.1 Web Audio Spatial Routing Matrix
- [x] **ChannelSplitterNode Integration** ([ChannelRouter.js](file:///d:/coding/Project/SyncCast/client/src/audio/ChannelRouter.js)):
  ```
  Stereo Audio Buffer
          │
          ▼
  ChannelSplitterNode (2 Channels)
   ├── Channel 0 [Left]  ──► ChannelMergerNode ──► GainNode ──► Output (Left Nodes)
   └── Channel 1 [Right] ──► ChannelMergerNode ──► GainNode ──► Output (Right Nodes)
  ```
- [x] **Dynamic Channel Modes**:
  - `Mono`: Full stereo mixdown played on all devices for maximum combined room volume.
  - `Left`: Isolates left channel and plays through both phone speakers.
  - `Right`: Isolates right channel and plays through both phone speakers.
  - `Center`: $(L + R) / 2$ centered vocal downmix.

### 2.2 Visual Soundstage Positioning & Acoustic Radar
- [x] **Interactive Soundstage Visualizer** ([SpatialStage.jsx](file:///d:/coding/Project/SyncCast/client/src/components/SpatialStage.jsx)): 2D drag-and-drop acoustic radar displaying concentric distance rings, listener sweet spot crosshair, and draggable speaker nodes.
- [x] **Auto-Channel Recommendation & Presets**: Dynamic coordinate-based channel calculation and rapid layout presets:
  - 2.0 Stereo Pair: Left (-0.65, 0.5) + Right (0.65, 0.5).
  - 3.0 Front Trio: Center (0, 0.7) + Left (-0.7, 0.4) + Right (0.7, 0.4).
  - 4.0 Quad Surround: Front Left/Right + Rear Left/Right.
- [x] **Hardware Test Chirp Generator**: Synthesizes localized identification tones (880Hz / 1200Hz / 660Hz) with visual ripple animation on physical target phones.
- [x] **Tactile Hardware Mixer Console** ([ChannelStrip.jsx](file:///d:/coding/Project/SyncCast/client/src/components/ChannelStrip.jsx)): Replaced generic cards with industrial channel strips, 8-segment LED sync VU meters, and tactile 4-way channel selectors.

**Phase 2 Acceptance Criteria:**
- [x] Host can reassign a phone's role on the fly with seamless audio graph reconnection.
- [x] Stereo separation clearly audible with left and right channels isolated on separate devices.
- [x] Tactile Hi-Fi audio hardware styling replaces all AI-slop generic card layouts.

---

## Phase 3 — Acoustic Tuning, Drift Compensation & Resilience

**Objective:** Maintain long-duration sync lock across 10+ minute tracks and allow per-device acoustic optimization.

### 3.1 Continuous Drift Monitoring & Micro-Rate Pitch Nudging
- [x] **Background Drift Ping Loop** ([ClockSynchronizer.js](file:///d:/coding/Project/SyncCast/client/src/audio/ClockSynchronizer.js)): Periodic 4-second NTP drift monitoring ping loop during playback.
- [x] **Seamless PlaybackRate Modulation** ([AudioEngine.js](file:///d:/coding/Project/SyncCast/client/src/audio/AudioEngine.js)):
  - Deadband ($|drift| \le 3\text{ms}$): Exact $1.0\times$ locked rate.
  - Micro-nudge ($4\text{--}20\text{ms}$): Smooth $\pm0.15\%$ `sourceNode.playbackRate` adjustment via linear ramp over 1.2s to pull devices inaudibly into lockstep.
  - Fast recovery ($20\text{--}40\text{ms}$): $\pm0.4\%$ speed trim until drift is resolved.
  - Dropout protection ($>40\text{ms}$): Seamless re-sync trigger.
- [x] **Live Micro-Pitch Trim Display** ([GuestView.jsx](file:///d:/coding/Project/SyncCast/client/src/components/GuestView.jsx)): Telemetry readout showing active playback trim (e.g. `1.0015x [NUDGE]`).

### 3.2 Per-Device Parametric Equalization (DSP)
- [x] **3-Band BiquadFilterNode Chain** ([ParametricEqualizer.js](file:///d:/coding/Project/SyncCast/client/src/audio/ParametricEqualizer.js)):
  - Low Shelf filter (140Hz) for bass response.
  - Peaking filter (1.6kHz, $Q=1.0$) for vocal clarity.
  - High Shelf filter (7.5kHz) for high-end sparkle.
- [x] **Acoustic Presets & Role Selection**:
  - `Flat`: Neutral baseline response.
  - `Subwoofer`: $+8\text{dB}$ Low Shelf boost with high cut for dedicated bass node phones.
  - `Vocal`: $+5.5\text{dB}$ Mid boost for center dialogue/speech.
  - `Bright / Air`: $+6.5\text{dB}$ High Shelf for ambient sparkle.
- [x] **Tactile Hardware DSP Faders**: In-app 3-band sliders and quick profile selectors on [GuestView.jsx](file:///d:/coding/Project/SyncCast/client/src/components/GuestView.jsx) and [ChannelStrip.jsx](file:///d:/coding/Project/SyncCast/client/src/components/ChannelStrip.jsx).

### 3.3 Dynamic Buffer Sizing & Pre-fetch
- [x] **Chunked Stream Progress Tracking** ([AudioEngine.js](file:///d:/coding/Project/SyncCast/client/src/audio/AudioEngine.js)): Uses `ReadableStream` chunked reader with `content-length` byte calculation.
- [x] **Real-time Buffering Meter**: Live 0–100% progress bars on all guest phones and host mixer channel strips.

**Phase 3 Acceptance Criteria:**
- [x] Continuous playback maintains &lt;15ms drift without user intervention.
- [x] Rate adjustments are smooth and inaudible to human listeners ($\pm0.15\%$ micro-nudge).
- [x] Parametric DSP equalizer active per node with custom profiles (Flat, Subwoofer, Vocal, Bright).

---

## Phase 4 — Shared Queue & Extended Ecosystem

**Objective:** Add democratic playlist management, stream ingestion, and persistent room recovery.

### 4.1 Collaborative Playlist Queue
- [x] **Democratic Queue** ([PlaylistQueue.jsx](file:///d:/coding/Project/SyncCast/client/src/components/PlaylistQueue.jsx)): Any connected peer (host or guest) can enqueue local audio files or direct HTTP/S streams into the room playlist.
- [x] **Vote to Skip** ([Room.js](file:///d:/coding/Project/SyncCast/server/src/models/Room.js)): Democratic majority vote ($\lceil N/2 \rceil$) to skip currently playing track with real-time UI counters.

### 4.2 Reconnection & Host Migration
- [x] **Heartbeat & Graceful Reconnect** ([roomService.js](file:///d:/coding/Project/SyncCast/server/src/services/roomService.js), [useSyncCast.js](file:///d:/coding/Project/SyncCast/client/src/hooks/useSyncCast.js)): 15-second grace window allowing briefly dropped phones (screen locks or WiFi blips) to seamlessly reconnect with session storage without losing sync or interrupting other nodes.
- [x] **Host Migration** ([Room.js](file:///d:/coding/Project/SyncCast/server/src/models/Room.js), [socketHandler.js](file:///d:/coding/Project/SyncCast/server/src/socket/socketHandler.js)): When the host phone battery dies or disconnects beyond the grace period, room ownership seamlessly migrates to the oldest connected guest phone with a live telemetry alert banner.

### 4.3 Direct URL & Stream Decoding
- [x] **Direct Stream Ingestion & Audio Proxy** ([audioRoutes.js](file:///d:/coding/Project/SyncCast/server/src/routes/audioRoutes.js), [apiService.js](file:///d:/coding/Project/SyncCast/client/src/services/apiService.js)): Added SSRF-filtered LAN audio proxy endpoint to bypass CORS and feed external HTTP/S audio streams directly into Web Audio chunked buffers.

**Phase 4 Acceptance Criteria:**
- [x] Any guest can upload or paste a direct stream URL to append to the master playlist queue.
- [x] Democratic vote-to-skip advances the queue once $\lceil N / 2 \rceil$ peers vote.
- [x] 15-second grace period protects against temporary mobile dropouts; host migration activates if host leaves permanently.

---

## Phase 5 — Production Hardening & PWA Offline Ecosystem

**Objective:** PWA installability, service worker caching, and multi-network resilience.

### 5.1 Web App Manifest & Service Worker
- [ ] **Web App Manifest**: Full standalone PWA install metadata with custom Hi-Fi app icons and theme color tokens.
- [ ] **Service Worker Asset Caching**: Pre-cache core client application bundles so receivers load instantly even on congested LAN networks.

### 5.2 Network Diagnostic Suite & Benchmarks
- [ ] **Automated Clock Jitter Test Harness**: Interactive ping latency and offset variance benchmark view.
- [ ] **Dual-Device Impulse Oscilloscope Test Tool**: Visual waveform flash trigger to verify sub-20ms visual synchronization.

---

## Verification & Testing Quality Gates

| Phase | Metric / Gate | Validation Target | Tooling |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Clock Offset Precision | Standard deviation &lt; 5ms | Socket.io NTP test harness |
| **Phase 1** | Playback Start Delay | Aligned within &lt; 20ms | Dual-mic oscilloscope / visual impulse test |
| **Phase 1** | Mobile Browser Support | Zero autoplay errors | Safari iOS 16+, Chrome Android 12+ |
| **Phase 2** | Channel Separation | &gt;40dB channel isolation | ChannelSplitter verification |
| **Phase 3** | Long-Track Drift | Drift &lt; 15ms over 10 mins | Continuous drift logging monitor |
| **Phase 4** | Queue & Reconnect | Majority vote skip + 15s grace | Collaborative queue test harness |

