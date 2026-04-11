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

- [x] **4.1 Electron Desktop Builds** — macOS/Linux/Windows with native FS access
- [x] **4.2 MusicBrainz + Discogs API** — verified metadata lookup
- [x] **4.3 Rekordbox/Serato Import** — import from other DJ software
- [x] **4.4 Recording** — record full mix to file (audio + video)
- [x] **4.5 Set History** — log every set with tracklist, timestamps

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

## TIER 5: Ghost Agent + Admin Dashboard + Ollama Infrastructure

Full spec: [GHOST.md](GHOST.md)

### Phase 1 — KVM4: Ollama Setup
- [x] **5.1 Install Ollama** — Installed on KVM4 (temporary, migrating to KVM8 next month)
- [x] **5.2 Pull Qwen 2.5 Coder 7B** — Running (32B deferred to KVM8 with 32GB RAM)
- [x] **5.3 Secure internal access** — Ollama on 0.0.0.0, iptables blocks external, Docker bridge allowed
- [x] **5.4 Test inference** — Qwen 7B responding correctly

### Phase 2 — KVM4: Ghost Server (ghost.videodj.studio)
- [x] **5.5 Docker stack deploy** — Live on ghost.videodj.studio via Docker Swarm + Traefik
- [x] **5.6 Telemetry ingest API** — REST + WebSocket endpoints working
- [x] **5.7 PostgreSQL knowledge base** — Schema deployed, first pattern learned
- [x] **5.8 LLM orchestrator** — Ollama/Qwen integration working end-to-end
- [x] **5.9 Learning loop** — Full pipeline: ingest → match → LLM → fix → learn
- [x] **5.10 Rule promotion engine** — Auto-promotes fixes with >90% success rate
- [x] **5.11 Fix command system** — WebSocket commands implemented
- [x] **5.12 Resend email integration** — Configured with support@videodj.studio
- [x] **5.13 Telegram bot** — Working, tested with @Ghost_videodj_agent_bot

### Phase 3 — DJ App: Ghost Client Module
- [x] **5.14 Ghost Client module** — `web/app/lib/ghost.ts` — error interceptor, performance monitor, telemetry shipper
- [x] **5.15 Rules-based auto-fixer** — AudioContext resume, video unstall, WebSocket reconnect, IndexedDB retry, state sync
- [x] **5.16 Hook into app systems** — Global error handler, unhandled rejections, health checks
- [x] **5.17 WebSocket to Ghost Server** — Connected, receives fix commands
- [x] **5.18 Dynamic rule updates** — Accepts promoted rules from Ghost Server

### Phase 4 — Connect Linus to Ollama (deferred to KVM8 migration)
- [ ] **5.19 Linus → Ollama** — Primary on Qwen 32B, Claude as fallback (needs KVM8 with 32GB RAM)
- [ ] **5.20 Test Linus via Qwen** — Verify all slash commands and chat work through Qwen 2.5 32B
- [ ] **5.21 Linus telemetry to Ghost Server** — Pipe Linus usage stats to admin dashboard

---

## TIER 6: Admin Dashboard (admin.videodj.studio)

Full spec: [docs/2026-04-06-admin-dashboard-plan.md](docs/2026-04-06-admin-dashboard-plan.md)

Tech: Next.js 16, React 19, Tailwind v4, Shadcn, Convex, NextAuth (magic link), Resend, Stripe

### Phase 1 — Scaffold + Auth
- [ ] **6.1 Initialize admin workspace** — `admin/` in monorepo, Next.js 16, React 19, Tailwind v4, Shadcn
- [ ] **6.2 Convex setup** — Real-time DB for users, tickets, devzone
- [ ] **6.3 NextAuth + magic link** — Email auth via Resend (noreply@videodj.studio)
- [ ] **6.4 Role-based access** — admin (all), support_agent (support only)
- [ ] **6.5 Layout + sidebar** — Dark theme, navigation, dashboard home with overview cards

### Phase 2 — Ghost Panel
- [ ] **6.6 Heartbeat** — Live pulse indicator, uptime, connections
- [ ] **6.7 Error log + Fix history** — Filterable tables from Ghost Server API
- [ ] **6.8 Knowledge base browser** — Pattern→fix mappings, success rates, LLM analysis
- [ ] **6.9 Notification log** — Email + Telegram history

### Phase 3 — System Panel
- [ ] **6.10 VPS health** — CPU/RAM/disk gauges for KVM4
- [ ] **6.11 Ollama status** — Model loaded, queue, response times
- [ ] **6.12 App instances + Stream monitor** — Connected sessions, active RTMP streams

### Phase 4 — User Management
- [ ] **6.13 User table** — All users with role/status, enable/disable toggle
- [ ] **6.14 Invite system** — Invite by email, set role, sends magic link via Resend
- [ ] **6.15 Beta tester tracking** — Active usage, sessions, bugs reported
- [ ] **6.16 Access gate on DJ app** — Check Convex users table before allowing app access

### Phase 5 — Linus Panel
- [ ] **6.17 Linus data pipeline** — New Ghost Server endpoints for conversation data
- [ ] **6.18 Conversation browser + API usage charts** — Searchable history, usage stats
- [ ] **6.19 Model config + Command stats** — Provider switcher, slash command analytics

### Phase 6 — Support System
- [ ] **6.20 Ticket system** — Convex schema, CRUD, email inbound via Resend webhooks
- [ ] **6.21 Ticket UI** — List view, thread view, reply (sends email back), assign agent
- [ ] **6.22 Live chat** — Real-time widget (admin side + embeddable customer widget)

### Phase 7 — Dev Zone
- [ ] **6.23 Kanban board** — 5 columns (Ideas→Todo→In Progress→Testing→Done), drag-and-drop
- [ ] **6.24 Card management** — Create/edit/delete ideas, priority, tags, markdown descriptions

### Phase 8 — Finance (Mavi Pay / Stripe)
- [ ] **6.25 Revenue dashboard** — Daily/weekly/monthly charts, MRR, churn, ARPU
- [ ] **6.26 Subscription + Transaction tables** — Active subs, all charges, refunds, payouts
- [ ] **6.27 Export + Payout summary** — CSV export, Stripe payout history

### Phase 9 — Database Management (future)
- [ ] **6.28 DB browser** — Connection status, table browser, record editor
- [ ] **6.29 Backup/restore + Migration tools** — Automated backups, IndexedDB import

### Phase 10 — Deploy
- [ ] **6.30 Docker build + deploy** — Docker Swarm stack on KVM4, Traefik SSL for admin.videodj.studio
- [ ] **6.31 Convex production** — Deploy Convex, configure env vars
- [ ] **6.32 Smoke test** — All panels, auth, data flow, notifications

---

## TIER 7: SaaS Website (videodj.studio)

Tech: Next.js 16, React 19, Tailwind v4, Shadcn, Framer Motion, lucide-animated, react-icons, Convex, NextAuth, Resend

- [ ] **7.1 Marketing landing page** — Hero section, feature showcase, demo video, social proof, pricing preview
- [ ] **7.2 Pre-subscribe flow** — Email signup via magic link, stores in Convex with status=pending
- [ ] **7.3 Desktop download section** — macOS/Linux/Windows buttons, DISABLED with "Coming Soon" badge until production ready
- [ ] **7.4 Social links** — X (formerly Twitter), Twitch, TikTok, Instagram via react-icons
- [ ] **7.5 Footer + Legal** — Terms, privacy policy, contact (support@videodj.studio)
- [ ] **7.6 Live chat widget** — Embeddable support chat connecting to admin dashboard
- [ ] **7.7 Deploy** — Docker Swarm on KVM4, Traefik SSL for videodj.studio

---

## TIER 8: App Health Monitor + Self-Healing Agent (Client-Side)

### Phase A — Fix Upload Crash + Client Error Reporting (URGENT)

The app crashes (error page) after uploading large music libraries (~1,444 files). Root cause: browser runs out of heap memory during concurrent metadata extraction (BPM, key, loudness, waveform — each decodes full audio buffer). Needs immediate fix + error visibility.

- [ ] **8.1 Fix upload memory crash** — Process metadata in smaller batches with explicit memory cleanup (close AudioContext, release decoded buffers between batches). Skip heavy analysis for files that already have tags. Add try-catch around scan loop so one failure doesn't kill the whole scan.
- [ ] **8.2 Client-side error reporting** — Catch unhandled errors + promise rejections in the app, ship to admin dashboard via `/api/errors` endpoint. Store in PostgreSQL `app_errors` table with: error message, stack trace, component, user_id, browser info, timestamp.
- [ ] **8.3 Admin error dashboard** — New tab on the admin System page showing real-time client errors from all users. Filterable by severity, component, user. Click to expand full stack trace.
- [ ] **8.4 Ghost client integration** — Wire client error reports to Ghost server so it learns from app crashes (not just server-side issues).

### Phase B — Self-Proposing Fix Agent (After Support section)

Extend Ghost's self-healing concept to client-side app issues. Ghost analyzes error patterns, proposes fixes in plain human-readable language, and waits for admin approval before applying.

- [ ] **8.5 Error pattern analysis** — Ghost groups similar errors, identifies root cause patterns (memory, CORS, codec, network), and calculates frequency/impact.
- [ ] **8.6 Fix proposals in human language** — Ghost writes a plain-English explanation of what's failing and a proposed fix. Example: "The app crashed 3 times today because BPM detection runs out of memory on files larger than 200MB. Proposed fix: skip BPM analysis for files over 150MB and use tag-based BPM only."
- [ ] **8.7 Admin approval flow** — Proposals appear as notifications in admin dashboard. Admin reviews, approves, or rejects. Approved fixes get applied as Ghost rules that modify app behavior.
- [ ] **8.8 Auto-fix rules** — Promoted fixes become automatic: Ghost detects the pattern → applies the fix without waiting for approval (same promotion engine as server-side Ghost).

---

## TIER 9: Admin Support System + Web Contact Form

Full support ticket system with email integration and live chat.

### Phase A — Admin Support Dashboard

- [ ] **9.1 Real-time ticket view** — Support page shows PostgreSQL tickets with live updates (SSE or polling). Status workflow: open → in_progress → resolved → closed.
- [ ] **9.2 Email inbound** — Resend webhook receives emails to support@videodj.studio, creates tickets automatically with sender info + message body.
- [ ] **9.3 Email reply** — Admin replies to tickets → sends email back to customer via Resend. Full thread view in admin.
- [ ] **9.4 Internal notes** — Support agents can add internal notes (not visible to customer) on tickets.
- [ ] **9.5 Assignment + SLA** — Assign tickets to support agents. SLA tracking (response time, resolution time).

### Phase B — Web Contact Form

- [ ] **9.6 Contact page form** — videodj.studio/contact sends form data to `/api/contact` which creates a support ticket + sends confirmation email to user.
- [ ] **9.7 App-side support widget** — "Help" button in the DJ app that opens a ticket directly from within the app, pre-filled with user info and system context (browser, tracks loaded, active features).
- [ ] **9.8 Knowledge base** — FAQ section on the website that reduces support load. Searchable, categorized.

---

## TODO (tasks that pop up during build)

_Items discovered during implementation that need attention:_

- [ ] **Audio routing conflict**: The StreamCompositor uses `createMediaElementSource()` which permanently reroutes audio. This conflicts with the existing Waveform.tsx approach (which intentionally avoids it). Need to test if both decks' audio still plays correctly when streaming is active. May need to use a shared AudioContext.
- [ ] **FFmpeg dependency**: Users need FFmpeg installed locally (`brew install ffmpeg`). The stream dashboard shows a warning, but we should also document this in CLAUDE.md and consider bundling FFmpeg in the Electron build.
- [ ] **Stream key security**: Stream keys are stored in localStorage (unencrypted). For the Electron build, use the system keychain instead.
- [ ] **Twitch chat write access**: Currently read-only (anonymous). To let Linus respond in chat, need OAuth flow with `chat:edit` scope.
- [x] **YouTube Live Chat**: Full implementation — API v3 polling with pagination, rate limit backoff, video ID/URL resolution, platform selection in StreamDashboard, unified chat panel.
- [ ] **Test automix with real library**: The scoring algorithm (BPM + Camelot + genre + energy) needs testing with a real 50+ track library to verify transitions feel natural.
- [ ] **Crossfader during automix**: Currently the automix animates the crossfader programmatically. Verify it doesn't conflict with manual crossfader control if the user grabs it during a transition.
- [x] **Update Linus system prompt**: Add `/automix` and `/stream` commands to the Linus system prompt so the AI agent can start/stop automix and streaming.
- [x] **Linus full name**: Update the system prompt and /about response to use "Linus lazy AI agent" as the full name.
- [ ] **Stream preview performance**: Canvas compositing at 30fps may impact browser performance during DJ operation. Consider using OffscreenCanvas or reducing preview fps when not streaming.

