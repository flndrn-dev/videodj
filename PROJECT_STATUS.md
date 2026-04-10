# videoDJ.Studio — Project Status

## Core Application

- [x] Dual-deck DJ UI (Deck A blue, Deck B red)
- [x] Live waveform visualization (Web Audio API)
- [x] Custom crossfader with auto-slide
- [x] Video playback with opacity control per deck
- [x] Metadata extraction (BPM, key, genre, language from tags + audio analysis)
- [x] Automix engine (BPM matching, Camelot key, energy curves, beatmatching)
- [x] Autoplay (random BPM-matched with crossfade)
- [x] Playlist browser (search, inline edit, drag & drop)
- [x] User playlists (create, save, delete)
- [x] Play count tracking per track
- [x] Duplicate detection by filename on upload
- [x] Pro DJ features (key lock, frequency waveform, auto-gain, video transitions)
- [x] Upload progress indicator in UI (floating UploadIndicator + per-track cloud status icons)
- [x] "Upload pending" visual indicator on tracks without cloud backup
- [ ] Re-scan folder prompt when tracks have no video after refresh
- [ ] BPM-synced visual effects
- [ ] Mobile-responsive UI (current min: iPad 10.2" landscape)

## Linus AI Agent

- [x] Claude-powered DJ agent with 30+ slash commands
- [x] Floating chat panel (bottom-right FAB)
- [x] Command reference modal
- [x] Conversation summaries saved to IndexedDB
- [x] Conversation sync to PostgreSQL (admin can see them)
- [x] Multi-model provider switching (OpenAI, xAI, DeepSeek, Ollama)
- [ ] Ollama/Qwen 32B as primary on KVM8 VPS

## Live Streaming

- [x] Canvas compositor (crossfade blend of both decks)
- [x] Now Playing overlay (title, artist, BPM, key)
- [x] FFmpeg RTMP output to Twitch/YouTube
- [x] Stream Dashboard with platform selection
- [x] Twitch OAuth integration (Client ID, Secret, stream key auto-detect)
- [x] Twitch IRC chat client (read chat in-app)
- [x] Stream resolution (720p/1080p) and bitrate control
- [x] YouTube Live Chat polling (API v3, auto-pagination, rate limit handling)
- [ ] Stream schedule management from within the app

## Database & Storage

- [x] Phase 1: In-memory File refs (no more blobs in IndexedDB)
- [x] Phase 2: PostgreSQL metadata sync (tracks, playlists, conversations)
- [x] Phase 3: MinIO video file uploads (background queue, 3 concurrent)
- [x] syncEngine.ts — central orchestrator for all background sync
- [x] Upload queue with priority (live mode: 2 + 1 priority slot)
- [x] Retry with exponential backoff (3 attempts)
- [x] Pre-signed URL resolution for cloud-stored tracks
- [x] Session API route (/api/auth/session)
- [x] Tracks API (/api/tracks — CRUD)
- [x] Playlists API (/api/playlists — CRUD)
- [x] Linus conversations API (/api/linus/conversations)
- [x] Storage API (/api/storage — pre-signed URLs)
- [x] SQL migrations for linus_conversations and user_playlists tables
- [x] One-time IndexedDB-to-cloud migration script
- [x] Real-time multi-device sync via SSE
- [ ] MinIO server setup verification (s3.videodj.studio)
- [ ] NEXT_PUBLIC_MINIO_ENABLED env var in Dokploy

## Authentication & Users

- [x] Magic link auth flow (email, 15min token, 30-day session)
- [x] Session cookie (videodj_session)
- [x] Role-based access (admin, support_agent, beta_tester, subscriber)
- [x] User status management (active, invited, disabled)
- [x] Proxy.ts auth middleware (Next.js 16)
- [x] Login page on same domain (/login)
- [ ] Payment integration (Stripe/Mollie)
- [ ] User subscription management
- [x] Self-service account creation (/signup page, auto-create subscriber on magic link)
- [x] Rate limiting on auth routes (5 req/min per IP)

## Production Deployment

- [x] Dockerfile with standalone output + FFmpeg
- [x] Dokploy auto-deploy from GitHub push
- [x] Twitch OAuth dynamic redirect URL
- [x] Proxy auth redirect to /login on same domain
- [x] PostgreSQL on VPS (187.124.209.17:5433)
- [ ] MinIO object storage on VPS
- [ ] Docker health checks
- [ ] Rate limiting on API routes
- [ ] Error monitoring (Sentry or similar)

## Admin Dashboard (admin.videodj.studio)

- [x] Dashboard overview page
- [x] Ghost agent page
- [x] Linus page with real conversation data
- [x] System monitoring page
- [x] Users management page
- [x] Support tickets page
- [x] Dev Zone kanban board
- [x] Finance page
- [x] Desktop download page (temporary)
- [ ] Linus slash command usage stats (real data)
- [ ] User activity analytics
- [ ] Stream history/analytics

## SaaS Site (videodj.studio)

- [x] Landing page
- [x] Pricing page (7-day trial, Fun User, DJ User)
- [x] Features page
- [x] Download page
- [x] Changelog page
- [x] FAQ page
- [x] Terms & Privacy pages
- [x] Contact page
- [x] Pre-launch subscriber flow
- [ ] Payment checkout integration
- [ ] User dashboard (subscription management)

## Desktop App

- [x] Electron + Vite scaffold
- [x] Main process (wraps Next.js standalone)
- [x] IPC bridge (file dialogs, file reading, platform detection)
- [x] electron-builder config (macOS, Windows, Linux)
- [ ] macOS .dmg build
- [ ] Windows .exe / .msi build
- [ ] Linux .AppImage / .deb build
- [ ] Native file system access (no browser API limitations)
- [ ] Auto-update mechanism

## Infrastructure (Planned)

- [ ] KVM8 migration (32GB RAM for Ollama/Qwen 32B)
- [ ] Ghost self-healing background agent on VPS
- [ ] Ollama multi-app serving (videoDJ, mavifinans, live support)
- [ ] Server-side backup as premium feature
- [ ] Shared metadata catalog across users
- [ ] Track recommendations based on play history
- [ ] Playlist sharing between users
