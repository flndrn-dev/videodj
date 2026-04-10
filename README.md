# videoDJ.Studio

AI-powered Video DJ & Auto-mixing application. Mix music videos with dual decks, smart automix, live streaming, and an AI DJ agent.

## Features

- **Dual Video Decks** — Deck A (blue) + Deck B (red) with vinyl disc visualization, waveform display, and full transport controls
- **Smart Automix** — BPM matching, Camelot key compatibility, genre coherence, energy curve management (build/peak/cooldown/wave)
- **3-Band EQ + Effects** — Per-deck EQ with kill switches, filter sweep, delay, reverb, flanger
- **Pro DJ Controls** — Loops (1/2/4/8/16 bars), hotcues (A-H), tempo sync (±8%), gain/trim per deck
- **Crossfader** — Custom slider with snap-to-center, linear 3-second auto-crossfade transitions
- **Autoplay** — Smart track selection with silence detection, artist spacing, bad file skipping
- **AI Agent (Linus)** — Claude-powered DJ assistant with 30+ slash commands for library management, metadata fixing, playlist building, and mixing suggestions
- **Live Streaming** — WHIP/RTMP to Twitch/YouTube with Now Playing overlay, Twitch IRC + YouTube Live Chat in unified chat panel
- **Upload Progress** — Floating indicator with per-track cloud status icons (uploaded/uploading/pending/failed)
- **Mix Recording** — Capture audio + video to WebM file
- **Library Management** — PostgreSQL persistence, MinIO S3 storage, metadata extraction (BPM, key, genre from tags + audio analysis), MusicBrainz/Discogs lookup
- **Headphone Detection** — Auto-detects wired/Bluetooth/USB headphones, device routing via setSinkId
- **DJ Software Import** — Rekordbox XML, Serato crates, M3U/M3U8 playlists
- **Set History** — Full tracklist logging with timestamps and export
- **Admin Dashboard** — Track/DB management, user management, support tickets, Ghost/Linus monitoring

## Tech Stack

- **Frontend**: Next.js 16, React 19, Zustand, Framer Motion, Tailwind v4
- **Audio**: Web Audio API, music-metadata-browser, wavesurfer.js
- **AI**: Claude API (multi-provider: Anthropic, OpenAI, xAI, Ollama, DeepSeek)
- **Streaming**: Canvas compositor + WHIP/RTMP
- **Desktop**: Electron + Vite (macOS, Linux, Windows)
- **Database**: PostgreSQL (source of truth) + MinIO S3 (video files) + IndexedDB (browser cache)
- **Deployment**: Dokploy auto-deploy from GitHub, Docker containers

## Production Services

| Service | Domain | Description |
|---------|--------|-------------|
| DJ Studio | app.videodj.studio | Main DJ application |
| Admin | admin.videodj.studio | Operations dashboard |
| Website | videodj.studio | Marketing site |
| Ghost | ghost.videodj.studio | Self-healing agent |
| Storage | s3.videodj.studio | MinIO S3 object storage |

## Quick Start

```bash
# Install dependencies
npm install

# Start web app (localhost:3030)
npm run dev:web

# Start admin dashboard (localhost:3050)
npm run dev:admin

# Start marketing site
npm run dev:site

# Start desktop app (Electron + web)
npm run dev:desktop
```

## Build

```bash
# Web
npm run build:web

# Desktop (macOS/Linux/Windows)
npm run build:desktop
```

## Streaming Requirements

Live streaming requires FFmpeg:

```bash
# macOS
brew install ffmpeg

# Linux
sudo apt install ffmpeg
```

## Environment

Create a `.env` file in the project root (local dev only — production uses Dokploy env vars):

```env
AGENT_PROVIDER=anthropic
AGENT_API_KEY=sk-ant-api03-...
AGENT_MODEL=claude-sonnet-4-20250514
YOUTUBE_API_KEY=...
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
```

## Project Structure

```
djstudio/
├── web/                    # Next.js web app (port 3030)
│   ├── app/
│   │   ├── api/            # API routes (agent, tracks, playlists, storage, auth, stream, twitch)
│   │   ├── hooks/          # Zustand store (usePlayerStore)
│   │   └── lib/            # Core engines (automix, audio, effects, db, syncEngine, cloudStorage)
│   ├── components/
│   │   ├── deck/           # DeckPanel, Waveform
│   │   ├── playlist/       # PlaylistPanel, PlaylistModal
│   │   ├── command/        # CommandBar (Linus AI), CommandReference
│   │   └── ui/             # Animated icons (lucide-animated)
│   └── Dockerfile          # Production Docker build
├── admin/                  # Admin dashboard (port 3050)
│   ├── app/
│   │   ├── (dashboard)/    # Dashboard pages (ghost, linus, system, users, support, tracks, devzone, finance)
│   │   └── api/            # Admin API routes (auth, tracks, linus)
│   └── Dockerfile
├── site/                   # Marketing website (port 3060)
│   └── Dockerfile
├── desktop/                # Electron wrapper
│   └── src/main/           # Main process + preload
├── shared/                 # Shared DB modules + utilities
├── assets/                 # Brand assets (logo, icons)
└── docs/                   # Guides (Twitch streaming)
```

## License

Private — All rights reserved.

---

Built by [dj Bodhi](https://twitch.tv/) with Claude
