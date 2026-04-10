# videoDJ.Studio

AI-powered Video DJ & Auto-mixing application. Connects to local video libraries, extracts metadata (BPM, key, language, artist, album, genre), detects musical key via audio analysis, and builds smart playlists with energy curve sorting.

## Architecture

Monorepo with npm workspaces:

- **`web/`** — Next.js 16 + React 19 + Tailwind v4 web app (port 3030). Beatport DJ-style layout: top 60% dual video decks with vinyl discs + waveform + mixer, bottom 40% scrollable video library/playlist browser, floating AI agent chat.
- **`admin/`** — Next.js 16 admin dashboard (port 3050). Ops dashboard: Ghost monitoring, Linus conversations, Users, Support, Tracks/DB management, Dev Zone, Finance.
- **`site/`** — Next.js 16 marketing website. Landing page, pricing, features, download, changelog, FAQ, contact, terms, privacy.
- **`desktop/`** — Electron/Vite desktop app (planned multi-platform builds for macOS, Linux, Windows from the working web app).
- **`shared/`** — Cross-platform code: database modules, agent orchestrator, default args, goals manifest.

## Production Environment

All services deployed via **Dokploy** on VPS (187.124.209.17) with auto-deploy from GitHub:

| Service | Domain | Port | Source |
|---------|--------|------|--------|
| DJ Studio | app.videodj.studio | 3030 | `web/Dockerfile` |
| Admin Dashboard | admin.videodj.studio | 3050 | `admin/Dockerfile` |
| Marketing Site | videodj.studio | 3060 | `site/Dockerfile` |
| Ghost Agent | ghost.videodj.studio | 3040 | `flndrn-dev/ghost` repo |
| MinIO S3 | s3.videodj.studio | 9000 | Docker image `minio/minio` |
| PostgreSQL | internal (ext:5433) | 5432 | Docker image `postgres:16-alpine` |

### Databases
- **`videodj_studio`** — 11 tables: users, tracks, playlists, auth_sessions, magic_links, linus_conversations, user_playlists, pre_subscribers, tickets, ticket_messages, devzone_cards
- **`ghost_db`** — 3 tables: knowledge_base, notification_log, telemetry_log

### Environment Variables (Production — set in Dokploy)
- `DATABASE_URL` — PostgreSQL connection string (required, NO localhost fallback)
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` — MinIO S3 storage
- `RESEND_API_KEY` — Email sending for magic links
- `AGENT_MODE`, `AGENT_PROVIDER`, `AGENT_API_KEY`, `AGENT_MODEL` — Linus AI agent config
- `YOUTUBE_API_KEY` — Metadata lookup
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` — Twitch OAuth + streaming
- `NEXT_PUBLIC_BASE_URL` — Public app URL
- `NEXT_PUBLIC_GHOST_URL`, `NEXT_PUBLIC_GHOST_API_KEY` — Ghost agent connection
- `NEXT_PUBLIC_MINIO_ENABLED` — Enable MinIO integration (build-time)

### Shared loadEnv Pattern
API routes that need config (agent, stream, lookup, twitch, settings) use `web/app/lib/loadEnv.ts`:
- Reads from `process.env` first (production/Docker)
- Falls back to filesystem `../.env` for local dev only
- Settings POST also updates `process.env` in-memory for immediate effect

## Key Concepts

- **Dual Deck UI**: Deck A (blue `#45b1e8`) and Deck B (red `#ef4444`). Each deck has a vinyl disc, live animated waveform bar, video background, play/pause/cue/eject controls, BPM display, and time elapsed/remaining.
- **Layout**: 60vh top = decks + center mixer column (360px), 40vh bottom = scrollable playlist browser. No sidebar.
- **Waveform**: Real-time animated waveform per deck using Web Audio API AnalyserNode. Bars bounce to the beat. Click to seek. Static frequency-banded peaks (bass/mid/high) extracted via DFT from audio data with CORS fetch. Deck A waveform top-left, Deck B waveform top-right (mirrored).
- **Crossfader**: Custom slider (not native range input). Dark thumb, thin 3px track. Color fills from center outward — blue toward A, red toward B. No color at center (50). Snaps to center on release (±5 range). **Autoplay transitions: linear 3-second crossfade.**
- **Video Playback**: Both decks show video background simultaneously. Active deck at 15% opacity, inactive at 8%. Videos stop at end (no loop). Sound volume controlled by crossfader position. `crossOrigin="anonymous"` on video element for Web Audio with cross-origin MinIO URLs.
- **Audio Engine**: Per-deck Web Audio chain: MediaElementSource → EQ (bypass/active) → Gain → MonitorGain → Destination. Effects chain (filter, delay, reverb, flanger) inserts between gain and monitorGain with try-catch safety.
- **Metadata Extraction**: On upload, extracts from file tags (music-metadata-browser) + audio analysis fallback:
  - BPM — ID3 tags → Web Audio peak interval analysis
  - Key — ID3 tags → Krumhansl-Schmuckler chromagram analysis (Camelot notation 1A-12B)
  - Duration, artist, album, genre, language, thumbnail (video frame capture)
  - Loudness — RMS measurement for auto-gain matching
  - **Effective end time** — silence detection in last 60s to find where music actually stops
- **Data Persistence**: PostgreSQL (source of truth) + MinIO S3 (video files) + IndexedDB (browser cache). SyncEngine handles reconciliation, upload queue (3 concurrent), and real-time SSE sync across devices.
- **Pre-signed URL Management**: MinIO URLs generated via `/api/storage` with 24h expiry. Auto-refresh every 30 minutes for URLs older than 20 hours. On-the-fly resolution when loading tracks to decks.
- **Playlist Panel**: Beatport-style table with columns: # | Deck A/B play buttons | Thumbnail | Title/Artist | Album | Remixers | Genre | Lang | BPM/Key | Released | Time | Plays | Edit/Delete. Inline editing (double-click row). Search across title/artist/album/genre/remixer/language. Sorted A-Z by title. Bad files greyed out (opacity 0.35, non-clickable).
- **Automix vs Autoplay**:
  - **Automix** — Smart DJ engine: BPM matching (±8%), Camelot key compatibility, genre coherence, energy curve management (build/peak/cooldown/wave/natural), play history tracking (no repeats within 6-track artist window), beatmatching via playbackRate. Queue preview shows play order (decks + next 5 tracks).
  - **Autoplay** — Smart random BPM-matched playback with linear 3-second crossfade, effective end detection (skips silence/credits), auto-skip bad files. Artist spacing enforced (same artist not within 6 tracks).
- **AI Agent (Linus lazy AI agent)**: Claude-powered DJ agent. Full name: "Linus lazy AI agent". Task-focused, concise — NOT a chatbot. Floating FAB (bottom-right) opens chat panel. 30+ slash commands for library management, playlist building, mixing suggestions. Confirmation flow for metadata changes (apply/cancel). `/playlist` results show action buttons: Start Playing, Edit, Remove.
- **Headphone Detection**: Auto-detects audio output devices (wired, Bluetooth, USB). Requests mic permission to unlock device labels. Headphone icon in header turns green when detected/selected. Device picker dropdown for routing audio output.
- **Live Streaming**: Canvas compositor (crossfade blend of both decks), Now Playing overlay, RTMP output via server-side FFmpeg to Twitch/YouTube. Stream Dashboard with platform selection (Twitch/YouTube), stream key, resolution (720p/1080p), bitrate control. Twitch IRC chat + YouTube Live Chat polling in unified chat panel.
- **Deck Controls**: Play/Pause (toggle) | CUE (text button, returns to start) | Eject (removes track from deck)
- **Broken File Management**: `/health` command detects corrupt/missing/audio-only files. Bad files flagged with `badFile` + `badReason`. Auto-skipped in autoplay. Admin dashboard at admin.videodj.studio/tracks for verify/authorize/delete.

## Tech Stack

- **Web**: Next.js 16, React 19, Zustand (state), Framer Motion (animations), Tailwind v4, Sonner (toasts), wavesurfer.js (audio), music-metadata-browser (tag extraction)
- **Icons**: lucide-animated (animated icons via shadcn + Framer Motion). Fallback to lucide-react where no animated version exists. Install: `pnpm dlx shadcn add "@lucide-animated/{icon-name}"`
  - **RULE**: When a lucide-animated icon is inside a button, ALWAYS use a ref to trigger the icon animation on button hover — not on icon hover. Pattern:
    ```tsx
    const iconRef = useRef<XxxIconHandle>(null)
    <button onMouseEnter={() => iconRef.current?.startAnimation()}
            onMouseLeave={() => iconRef.current?.stopAnimation()}>
      <XxxIcon ref={iconRef} size={16} />
    </button>
    ```
    This ensures the animation triggers when hovering anywhere on the button, not just on the icon itself.
- **Desktop**: Electron + Vite (planned — build from working web app for macOS, Linux, Windows)
- **Agent**: Claude API (multi-provider: Anthropic, OpenAI, xAI, DeepSeek, Ollama) via shared `loadEnv.ts`
- **Styling**: Dark theme, inline styles + CSS variables. Brand yellow `#ffff00`. No generic AI aesthetics.
- **Min Resolution**: iPad 10.2" landscape (1080x810). App sets `min-width: 810px; min-height: 600px`.
- **Database**: PostgreSQL (source of truth) + MinIO S3 (video files) + IndexedDB (browser cache)
- **Admin**: Next.js 16 dashboard with PostgreSQL + MinIO integration for track/user/ticket management

## Commands

```bash
npm run dev:web        # Start web app at localhost:3030
npm run dev:admin      # Start admin dashboard at localhost:3050
npm run dev:site       # Start marketing site
npm run dev:desktop    # Start desktop app
npm run build:web      # Build web app
npm run build:desktop  # Build desktop app
```

## File Conventions

- Web store: `web/app/hooks/usePlayerStore.ts` (Zustand — Track type, DeckState, all actions)
- Deck component: `web/components/deck/DeckPanel.tsx` (vinyl + video + waveform + controls + drag & drop)
- Waveform: `web/components/deck/Waveform.tsx` (live animated audio visualizer, Web Audio API)
- Playlist browser: `web/components/playlist/PlaylistPanel.tsx` (bottom 40vh, search, inline edit, drag)
- Crossfader: `web/components/CrossFader.tsx` (custom pointer-based slider, auto-slide logic in page.tsx)
- AI agent chat: `web/components/command/CommandBar.tsx` (floating FAB, bottom-right, expandable chat)
- Command reference: `web/components/command/CommandReference.tsx` (modal with all slash commands)
- Command definitions: `web/app/lib/linusCommands.ts` (all slash command definitions)
- Command processor: `web/app/lib/commandProcessor.ts` (client-side command intercept, Camelot wheel, audio analysis)
- Pending updates: `web/app/lib/pendingUpdates.ts` (confirmation flow for batch metadata changes)
- Automix engine: `web/app/lib/automix.ts` (smart track selection, energy curves, beatmatch calc, transition timing)
- Stream capture: `web/app/lib/streamCapture.ts` (canvas compositor, audio mixer, MediaStream, Now Playing overlay)
- Twitch chat: `web/app/lib/twitchChat.ts` (IRC WebSocket client, YouTube Live Chat polling)
- Stream dashboard: `web/components/StreamDashboard.tsx` (full streaming setup + GO LIVE UI + live chat panel)
- Upload indicator: `web/components/UploadIndicator.tsx` (floating upload progress bar, bottom-left)
- Settings modal: `web/components/SetupModal.tsx` (folder picker + Claude CLI connection)
- Header: `web/components/Header.tsx` (logo, NL filter badge, STREAM button, headphone selector, settings)
- Database: `web/app/lib/db.ts` (IndexedDB layer — saveTracks, loadAllTracks, updateTrackMeta, deleteTrackFromDB)
- Cloud storage: `web/app/lib/cloudStorage.ts` (MinIO upload/download via pre-signed URLs)
- Sync engine: `web/app/lib/syncEngine.ts` (PostgreSQL ↔ IndexedDB reconciliation, upload queue, SSE sync)
- Audio engine: `web/app/lib/audioEngine.ts` (per-deck Web Audio chain, EQ, gain, monitor mute)
- Audio devices: `web/app/lib/audioDevices.ts` (headphone detection, device routing via setSinkId)
- Effects: `web/app/lib/effects.ts` (filter, delay, reverb, flanger per deck)
- Env loader: `web/app/lib/loadEnv.ts` (shared process.env → filesystem fallback for API routes)
- Metadata extraction: `web/app/lib/extractMetadata.ts` (tags + BPM + key + loudness + effective end detection)
- Ghost agent: `web/app/lib/ghost.ts` (background self-healing agent, WebSocket to ghost.videodj.studio)
- Agent API: `web/app/api/agent/route.ts` (Linus system prompt, Claude API, mock fallback)
- Storage API: `web/app/api/storage/route.ts` (MinIO pre-signed URL generation, 24h expiry)
- Tracks API: `web/app/api/tracks/route.ts` (PostgreSQL CRUD for track metadata)
- Playlists API: `web/app/api/playlists/route.ts` (PostgreSQL CRUD for user playlists)
- Auth API: `web/app/api/auth/` (magic link, verify, session — with rate limiting)
- Signup page: `web/app/signup/page.tsx` (self-service account creation via magic link)
- Animated icons: `web/components/ui/*.tsx` (lucide-animated components via shadcn)
- Admin tracks: `admin/app/(dashboard)/tracks/page.tsx` (track/DB management — verify, authorize, delete)
- Admin sidebar: `admin/components/layout/Sidebar.tsx` (navigation + logout)

## Brand Assets

Located in `assets/`:
- `favicon.svg` — favicon, brand yellow `#ffff00`
- `icon.svg` — app icon
- `logo.svg` — default logo (used in header)
- `logo_dark.svg` — logo for dark backgrounds
- `logo_light.svg` — logo for light backgrounds
- `og-image.svg` — Open Graph social preview image

Always use these assets for branding — do not generate or substitute logos.

## Environment

- `.env` at project root — holds agent config (local dev only, NOT used in Docker)
- Never commit `.env`
- Production env vars set via Dokploy for each service
- `AGENT_PROVIDER=anthropic` — uses Claude API with standard API key
- `AGENT_PROVIDER=mock` — demo mode, pattern-matching fallback, no AI
- Database routes use `process.env.DATABASE_URL!` — crash loudly if not set (no localhost fallback)

## Playlist Defaults

- Sorted A-Z by title (always)
- Duplicate detection by filename on upload
- Language always stored uppercase (EN, NL, DE, FR, etc.)
- Times played counter per track (persisted to PostgreSQL)

## Live Streaming

- Requires **FFmpeg** installed locally (dev) or in Docker image (production): `apk add ffmpeg`
- Stream Dashboard: click STREAM button in header to open
- Supports **Twitch** (RTMP `rtmp://live.twitch.tv/app/`) and **YouTube** (`rtmp://a.rtmp.youtube.com/live2/`)
- Stream keys stored in localStorage (browser-only, never sent to any API)
- Pipeline: Canvas compositor → MediaRecorder → WebSocket → server-side FFmpeg → RTMP
- Resolution: 720p or 1080p, bitrate: 2500-6000 kbps
- Now Playing overlay: configurable position, shows title/artist/BPM/key

## Linus Agent Behavior

- Full name: "Linus lazy AI agent" — users call him Linus
- Task-focused, concise — NOT a chatbot. Execute tasks, report briefly.
- Never suggest work unprompted. User drives, Linus executes.
- First response after user intro: 1-2 sentences MAX. No feature lists.
- Slash commands: 30+ commands covering library management, metadata fixing, playlist building, mixing suggestions
- `/playlist` results include action buttons: Start Playing, Edit Playlist, Remove

## Admin Dashboard (admin.videodj.studio)

Pages:
- **Dashboard** — Overview metrics
- **Ghost** — Ghost agent monitoring
- **Linus** — Linus conversation history (from PostgreSQL)
- **System** — System health
- **Users** — User management (invite, roles, status)
- **Support** — Support tickets
- **Tracks** — Track/DB management: verify MinIO files, authorize/flag, delete from DB+MinIO, search/filter by status
- **Dev Zone** — Dev kanban board
- **Finance** — Financial overview

Features:
- Magic link auth (admin_session cookie)
- Logout button in sidebar footer
- All database routes use `process.env.DATABASE_URL!` (no localhost fallback)

## Multi-Platform Distribution (Planned)

The web app is the primary development target. Once fully functional, the desktop app will be built using Electron + Vite for:
- **macOS** (.dmg)
- **Linux** (.AppImage / .deb)
- **Windows** (.exe / .msi)

The desktop build wraps the same web codebase with native file system access and local video library management.
