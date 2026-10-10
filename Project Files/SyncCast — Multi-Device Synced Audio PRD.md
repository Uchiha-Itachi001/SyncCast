# SyncCast — Product Requirements Document

**Author:** Pankoj Roy **Status:** Draft v1 **Stack:** React (frontend) + Node.js/Express + Socket.io (backend)

## 1. Problem Statement

Most people don't own a good speaker, but almost everyone has a phone. When a group wants to listen to music together (at home, a trip, a small gathering), they either crowd around one weak phone speaker or someone has to buy a Bluetooth speaker. Bluetooth speakers are also single-point: one speaker, one direction of sound, limited volume for a room.

SyncCast turns every phone on the same WiFi network into a synced playback node. Instead of buying hardware, the group's own phones become a distributed speaker system — louder, fuller, and (in surround mode) directional.

## 2. Goal

Let any number of devices on the same WiFi network play the same audio, perfectly in sync (no audible echo/delay between devices), controlled from one phone acting as "host."

Success = a listener standing in the middle of the room cannot tell the sound is coming from multiple separate phones instead of one real speaker.

## 3. Target Users

- Friends/family at home, a dorm, a trip, or outdoors who want louder shared audio without buying a speaker
- Small gatherings/parties that want quick multi-corner sound
- Anyone experimenting with cheap DIY surround sound using phones they already own

## 4. Core Concept

1. One device starts a "Room" (becomes the **Host**). The backend (Node.js) spins up a session tied to the host's local network.
2. Other devices on the same WiFi join the Room by scanning a QR code or entering a short room code in a browser — **no app install**, it's a web app (PWA), since it must work across iOS and Android without App Store friction.
3. Host picks a track (uploaded file or URL). All joined devices download/buffer the same audio.
4. The backend sends a **scheduled start time** (not "play now") to every device. Each device begins playback at that exact synchronized timestamp using the Web Audio API's sample-accurate clock.
5. Devices continuously report their local clock offset vs. the server so drift is corrected during playback.

## 5. Key Features

### Phase 1 — MVP (mono sync)

- Create/join a Room via QR code or 4–6 digit code, all devices on the same WiFi
- Host uploads a local audio file or pastes a direct audio URL
- Synced play / pause / seek / volume (per-device volume, global play state)
- All devices play identical audio in sync (same channel, just louder combined sound)
- Visual "sync health" indicator (shows ms drift per device)
- Auto re-sync if a device drifts beyond a threshold (e.g. >15ms)

### Phase 2 — Surround / Spatial Mode

- Host assigns each joined device a channel/role: Left, Right, Center, or "Ambient"
- For stereo tracks: Left-assigned devices play only the left channel, Right-assigned play only the right channel (split using Web Audio's `ChannelSplitterNode`)
- Simple spatial setup wizard: "place this phone on your left," etc.
- Optional: auto-suggest device placement based on how many devices joined

### Phase 3 — Stretch goals

- Playlist queue, shared queue control (any member can add songs)
- Streaming from a URL/source instead of pre-uploaded files
- Persistent rooms (reconnect after disconnect without losing sync)
- Basic EQ per device (so a phone used as a "bass" node can boost low end)

## 6. User Flow

1. Host opens the web app → taps "Create Room" → gets a QR code + short code
2. Host picks a track
3. Friends open the app on their phones (same WiFi) → scan QR / enter code → join Room
4. Host taps Play → all devices count down briefly ("Starting in 3...2...1") → audio starts in sync
5. (Optional) Host opens "Surround Setup" → drags each joined device icon into a stage layout (L/C/R) → devices update their channel

## 7. System Architecture

### 7.1 Components

- **Frontend (React PWA):** Host UI (room creation, track picker, surround layout) + Guest UI (join, now-playing, sync status). Uses the Web Audio API for playback scheduling, not a plain `<audio>` tag, because `<audio>` lacks sample-accurate start timing.
- **Backend (Node.js + Express + Socket.io):** Manages rooms, device list, relays control events (play/pause/seek/channel-assignment), and runs the clock-sync protocol. Socket.io (WebSocket) is used for low-latency bidirectional messaging — HTTP polling is too slow/jittery for this.
- **Audio delivery:** For MVP, the simplest reliable approach is: host uploads the file once → backend serves it as a static file over the local network → every device fetches the *same* file URL and decodes it locally with `AudioContext.decodeAudioData`. This avoids live-streaming complexity and keeps all devices playing from an identical, fully-buffered source (bit-for-bit sync is only possible if every device isn't also fighting streaming jitter).

### 7.2 Clock Synchronization (the hard part)

Every device's local clock is slightly different. SyncCast needs them aligned to a few milliseconds:

1. On join, each device pings the server several times (like NTP): records `t0` (send), gets back server time `t1`, records `t2` (receive).
2. Round-trip latency ≈ `(t2 − t0)`; estimated offset ≈ `t1 − (t0 + t2)/2`.
3. Repeat \~8–10 times, discard outliers (sudden WiFi spikes), average the rest → get a stable `offset` per device.
4. When the host presses Play, the server broadcasts: "start playback at server-time `T`."
5. Each device converts `T` into its own local time using its offset, then schedules playback via `AudioContext.currentTime` + the computed delay (not `setTimeout`, which isn't sample-accurate).
6. During playback, devices periodically re-ping to catch clock drift and nudge playback rate very slightly (±0.1–0.5%) to stay aligned — large enough corrections are inaudible if applied gradually.

### 7.3 Surround / Channel Splitting

Use `AudioContext` → `ChannelSplitterNode` to pull L/R out of a stereo source, then route only the relevant channel to that device's output based on its assigned role. Center role can mix L+R down to mono.

### 7.4 Device Roles

- **Host:** controls playback, owns the "source of truth" for track + room state
- **Guest:** receives state, plays audio, reports clock offset and drift
- Server is just a relay + sync coordinator; it does not decode or stream raw audio itself (reduces backend load and avoids audio format headaches server-side)

## 8. Tech Stack Detail

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React + Vite, PWA | No app-store install; works on any phone with a browser |
| Realtime | Socket.io | Simple WebSocket abstraction with reconnect handling |
| Backend | Node.js + Express | Matches your existing stack/skills |
| Audio playback | Web Audio API (`AudioContext`) | Sample-accurate scheduling; required for sync, unlike `<audio>` |
| Audio storage (MVP) | Local disk on host's machine or a small file server | Keeps v1 simple; no cloud storage needed since everyone's on one WiFi |
| QR/room join | `qrcode` npm package + short room codes | Fast onboarding without typing IPs |

## 9. Non-Functional Requirements

- **Sync accuracy:** target <20ms drift between any two devices (below general human audible-echo threshold for coincident speakers)
- **Network:** assumes all devices on the same LAN/WiFi (no NAT traversal / internet relay needed for MVP)
- **Scale (MVP):** 2–10 devices per room; beyond that, broadcast storms and WiFi contention become the bottleneck, not the app logic
- **Browser support:** Chrome/Safari/Firefox on mobile — must handle iOS Safari's stricter autoplay rules (playback must start from a user gesture, e.g. the host's "Play" tap, or guests need a one-time "tap to enable audio" step on join)

## 10. Edge Cases & Risks

- **iOS Safari autoplay restriction:** audio can't start without a user tap — handle with a "tap to join audio" button per guest
- **WiFi jitter/congestion:** large rooms or weak routers can cause re-sync thrashing — cap room size, show a warning if drift won't stabilize
- **Device sleep/lock:** phones may throttle JS timers when screen locks — warn users to keep the screen on (can't fully fix without a native wrapper)
- **Clock drift over long tracks:** needs periodic re-sync (every 5–10s), not just at start
- **File size/upload time:** large files delay guests' "ready" state — show per-device buffering progress before starting countdown

## 11. Success Metrics

- Average measured drift across devices (ms) — target <20ms
- Time from "create room" to "all devices synced and ready" (target <30s for a 3-device room)
- % of sessions with no audible desync reported by users (qualitative, early on)

## 12. Out of Scope (v1)

- Devices on different networks / internet relay (TURN/STUN) — LAN-only for now
- Native iOS/Android apps — PWA only
- Streaming from third-party services (Spotify/YouTube) — local files/URLs only
- Advanced DSP/EQ — Phase 3 at earliest

## 13. Assumptions Made

- "Same WiFi" = same LAN, so no internet-facing relay is needed for MVP — this is what makes clock sync tractable without a dedicated media server
- Built as a web app (PWA), not native, since the whole premise is "no extra hardware/installs needed"
- Audio source for MVP is a file the host uploads (or a direct link), not live streaming from a third-party platform
