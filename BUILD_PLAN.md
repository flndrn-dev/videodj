# videoDJ.Studio — Build Plan

## TIER 1: Automix Engine (Linus becomes a real DJ)

- [x] **1.1 Smart Track Selection**
  - Linus picks next track using: BPM match (±8%), Camelot key compatibility, genre coherence, energy curve, play history (no repeats)
  - New file: `web/app/lib/automix.ts`

- [x] **1.2 Transition Planning**
  - Determine mix point: start crossfade when track A has ~15s remaining
  - Crossfade duration based on BPM range (slow songs = longer fade, fast = shorter)
  - Pre-load next track into idle deck before transition starts

- [x] **1.3 Beatmatching (Tempo Sync)**
  - Adjust `playbackRate` on the incoming deck's video element to match outgoing BPM
  - Gradual tempo shift: ease incoming track to match, then restore original after full crossover
  - Web Audio API for precise BPM-locked transitions

- [x] **1.4 Energy Curve Management**
  - Automix follows a set energy plan: warm-up → build → peak → cooldown
  - User can set energy curve via `/playlist-energy` or Linus decides based on set duration
  - Track BPM + genre mapped to energy level (0-10 scale)

- [x] **1.5 Queue Preview UI**
  - Show upcoming 3-5 tracks Linus has planned in a mini-queue
  - Display in playlist panel or as overlay near decks
  - User can skip/remove tracks from queue

- [x] **1.6 Automix Controls**
  - Start/stop automix button in header (separate from autoplay)
  - Linus announces transitions in chat: "Mixing into [track] — BPM match, key compatible"
  - `/automix` slash command to start, `/stop` to end

---

## TIER 2: Live Streaming (Twitch + YouTube)

- [x] **2.1 Canvas Compositor**
  - Single `<canvas>` element that composites the active deck's video into a stream-ready output
  - Modes: single deck (active), split-screen, picture-in-picture
  - Render at 720p/1080p for streaming
  - RAF loop drawing video frames to canvas

- [x] **2.2 Audio Mixer Output**
  - Web Audio API: route both deck audio through a mixer node → single AudioDestination
  - Capture mixed audio via `MediaStreamDestination` for streaming
  - Crossfader controls gain nodes (already working for volume, need to route through mixer)

- [x] **2.3 MediaStream Capture**
  - Combine canvas video stream + mixed audio stream into single `MediaStream`
  - `canvas.captureStream(30)` for video frames
  - `audioContext.createMediaStreamDestination()` for audio

- [x] **2.4 RTMP Streaming via Server-Side FFmpeg**
  - New API route: `web/app/api/stream/route.ts`
  - WebSocket connection from browser → server
  - Browser sends MediaRecorder chunks (webm/opus) via WebSocket
  - Server pipes chunks to FFmpeg subprocess: `ffmpeg -i pipe:0 -f flv rtmp://...`
  - FFmpeg re-encodes to H.264+AAC for Twitch/YouTube RTMP ingest

- [x] **2.5 Stream Settings UI**
  - Add streaming section to SetupModal or new StreamSettings component
  - Platform selector: Twitch / YouTube
  - Stream key input (saved to IndexedDB preferences, never sent to API)
  - Resolution selector: 720p / 1080p
  - Bitrate selector: 2500-6000 kbps

- [x] **2.6 Stream Controls**
  - GO LIVE / STOP button in header
  - LIVE indicator (already exists in header — wire it up for real)
  - Stream duration timer
  - Connection status (connecting / live / error / offline)

- [x] **2.7 Now Playing Overlay**
  - Render track title + artist on the stream canvas
  - Animated transitions when track changes
  - Configurable position (top-left, bottom-left, etc.)
  - Optional: album art / BPM / key display

- [x] **2.8 Twitch/YouTube Chat Integration**
  - Twitch: IRC WebSocket connection (tmi.js or raw IRC)
  - YouTube: YouTube Live Chat API polling
  - Display chat messages in Linus chat panel
  - Linus can respond to audience requests ("play something 80s!")
  - Chat overlay on stream canvas (optional)

---

## TIER 3: Pro DJ Features (future)

- [x] **3.1 3-Band EQ per Deck** — high/mid/low with kill switches, bypass mode, crossfader-style sliders
- [x] **3.2 Effects Rack** — filter sweep, delay, reverb, flanger (Web Audio nodes, bypass when off)
- [x] **3.3 Loop System** — auto-loop 1/2/4/8 bars, in/out points, exit button per deck
- [x] **3.4 Hotcues** — 4 slots (A-D) per deck, click set, click jump, right-click delete
- [x] **3.5 Tempo Sync** — pitch fader ±8%, sync to other deck BPM, rate controller
- [x] **3.6 Gain/Trim** — per-deck volume trim (0.25x to 2x) on top of crossfader volume

---

## TIER 4: Platform & Distribution (future)

- [ ] **4.1 Electron Desktop Builds** — macOS/Linux/Windows with native FS access
- [ ] **4.2 MusicBrainz + Discogs API** — verified metadata lookup
- [ ] **4.3 Rekordbox/Serato Import** — import from other DJ software
- [ ] **4.4 Recording** — record full mix to file (audio + video)
- [ ] **4.5 Set History** — log every set with tracklist, timestamps

---

## COMPLETED

- [x] Dual video deck engine (Deck A blue, Deck B red)
- [x] Crossfader with real audio volume control + auto-slide
- [x] Waveform visualization (Canvas-based, Web Audio API)
- [x] Video playback in both decks simultaneously
- [x] Play/Pause/Cue/Eject controls
- [x] Autoplay with BPM matching + crossfade transitions
- [x] IndexedDB persistence (tracks, blobs, preferences, deck state, chat)
- [x] Metadata extraction (BPM, key, artist, album, genre via tags + audio analysis)
- [x] Playlist panel (Beatport-style, search, inline edit, drag-to-deck)
- [x] Deck state restore after page refresh
- [x] Linus AI Agent — Claude API integration with 30 slash commands
- [x] Command processor — client-side Camelot wheel, audio analysis, mixing suggestions
- [x] Confirmation flow — pending batch with apply/cancel for metadata updates
- [x] Batch processing — large libraries split into API call batches with progress
- [x] Linus memory system — conversation summarization + persistent memories
- [x] Floating chat FAB with minimize, command reference, slash autocomplete
- [x] Settings modal (folder picker, API key management)
- [x] Dark theme, brand yellow #ffff00, Linus green #afff92

---

## TODO (tasks that pop up during build)

_Items discovered during implementation that need attention:_

- [ ] **Audio routing conflict**: The StreamCompositor uses `createMediaElementSource()` which permanently reroutes audio. This conflicts with the existing Waveform.tsx approach (which intentionally avoids it). Need to test if both decks' audio still plays correctly when streaming is active. May need to use a shared AudioContext.
- [ ] **FFmpeg dependency**: Users need FFmpeg installed locally (`brew install ffmpeg`). The stream dashboard shows a warning, but we should also document this in CLAUDE.md and consider bundling FFmpeg in the Electron build.
- [ ] **Stream key security**: Stream keys are stored in localStorage (unencrypted). For the Electron build, use the system keychain instead.
- [ ] **Twitch chat write access**: Currently read-only (anonymous). To let Linus respond in chat, need OAuth flow with `chat:edit` scope.
- [ ] **YouTube Live Chat**: Needs YouTube Data API v3 key + live broadcast ID. Client is built but needs the stream settings UI to accept these credentials.
- [ ] **Test automix with real library**: The scoring algorithm (BPM + Camelot + genre + energy) needs testing with a real 50+ track library to verify transitions feel natural.
- [ ] **Crossfader during automix**: Currently the automix animates the crossfader programmatically. Verify it doesn't conflict with manual crossfader control if the user grabs it during a transition.
- [x] **Update Linus system prompt**: Add `/automix` and `/stream` commands to the Linus system prompt so the AI agent can start/stop automix and streaming.
- [x] **Linus full name**: Update the system prompt and /about response to use "Linus lazy AI agent" as the full name.
- [ ] **Stream preview performance**: Canvas compositing at 30fps may impact browser performance during DJ operation. Consider using OffscreenCanvas or reducing preview fps when not streaming.

