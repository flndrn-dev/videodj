# videoDJ.Studio

AI-powered Video DJ & Auto-mixing application. Connects to local video libraries, extracts metadata (BPM, key, language, artist, album, genre), detects musical key via audio analysis, and builds smart playlists with energy curve sorting.

## Architecture

Monorepo with npm workspaces:

- **`web/`** — Next.js 16 + React 19 + Tailwind v4 web app (port 3030). Beatport DJ-style layout: top 60% dual video decks with vinyl discs + waveform + mixer, bottom 40% scrollable video library/playlist browser, floating AI agent chat.
- **`desktop/`** — Electron/Vite desktop app (planned multi-platform builds for macOS, Linux, Windows from the working web app).
- **`shared/`** — Cross-platform code: agent orchestrator (Claude CLI + API + mock fallback), default args, goals manifest.

## Key Concepts

- **Dual Deck UI**: Deck A (blue `#45b1e8`) and Deck B (red `#ef4444`). Each deck has a vinyl disc, live animated waveform bar, video background, play/pause/cue/eject controls, BPM display, and time elapsed/remaining.
- **Layout**: 60vh top = decks + center mixer column (360px), 40vh bottom = scrollable playlist browser. No sidebar.
- **Waveform**: Real-time animated waveform per deck using Web Audio API AnalyserNode. Bars bounce to the beat. Click to seek. Static peaks extracted from audio data. Deck A waveform top-left, Deck B waveform top-right (mirrored).
- **Crossfader**: Custom slider (not native range input). Dark thumb, thin 3px track. Color fills from center outward — blue toward A, red toward B. No color at center (50). Snaps to center on release (±5 range). Auto-slides to opposite deck on play (3.5s ease-out) only when not at center. At center both decks are active and audible.
- **Video Playback**: Both decks show video background simultaneously. Active deck at 15% opacity, inactive at 8%. Videos stop at end (no loop). Sound volume controlled by crossfader position.
- **Metadata Extraction**: On upload, extracts from file tags (music-metadata-browser) + audio analysis fallback:
  - BPM — ID3 tags → Web Audio peak interval analysis
  - Key — ID3 tags → Krumhansl-Schmuckler chromagram analysis (Camelot notation 1A-12B)
  - Duration, artist, album, genre, language, thumbnail (video frame capture)
- **IndexedDB Persistence**: Video blobs + metadata stored in browser IndexedDB. Survives page refresh. Duplicate detection by filename on upload. Track edits and play counts persisted.
- **Playlist Panel**: Beatport-style table with columns: # | Deck A/B play buttons | Thumbnail | Title/Artist | Album | Remixers | Genre | Lang | BPM/Key | Released | Time | Plays | Edit/Delete. Inline editing (double-click row). Search across title/artist/album/genre/remixer/language. Sorted A-Z by title.
- **Automix vs Autoplay**:
  - **Automix** — Smart DJ engine: BPM matching (±8%), Camelot key compatibility, genre coherence, energy curve management (build/peak/cooldown/wave/natural), play history tracking (no repeats), beatmatching via playbackRate, BPM-adaptive crossfade duration. Queue preview shows next 5 tracks.
  - **Autoplay** — Simple random BPM-matched (±15) playback with 3.5s crossfade transitions between decks
- **AI Agent (Linus lazy AI agent)**: Claude-powered DJ agent. Full name: "Linus lazy AI agent". Task-focused, concise — NOT a chatbot. Floating FAB (bottom-right) opens chat panel. 30+ slash commands for library management, playlist building, mixing suggestions. Confirmation flow for metadata changes (apply/cancel).
- **Live Streaming**: Canvas compositor (crossfade blend of both decks), Now Playing overlay, RTMP output via server-side FFmpeg to Twitch/YouTube. Stream Dashboard with platform selection, stream key, resolution (720p/1080p), bitrate control. Twitch IRC chat client for reading chat.
- **Deck Controls**: Play/Pause (toggle) | CUE (text button, returns to start) | Eject (removes track from deck)

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
- **Agent**: Claude CLI (Pro+ subscription) → Claude API (standard key) → mock fallback
- **Styling**: Dark theme, inline styles + CSS variables. Brand yellow `#ffff00`. No generic AI aesthetics.
- **Min Resolution**: iPad 10.2" landscape (1080x810). App sets `min-width: 810px; min-height: 600px`.
- **Database**: IndexedDB (browser-side) for video blob + metadata persistence

## Commands

```bash
npm run dev:web        # Start web app at localhost:3030
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
- Stream dashboard: `web/components/StreamDashboard.tsx` (full streaming setup + GO LIVE UI)
- Settings modal: `web/components/SetupModal.tsx` (folder picker + Claude CLI connection)
- Header: `web/components/Header.tsx` (logo, NL filter badge, STREAM button, settings)
- IndexedDB: `web/app/lib/db.ts` (saveTracks, loadAllTracks, updateTrackMeta, deleteTrackFromDB, getTrackBlob, batchUpdateTrackMeta)
- Metadata extraction: `web/app/lib/extractMetadata.ts` (tags + BPM detection + key detection + thumbnail)
- Agent API: `web/app/api/agent/route.ts` (Linus system prompt, Claude API, mock fallback)
- Stream API: `web/app/api/stream/route.ts` (FFmpeg RTMP streaming control)
- Animated icons: `web/components/ui/*.tsx` (lucide-animated components via shadcn)
- Desktop tools: `desktop/tools/*.js` (Node.js scripts)
- Shared orchestrator: `shared/tools/agent_orchestrator.js`

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

- `.env` at project root — holds `AGENT_PROVIDER`, `CLAUDE_API_KEY`, `AGENT_MODEL`
- Never commit `.env`
- `AGENT_PROVIDER=cli` — uses Claude CLI with Pro+ subscription (default)
- `AGENT_PROVIDER=claude` — uses Claude API with standard API key (`sk-ant-api03-`)
- `AGENT_PROVIDER=mock` — demo mode, pattern-matching fallback, no AI
- OAuth tokens (`sk-ant-oat01-`) don't work for the API

## Playlist Defaults

- Sorted A-Z by title (always)
- Duplicate detection by filename on upload
- Language always stored uppercase (EN, NL, DE, FR, etc.)
- Times played counter per track (persisted)

## Live Streaming

- Requires **FFmpeg** installed locally: `brew install ffmpeg`
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

## Multi-Platform Distribution (Planned)

The web app is the primary development target. Once fully functional, the desktop app will be built using Electron + Vite for:
- **macOS** (.dmg)
- **Linux** (.AppImage / .deb)
- **Windows** (.exe / .msi)

The desktop build wraps the same web codebase with native file system access and local video library management.
