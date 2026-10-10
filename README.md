# SyncCast — Multi-Device Synced Audio System

> Transform multiple smartphones and computers on the same network into a synchronized, distributed speaker array with sub-20ms latency. Zero app store downloads required.

---

## ⚡ Overview

SyncCast is an ultra-low-latency distributed audio streaming system. By pairing standard mobile browsers (Safari on iOS, Chrome on Android) over WiFi, SyncCast coordinates sample-accurate playback across up to 10 devices simultaneously.

### Key Capabilities
- **Sub-20ms Sample-Accurate Sync**: NTP-style ping-pong clock synchronization with statistical outlier rejection and continuous drift compensation ($\pm0.15\%$ micro-pitch nudging).
- **2D Spatial Soundstage**: Drag-and-drop speaker radar matrix routing individual phones into Left, Right, Center, or Ambient channels via `ChannelSplitterNode`.
- **Acoustic Test Tone Chirps**: Synthesized hardware chirps to physically locate and identify speakers in the room.
- **3-Band Parametric DSP Equalizer**: Per-device tuning with presets for Subwoofer, Vocal boost, and Bright ambient profiles.
- **Democratic Collaborative Queue**: Any joined peer can enqueue local audio files or direct HTTP/S audio streams.
- **Vote to Skip**: Democratic majority ($\lceil N/2 \rceil$) skipping.
- **Resilient Recovery**: 15-second heartbeat grace reconnection window and automatic host migration when host battery dies.
- **Screen Wake Lock**: Prevents mobile OS background throttling and clock drift during playback.

---

## 🛠️ Architecture

```
SyncCast/
├── client/                 # React 19 + Vite 6 PWA
│   ├── src/
│   │   ├── audio/          # AudioEngine, ClockSynchronizer, ChannelRouter, ParametricEqualizer
│   │   ├── components/     # SpatialStage, ChannelStrip, PlaylistQueue, HostDashboard, GuestView
│   │   ├── hooks/          # useSyncCast, useWakeLock
│   │   └── services/       # Socket.io client and REST API service
├── server/                 # Node.js + Express + Socket.io Server
│   ├── src/
│   │   ├── models/         # Room, Device state models
│   │   ├── services/       # ClockSyncService, RoomService
│   │   ├── socket/         # Socket event bus and handlers
│   │   ├── routes/         # Audio upload, streaming proxy, and room APIs
│   │   └── server.js       # Express & Socket.io entrypoint
└── render.yaml             # Render cloud deployment blueprint
```

---

## 🚀 Local Development

### Prerequisites
- Node.js `>= 20.0.0`
- npm `>= 10.0.0`

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Local Development Servers
Run both backend coordinator and frontend Vite dev server concurrently:

```bash
# Terminal 1 (Server on port 3001)
npm run dev:server

# Terminal 2 (Client on port 5173)
npm run dev:client
```

Open `http://localhost:5173` on your computer or scan the QR code from any smartphone connected to the same WiFi network.

---

## 🌐 Deploy to Render

SyncCast is pre-configured for **single-service deployment** on Render (Express serves both the WebSockets server, REST APIs, and compiled Vite frontend SPA).

### Option A: Using the Render Blueprint (`render.yaml`)
1. Push your repository to GitHub.
2. Go to your [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** $\rightarrow$ **Blueprint**.
4. Connect this GitHub repository. Render will automatically detect `render.yaml` and configure the service.

### Option B: Manual Web Service Setup
1. Go to [Render Dashboard](https://dashboard.render.com/) $\rightarrow$ **New +** $\rightarrow$ **Web Service**.
2. Connect your GitHub repository.
3. Configure the settings:
   - **Name**: `synccast`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
4. Add Environment Variable:
   - `NODE_ENV`: `production`
5. Click **Deploy Web Service**.

Render will automatically provision an HTTPS/WSS URL (e.g. `https://synccast.onrender.com`) where all connected phones can join and synchronize audio in real time.

---

## 📄 License
MIT License &copy; 2026 Pankoj Roy
