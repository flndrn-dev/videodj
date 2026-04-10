# Production Architecture for videoDJ.Studio

## Overview

This document is the authoritative mapping between the localhost architecture (where everything lives on one machine) and the production architecture (web browser + server + object storage). It describes every subsystem, where its state lives, how it reads/writes, and how the two architectures differ.

**Goal:** Make production behave identically to localhost from the user's perspective, but with cloud-backed storage so data survives page refresh, works across devices, and scales to multiple users.

**Non-goal:** Preserve the IndexedDB-only code paths. Where localhost and production diverge, production wins.

---

## Localhost Architecture (reference)

Everything runs on one machine. The "server" (Next.js API routes) and the "browser" share:
- The local filesystem (File System Access API + `URL.createObjectURL`)
- The browser's IndexedDB
- No authentication — one user, always "you"

### Subsystems

| Subsystem | Where it lives (localhost) | Access pattern |
|-----------|---------------------------|----------------|
| Track library (metadata) | IndexedDB object store `tracks` | Direct browser API |
| Track files (video blobs) | In-memory `fileRefs: Map<id, File>` + `URL.createObjectURL` | Direct browser API |
| User playlists | IndexedDB object store `userPlaylists` | Direct browser API |
| Deck state (which tracks loaded) | IndexedDB object store `preferences` (key: `deckState`) | Direct browser API |
| User preferences (genres, language) | IndexedDB object store `preferences` (key: `userPrefs`) | Direct browser API |
| Linus chat messages (current session) | IndexedDB object store `preferences` (key: `chatMessages`) | Direct browser API |
| Linus memory (summarized history) | IndexedDB object store `linusMemory` | Direct browser API |
| Countdown intro videos | IndexedDB object store `countdowns` (with blob) | Direct browser API |
| Agent settings (API key, model) | `.env` file on disk | Server reads at request time |
| Twitch credentials | `.env` file on disk | Server reads at request time |

### How writes happen
- **Scan folder** → extract metadata → `saveTrack()` → IndexedDB + in-memory file ref
- **Edit track** → `updateTrackMeta()` → IndexedDB write
- **Play count** → `updateTrackMeta()` → IndexedDB write
- **Delete track** → `deleteTrackFromDB()` → IndexedDB delete
- **Create playlist** → `saveUserPlaylist()` → IndexedDB write
- **Linus chat** → `saveChatMessages()` → IndexedDB write
- **Linus chat close** → `saveLinusMemory()` → IndexedDB write
- **Deck load track** → `saveDeckState()` → IndexedDB write

### How reads happen
- **Page load** → `loadAllTracks()` reads IndexedDB + attaches in-memory videoUrls
- **Deck restore** → `loadDeckState()` reads IndexedDB
- **Playlist browser** → in-memory Zustand state (populated from IndexedDB on mount)
- **Command processing** → in-memory library state

---

## Production Architecture (target)

Multi-tenant SaaS. Browser is a thin client. Server is source of truth for all persistent data. Object storage holds large files.

### Infrastructure

| Component | Technology | Location |
|-----------|-----------|----------|
| Web app | Next.js 16 standalone | Docker container on KVM4 |
| Database | PostgreSQL 16 | `ghost-db` container on KVM4 |
| Object storage | MinIO (S3-compatible) | `minio_minio` container on KVM4, public at `s3.videodj.studio` |
| Auth | Magic link + session cookies | Resend + PostgreSQL |
| Real-time sync | Server-Sent Events (SSE) | Next.js API route `/api/sync` |
| AI agent | Anthropic API / Ollama | External (Claude) or KVM4 (Ollama) |

### State location — production

| Subsystem | Where it lives (production) | Access pattern |
|-----------|----------------------------|----------------|
| **Track library metadata** | PostgreSQL `tracks` table | HTTP GET `/api/tracks?userId=X` |
| **Track video files** | MinIO bucket `videodj-files` | Browser → pre-signed URL → MinIO (direct) |
| **User playlists** | PostgreSQL `user_playlists` table | HTTP GET `/api/playlists` |
| **Deck state** | **localStorage** (browser) — UI state, not sensitive | Direct browser API |
| **User preferences** | PostgreSQL `user_preferences` table (TO CREATE) | HTTP GET `/api/preferences` |
| **Linus chat messages** | **Not persisted** — current session only, in-memory React state | — |
| **Linus conversation summaries** | PostgreSQL `linus_conversations` table | HTTP GET `/api/linus/conversations` |
| **Countdown intro videos** | MinIO bucket + PostgreSQL `countdowns` table (TO CREATE) | HTTP + pre-signed URLs |
| **Agent settings** | PostgreSQL `agent_settings` table (TO CREATE, per-user) | HTTP GET `/api/settings/agent` |
| **Twitch credentials** | PostgreSQL `user_integrations` table (TO CREATE, per-user) | HTTP GET `/api/settings/twitch` |

### State location principles

1. **Per-user secrets in PostgreSQL**: agent API keys, Twitch credentials, integration tokens — all encrypted-at-rest (postgres column or app-layer crypto).
2. **Large files in MinIO**: videos, thumbnails, countdown intros — never in PostgreSQL BYTEA, never in IndexedDB.
3. **Session-only UI state in memory**: current chat messages, deck positions during playback, playlist filter — Zustand only.
4. **Per-device UI preferences in localStorage**: sidebar collapsed state, volume levels, last-used tab — not synced across devices.
5. **Never in IndexedDB**: IndexedDB is removed from the library/playlist/playback flow entirely.

---

## Data flows

### 1. Page load (production)

```
Browser → GET / → Next.js → HTML
Browser → Zustand init (empty)
Browser → GET /api/auth/session → { userId } → syncEngine.userId = X
Browser → GET /api/tracks?userId=X → PostgreSQL → tracks[]
Browser → For each track with minio_key: GET /api/storage?key=... → pre-signed URL → attach as videoUrl
Browser → setLibrary(tracks)
Browser → GET /api/playlists → user_playlists[] → setUserPlaylists
Browser → localStorage.getItem('deckState') → restore deck A/B positions
Browser → GET /api/preferences → user prefs → setPrefs
Browser → EventSource /api/sync?userId=X → listen for changes
```

No IndexedDB calls. No scanning on mount. Just HTTP fetch + state hydration.

### 2. Scan folder

```
Browser: showDirectoryPicker() → File[]
Browser: For each file: extractMetadata(file) → { title, artist, bpm, ... }
Browser: For each file: crypto.randomUUID() → id
Browser: POST /api/tracks/batch { userId, tracks: [...] } → returns created rows with server timestamps
Browser: setLibrary(existing + new tracks)  // with local URL.createObjectURL for instant playback
Browser: For each file: enqueueUpload(trackId, file)
  Worker: POST /api/storage → pre-signed URL
  Worker: XHR PUT to MinIO with progress
  Worker: PUT /api/tracks { id, minio_key } → update row
Browser: On upload complete: replace local objectURL with pre-signed stream URL
```

Key design decisions:
- **Batch metadata insert** (1 API call for all tracks) — don't spam PostgreSQL
- **Upload queue with concurrency limit** — 3 parallel uploads, progress tracked per file
- **Local playback works before upload completes** — uses `URL.createObjectURL` for current session
- **After upload**, replace local URL with pre-signed URL so the track survives refresh

### 3. Edit track metadata (inline edit or Linus /fix)

```
Browser: updateTrack(id, changes) → Zustand (in-memory)
Browser: PUT /api/tracks { id, ...changes } → PostgreSQL UPDATE
Browser: POST /api/sync { type: 'tracks', userId } → notify other tabs/devices
```

**No IndexedDB write.** Zustand state is the in-session truth, PostgreSQL is the persistent truth. On next page load, PostgreSQL wins.

### 4. Batch edit (Linus /fix all)

```
Browser: Linus analyzes tracks → returns [{ id, changes }, ...]
Browser: batchUpdateTracks(updates) → Zustand
Browser: PUT /api/tracks/batch { updates } → PostgreSQL in transaction
Browser: POST /api/sync → notify
```

**New endpoint needed**: `PUT /api/tracks/batch` for transactional batch updates.

### 5. Play count increment

```
Browser: onPlay → store.incrementPlays(id)
Browser: PUT /api/tracks { id, times_played } → PostgreSQL
(no sync notification — too noisy, plays happen constantly)
```

### 6. Linus chat

```
Browser: User sends message → in-memory state
Browser: POST /api/agent { messages } → Claude/Ollama → reply
Browser: User closes chat → POST /api/linus/conversations { summary, topics, ... } → PostgreSQL
```

Current chat messages are **NOT persisted** between sessions. Only the summary survives. This is simpler and avoids storing raw conversation content.

### 7. Deck state restore (on refresh)

```
Browser: localStorage.getItem('deckState') → { deckATrackId, deckBTrackId, deckATime, deckBTime }
Browser: After library loads, find tracks by ID, call loadTrack('A', trackA) with saved time
```

**localStorage**, not IndexedDB, not PostgreSQL. It's UI state — single-device is fine.

### 8. Settings (agent API key, Twitch, etc.)

```
Browser: Settings modal → PUT /api/settings/agent { provider, model, api_key }
Server: Encrypt api_key → INSERT/UPDATE agent_settings WHERE user_id = X
Server: Test connection to provider → return { connected: true/false }
Browser: On test success → update UI state, show connected badge
```

---

## PostgreSQL schema — tables to add

```sql
-- Per-user agent/LLM configuration
CREATE TABLE agent_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'anthropic',   -- anthropic, openai, xai, deepseek, google, ollama, custom
  mode TEXT NOT NULL DEFAULT 'apikey',           -- apikey, subscription
  api_key_encrypted TEXT,                        -- encrypted with app secret
  model TEXT,
  endpoint TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-user integration credentials (Twitch, YouTube, etc.)
CREATE TABLE user_integrations (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration TEXT NOT NULL,                     -- 'twitch', 'youtube', 'spotify'
  credentials JSONB NOT NULL DEFAULT '{}',      -- encrypted fields within
  connected_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, integration)
);

-- Per-user preferences (genres, language, BPM range, etc.)
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  favorite_genres TEXT[] DEFAULT '{}',
  favorite_languages TEXT[] DEFAULT '{}',
  bpm_range INT4RANGE,
  notes TEXT,
  setup_complete BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Countdown intro videos (per user)
CREATE TABLE countdown_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  minio_key TEXT NOT NULL,
  duration REAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## API routes — to add or fix

### New routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/tracks/batch` | POST | Bulk insert tracks (1 transaction) |
| `/api/tracks/batch` | PUT | Bulk update tracks |
| `/api/preferences` | GET/PUT | User preferences |
| `/api/settings/agent` | GET/PUT | Agent config (replaces `.env` writing) |
| `/api/settings/integrations` | GET/PUT | Twitch/YouTube credentials |
| `/api/countdowns` | GET/POST/DELETE | Countdown intro videos |

### Existing routes — already correct
- `/api/tracks` GET/POST/PUT/DELETE — tracks CRUD
- `/api/playlists` GET/POST/DELETE — user playlists
- `/api/linus/conversations` GET/POST — chat summaries
- `/api/storage` GET/POST — pre-signed URLs
- `/api/auth/session` GET — resolve session cookie → user
- `/api/auth/magic-link` POST — send login email
- `/api/auth/verify` GET — consume magic link
- `/api/sync` GET/POST — SSE real-time sync

### Routes to remove
- `.env` file writes in `/api/settings` — move all settings to PostgreSQL

---

## Frontend changes needed

### Files to modify
| File | Change |
|------|--------|
| `web/app/lib/db.ts` | Remove all IndexedDB code for tracks/playlists. Keep only `deckState` (localStorage) and `countdowns` (if kept local). |
| `web/app/lib/scanManager.ts` | Already updated — uses PostgreSQL via syncEngine |
| `web/app/lib/syncEngine.ts` | Already exists — extend with batch endpoints |
| `web/app/page.tsx` | Remove all `loadAllTracks`/`saveTracks`/`updateTrackMeta`/`batchUpdateTrackMeta`/`saveDeckState`/`loadDeckState` calls. Replace with HTTP API calls. |
| `web/components/SetupModal.tsx` | Agent settings saved via `/api/settings/agent` instead of POST to `/api/settings` with file writes |
| `web/components/command/CommandBar.tsx` | Remove `saveChatMessages`/`loadChatMessages` — keep messages in-memory. Still save conversation summaries to PostgreSQL. |
| `web/app/api/settings/route.ts` | Keep for Twitch test only. Split agent into `/api/settings/agent`. Remove `writeEnv()`. |
| `web/app/api/agent/route.ts` | Read agent config from PostgreSQL, not from env file |

### Files to delete
- `web/app/lib/migrateIndexedDB.ts` — no longer needed

---

## Security / multi-tenancy

- Every PostgreSQL query must filter by `user_id` from session cookie
- Every MinIO key must start with `users/{userId}/` — pre-signed URLs only signed server-side after user check
- API keys (Anthropic, OpenAI, etc.) encrypted at rest in `agent_settings.api_key_encrypted`
- Session cookies: `httpOnly`, `secure`, `sameSite: lax`, 30-day expiry
- Magic link: single-use, 15-min expiry
- Rate limiting on all API routes (TODO)
- CORS: MinIO bucket allows only `https://app.videodj.studio` + `https://admin.videodj.studio` origins

---

## Migration from current broken state

The existing PostgreSQL has 1402 tracks with snake_case columns. The current frontend reads from IndexedDB. To cut over cleanly:

1. **Deploy new frontend** (reads from PostgreSQL only)
2. **User logs in** — frontend sees empty local state, fetches from PostgreSQL → sees existing 1402 tracks
3. **Tracks without `minio_key`** show as "Upload pending" (metadata visible, no playback)
4. **User re-scans folder** — duplicate detection by filename against PostgreSQL → refreshes File refs in memory → queues MinIO uploads for tracks missing `minio_key`
5. **After uploads complete** — all tracks have `minio_key`, fully functional
6. **Page refresh** works permanently — tracks load from PostgreSQL + MinIO

No IndexedDB migration needed. We skip IndexedDB entirely.

---

## What localhost keeps doing (unchanged)

- Local video file access via `URL.createObjectURL` — the File object is the same in both environments
- Metadata extraction (BPM, key, thumbnail) — runs in browser, same code
- All playback, waveform, automix, streaming — unchanged
- Linus commands — unchanged

The localhost → production difference is ONLY about **where persistent state lives**. Everything else is identical.

---

## Why the current mess exists

The original localhost app assumed:
- One user
- Everything in the browser
- IndexedDB as the database
- `URL.createObjectURL` as the file access

When cloud sync was added, I kept IndexedDB AND added PostgreSQL, thinking both should coexist. That created a dual-write/dual-read system where the two sources can diverge, and bugs in one silently fall back to the other.

The fix is to **delete one side**: in production, IndexedDB no longer exists for tracks/playlists/settings. PostgreSQL is the only source of truth.

## Rollout plan

See companion doc: `docs/superpowers/plans/2026-04-07-production-cutover.md` (to be written based on this architecture)
