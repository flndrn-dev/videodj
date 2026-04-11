# videoDJ.Studio

AI-powered Video DJ & Auto-mixing application. Connects to local video libraries, extracts metadata (BPM, key, language, artist, album, genre), detects musical key via audio analysis, and builds smart playlists with energy curve sorting.

## Architecture

Monorepo with npm workspaces:

- **`web/`** — Next.js 16 + React 19 + Tailwind v4 web app (port 3030). Beatport DJ-style layout: top 60% dual video decks with vinyl discs + waveform + mixer, bottom 40% scrollable video library/playlist browser, floating AI agent chat.
- **`admin/`** — Next.js 16 admin dashboard (port 3050). Ops dashboard: Ghost monitoring, Linus conversations, Users, Support, Subscribers, Tracks/DB management, Dev Zone, Finance.
- **`site/`** — Next.js 16 marketing website. Landing page, pricing (€29.99/month, €279/year), features, download, changelog, FAQ, contact, terms, privacy.
- **`desktop/`** — Electron desktop app (planned multi-platform builds for macOS, Linux, Windows from the working web app).
- **`shared/`** — Cross-platform code: database modules, agent orchestrator, default args, goals manifest.

## Production Architecture — CRITICAL

### How files work (NO MinIO for playback)

**RULE: Video files are NEVER uploaded to MinIO for playback. Files play from LOCAL DISK only.**

1. User opens Settings → Library → selects their music folder
2. Browser gets File references via File System Access API
3. Metadata (title, artist, BPM, key, genre, duration) extracted from tags → saved to **PostgreSQL**
4. Tracks play directly from local File references — no cloud, no upload, no pre-signed URLs
5. After page refresh: metadata loads from PostgreSQL instantly, but user must re-select folder for playback

**Why:** Uploading 1,600+ video files (160GB+) to MinIO takes hours, fills the server disk, and the browser upload queue is fragile (page refresh kills it). The user already has the files on their disk — uploading is unnecessary for playback.

**MinIO is reserved for FUTURE cloud backup** (DJ subscription tier) — optional sync for users who want their library accessible from multiple devices. It is NOT required for the app to function. Do NOT add MinIO to the scan/playback pipeline.

**Desktop app solves the re-select problem:** Electron has native file system access — the folder path persists in electron-store across app restarts. No need to re-select.

### Data persistence

- **PostgreSQL** — Single source of truth for ALL metadata: tracks, users, playlists, sessions, conversations, tickets, errors
- **IndexedDB** — Browser cache for UI state (deck positions, chat history, preferences). NOT for track metadata.
- **MinIO S3** — Future cloud backup feature only. NOT used in the production playback pipeline.

## Production Environment

All services deployed via **Dokploy** on VPS (187.124.209.17) with auto-deploy from GitHub:

| Service | Domain | Port | Purpose |
|---------|--------|------|---------|
| DJ Studio | app.videodj.studio | 3030 | Main DJ application |
| Admin Dashboard | admin.videodj.studio | 3050 | Operations dashboard |
| Marketing Site | videodj.studio | 3060 | Landing, pricing, contact |
| Ghost Agent | ghost.videodj.studio | 3040 | Self-healing background agent |
| MinIO S3 | s3.videodj.studio | 9000 | Future cloud backup (NOT for playback) |
| PostgreSQL | internal (ext:5433) | 5432 | Single database for all services |
| Ollama/Qwen 14B | 187.124.64.116:11434 | 11434 | Linus AI agent + Ghost analysis (dedicated server) |

### Database Schema (PostgreSQL — `videodj_studio`)
- `users` — accounts, roles (admin/support_agent/beta_tester/subscriber/bookkeeper), tiers (free/dj), profile_data (KYC as JSONB)
- `tracks` — music METADATA only (title, artist, BPM, key, genre, duration). NO file storage, NO minio_key for playback.
- `user_playlists` — playlist names + track ID arrays + optional share_code
- `auth_sessions` — login sessions (30-day expiry, videodj_session cookie)
- `magic_links` — email auth tokens (15-min expiry)
- `linus_conversations` — AI chat history (messages as JSONB, session_id for upsert)
- `tickets` + `ticket_messages` — support system with categories + ticket numbers
- `devzone_cards` — dev kanban board
- `pre_subscribers` — early access + newsletter signups
- `app_errors` — client-side error reports from error reporter
- `fix_proposals` — Ghost LLM fix suggestions (pending/approved/rejected/applied)

### Environment Variables (Production — set in Dokploy)
- `DATABASE_URL` — PostgreSQL connection string (required, NO localhost fallback)
- `RESEND_API_KEY` — Email sending (magic links, support, newsletters)
- `AGENT_MODE`, `AGENT_PROVIDER`, `AGENT_API_KEY`, `AGENT_MODEL` — Linus AI agent config
- `OLLAMA_URL` — Ollama endpoint (http://187.124.64.116:11434)
- `YOUTUBE_API_KEY` — Metadata lookup
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` — Twitch OAuth + streaming
- `NEXT_PUBLIC_BASE_URL` — Public app URL
- `NEXT_PUBLIC_GHOST_URL`, `NEXT_PUBLIC_GHOST_API_KEY` — Ghost agent connection
- `STRIPE_SECRET_KEY` — Payment processing (admin only)

### Shared loadEnv Pattern
API routes that need config (agent, stream, lookup, twitch, settings) use `web/app/lib/loadEnv.ts`:
- Reads from `process.env` first (production/Docker)
- Falls back to filesystem `../.env` for local dev only
- Settings POST also updates `process.env` in-memory for immediate effect

## Key Concepts

- **Dual Deck UI**: Deck A (blue `#45b1e8`) and Deck B (red `#ef4444`). Each deck has a vinyl disc, live animated waveform bar, video background, play/pause/cue/eject controls, BPM display, and time elapsed/remaining.
- **Layout**: 60vh top = decks + center mixer column (360px), 40vh bottom = scrollable playlist browser. No sidebar.
- **Video Playback**: Files play from LOCAL File references. No cloud URLs. `crossOrigin="anonymous"` on video element for Web Audio API.
- **Metadata Extraction**: On scan, extracts from file tags ONLY (fast, no audio decode):
  - BPM, Key, Duration, artist, album, genre, language from ID3/Vorbis tags
  - Thumbnail from video frame capture
  - Heavy analysis (BPM/key detection via audio) available on-demand via `/fix bpm`, `/fix keys`
- **Data Persistence**: PostgreSQL stores metadata. Files play from local disk. IndexedDB caches UI state only.
- **Playlist Panel**: Beatport-style table. Sorted A-Z by artist name. Search across title/artist/album/genre. Inline editing (double-click row). Bad files greyed out.
- **Automix vs Autoplay**:
  - **Automix** — Smart DJ engine: BPM matching, Camelot key compatibility, genre coherence, energy curve management, beatmatching via playbackRate.
  - **Autoplay** — Smart random BPM-matched playback with 3-second crossfade, auto-skip bad files.
- **AI Agent (Linus)**: Ollama/Qwen 14B powered DJ agent (upgrading to 32B on KVM8). 30+ slash commands. Conversations saved to PostgreSQL in real-time.
- **Effective Start/End Detection**: On-demand audio analysis finds where music actually starts/ends. CUE returns to effective start. Autoplay transitions trigger before effective end.
- **Client Health Monitor**: Client-side error reporting → admin dashboard → Ghost analyzes via Qwen LLM → proposes fixes in human language → admin approves/rejects.
- **User Track Manager** (planned): Mini version of Admin Tracks in the DJ app at `/library` route.

## Tech Stack

- **Web**: Next.js 16, React 19, Zustand (state), Framer Motion (animations), Tailwind v4, Sonner (toasts), music-metadata-browser (tag extraction)
- **Icons**: lucide-animated (animated icons via shadcn + Framer Motion). Fallback to lucide-react where no animated version exists.
  - **RULE**: When a lucide-animated icon is inside a button, ALWAYS use a ref to trigger the icon animation on button hover — not on icon hover.
- **Desktop**: Electron 33 + electron-builder + electron-updater (auto-update via GitHub Releases)
- **Agent**: Ollama/Qwen 14B (primary), Claude API (fallback). Multi-provider support via loadEnv.
- **Styling**: Dark theme, inline styles + CSS variables. Brand yellow `#ffff00`. No generic AI aesthetics.
- **Min Resolution**: 320px width (responsive). Original target: iPad 10.2" landscape.
- **Database**: PostgreSQL only. No MinIO in the playback pipeline.
- **Admin**: Next.js 16 dashboard with PostgreSQL (raw SQL via pg, no ORM)
- **Email**: Resend (magic links, support replies, invite emails, newsletters)
- **Payments**: Stripe (admin Finance page)

## Pricing

| Tier | Monthly | Annual | Trial |
|------|---------|--------|-------|
| Free Trial | €0 | — | 7 days (14 for early subscribers), 100 tracks |
| DJ | €29.99 | €279/year | Unlimited everything |

60% profit margin guaranteed at worst-case costs even after 3 years of 20% annual infrastructure inflation.

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
- Playlist browser: `web/components/playlist/PlaylistPanel.tsx` (bottom 40vh, search, inline edit, drag)
- Crossfader: `web/components/CrossFader.tsx` (custom pointer-based slider, auto-slide logic in page.tsx)
- AI agent chat: `web/components/command/CommandBar.tsx` (floating FAB, bottom-right, expandable chat)
- Help widget: `web/components/HelpWidget.tsx` (header left, support ticket form)
- Settings modal: `web/components/SetupModal.tsx` (folder picker + AI agent connection)
- Header: `web/components/Header.tsx` (help, logo, STREAM, headphones, settings, avatar)
- Metadata extraction: `web/app/lib/extractMetadata.ts` (fast tags + on-demand heavy analysis)
- Sync engine: `web/app/lib/syncEngine.ts` (PostgreSQL metadata sync, NO MinIO uploads)
- Error reporter: `web/app/lib/errorReporter.ts` (catches errors, sends to admin)
- Ghost agent: `web/app/lib/ghost.ts` (background self-healing, WebSocket to ghost.videodj.studio)
- Agent API: `web/app/api/agent/route.ts` (Linus system prompt, Ollama/Claude, mock fallback)
- Tracks API: `web/app/api/tracks/route.ts` (PostgreSQL CRUD for track metadata, NO rate limiting)
- Auth API: `web/app/api/auth/` (magic link, verify, session, profile)
- Contact form: `site/components/ContactForm.tsx` (reusable, smart tags, hidden fields)

## Environment

- `.env` at project root — holds agent config (local dev only, NOT used in Docker)
- Never commit `.env`
- Production env vars set via Dokploy for each service
- `AGENT_PROVIDER=ollama` — uses Ollama/Qwen on dedicated server
- `AGENT_PROVIDER=anthropic` — uses Claude API (fallback)
- `AGENT_PROVIDER=mock` — demo mode, pattern-matching fallback, no AI
- Database routes use `process.env.DATABASE_URL!` — crash loudly if not set (no localhost fallback)

## Admin Dashboard (admin.videodj.studio)

Pages:
- **Dashboard** — Real-time metrics, Ghost activity feed, quick actions
- **Ghost** — Ghost agent monitoring, fix proposals (LLM analysis), knowledge base
- **Linus** — Linus conversation history with date filters, user breakdown
- **System** — System health (Node.js, PostgreSQL, Ollama), app errors panel
- **Users** — User management (multi-role, edit, pause, password reset, Login as User)
- **Support** — Support tickets (email reply, internal notes, SLA tracking, assignment)
- **Subscribers** — Early subscribers + newsletter management
- **Tracks** — Track/DB management (numbered, sorted by artist, test playable, upload files)
- **Dev Zone** — Dev kanban board (PostgreSQL)
- **Finance** — Stripe integration (revenue, transactions, refunds)

## Infrastructure

| Server | IP | Purpose |
|--------|-----|---------|
| KVM4 Main | 187.124.209.17 | Web, Admin, Site, Ghost, PostgreSQL, MinIO, Traefik, Dokploy |
| KVM4 Ollama | 187.124.64.116 | Ollama/Qwen 2.5 Coder 14B (firewalled to main KVM4 only) |
| KVM8 (planned, May) | TBD | Ollama/Qwen 2.5 Coder 32B (upgrade from 14B) |

Daily PostgreSQL backup: 3am, 7-day retention, `/etc/dokploy/backups/`
