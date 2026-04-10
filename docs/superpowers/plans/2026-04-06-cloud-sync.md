# Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the web app to sync track metadata to PostgreSQL and upload video files to MinIO in the background, while keeping local playback instant. Also connect Linus conversation data to the admin dashboard.

**Architecture:** Three-layer storage (in-memory File refs -> IndexedDB cache -> PostgreSQL/MinIO cloud). A `syncEngine` module orchestrates background uploads and metadata sync. On refresh, tracks load from IndexedDB instantly, then resolve video URLs from memory or MinIO pre-signed URLs.

**Tech Stack:** Next.js 16, Zustand, IndexedDB, PostgreSQL (pg), MinIO (@aws-sdk/client-s3), existing `shared/db/*` modules and API routes.

---

### Task 1: Add `minio_key` and `userId` to Client Track Type + Session API

**Files:**
- Modify: `web/app/hooks/usePlayerStore.ts:8-31`
- Create: `web/app/api/auth/session/route.ts`

- [ ] **Step 1: Add cloud fields to Track interface**

In `web/app/hooks/usePlayerStore.ts`, add `minioKey` and `uploadStatus` to the Track interface:

```typescript
export interface Track {
  id: string
  title: string
  artist: string
  album: string
  remixer: string
  genre: string
  language: string | null
  bpm: number
  key: string
  released: string
  duration: number
  timesPlayed: number
  thumbnail?: string
  file?: string
  videoUrl?: string
  badFile?: boolean
  badReason?: string
  loudness?: number
  /** MinIO storage key — set after upload completes */
  minioKey?: string
  /** Upload status: undefined = not started, 'uploading' | 'uploaded' | 'failed' */
  uploadStatus?: 'uploading' | 'uploaded' | 'failed'
}
```

- [ ] **Step 2: Create session API route**

Create `web/app/api/auth/session/route.ts` — resolves the session cookie to a userId:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ghost:gh0st_s3cure_p4ss@localhost:5432/videodj_studio',
  max: 3,
})

export async function GET(req: NextRequest) {
  const session = req.cookies.get('videodj_session')
  if (!session?.value) {
    return NextResponse.json({ userId: null })
  }

  try {
    const result = await pool.query(
      `SELECT s.user_id, u.email, u.name, u.role
       FROM auth_sessions s JOIN users u ON s.user_id = u.id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [session.value]
    )
    const row = result.rows[0]
    if (!row) return NextResponse.json({ userId: null })
    return NextResponse.json({ userId: row.user_id, email: row.email, name: row.name, role: row.role })
  } catch (err) {
    console.error('Session lookup error:', err)
    return NextResponse.json({ userId: null }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verify the session route works locally**

Run: `curl -s http://localhost:3030/api/auth/session | jq .`
Expected: `{ "userId": null }` (no cookie = no user, confirms route works)

- [ ] **Step 4: Commit**

```bash
git add web/app/hooks/usePlayerStore.ts web/app/api/auth/session/route.ts
git commit -m "feat: add minioKey/uploadStatus to Track, add session API route"
```

---

### Task 2: Create `shared/db/conversations.ts` + Linus API Routes

**Files:**
- Create: `shared/db/conversations.ts`
- Modify: `shared/db/index.ts`
- Create: `web/app/api/linus/conversations/route.ts`
- Create: `admin/app/api/linus/conversations/route.ts`

- [ ] **Step 1: Create the conversations database module**

Create `shared/db/conversations.ts`:

```typescript
import { query, queryOne, queryMany } from './client.js'

export interface LinusConversation {
  id: string
  user_id: string
  summary: string
  topics: string[]
  actions: string[]
  message_count: number
  created_at: string
}

export async function saveConversation(data: {
  user_id: string
  summary: string
  topics: string[]
  actions: string[]
  message_count: number
}): Promise<LinusConversation> {
  const result = await queryOne<LinusConversation>(
    `INSERT INTO linus_conversations (user_id, summary, topics, actions, message_count)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.user_id, data.summary, data.topics, data.actions, data.message_count]
  )
  return result!
}

export async function getConversations(userId: string, limit = 20): Promise<LinusConversation[]> {
  return queryMany<LinusConversation>(
    'SELECT * FROM linus_conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit]
  )
}

export async function getRecentConversations(limit = 50): Promise<LinusConversation[]> {
  return queryMany<LinusConversation>(
    `SELECT c.*, u.email, u.name as user_name
     FROM linus_conversations c
     JOIN users u ON c.user_id = u.id
     ORDER BY c.created_at DESC LIMIT $1`,
    [limit]
  )
}
```

- [ ] **Step 2: Add export to shared/db/index.ts**

In `shared/db/index.ts`, add:

```typescript
export * from './conversations.js'
```

- [ ] **Step 3: Create SQL table for conversations**

The table needs to be created on the PostgreSQL server. Create `shared/db/migrations/001_linus_conversations.sql`:

```sql
CREATE TABLE IF NOT EXISTS linus_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  topics TEXT[] DEFAULT '{}',
  actions TEXT[] DEFAULT '{}',
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_linus_conversations_user_id ON linus_conversations(user_id);
CREATE INDEX idx_linus_conversations_created_at ON linus_conversations(created_at DESC);
```

- [ ] **Step 4: Run the migration on the database**

```bash
psql "postgresql://ghost:gh0st_s3cure_p4ss@187.124.209.17:5433/videodj_studio" -f shared/db/migrations/001_linus_conversations.sql
```

Expected: `CREATE TABLE`, `CREATE INDEX` x2

- [ ] **Step 5: Create web app Linus conversations API route**

Create `web/app/api/linus/conversations/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ghost:gh0st_s3cure_p4ss@localhost:5432/videodj_studio',
  max: 3,
})

async function getUserId(req: NextRequest): Promise<string | null> {
  const session = req.cookies.get('videodj_session')
  if (!session?.value) return null
  const result = await pool.query(
    'SELECT user_id FROM auth_sessions WHERE token = $1 AND expires_at > NOW()',
    [session.value]
  )
  return result.rows[0]?.user_id || null
}

export async function POST(req: NextRequest) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { summary, topics, actions, messageCount } = await req.json()
    if (!summary) return NextResponse.json({ error: 'summary required' }, { status: 400 })

    const result = await pool.query(
      `INSERT INTO linus_conversations (user_id, summary, topics, actions, message_count)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, summary, topics || [], actions || [], messageCount || 0]
    )

    return NextResponse.json({ conversation: result.rows[0] })
  } catch (err) {
    console.error('Linus conversations POST error:', err)
    return NextResponse.json({ error: 'Failed to save conversation' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20')

  try {
    const result = await pool.query(
      'SELECT * FROM linus_conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit]
    )
    return NextResponse.json({ conversations: result.rows })
  } catch (err) {
    console.error('Linus conversations GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}
```

- [ ] **Step 6: Create admin Linus conversations API route**

Create `admin/app/api/linus/conversations/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ghost:gh0st_s3cure_p4ss@187.124.209.17:5433/videodj_studio',
  max: 3,
})

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50')

  try {
    const result = await pool.query(
      `SELECT c.*, u.email, u.name as user_name
       FROM linus_conversations c
       JOIN users u ON c.user_id = u.id
       ORDER BY c.created_at DESC LIMIT $1`,
      [limit]
    )
    return NextResponse.json({ conversations: result.rows })
  } catch (err) {
    console.error('Admin Linus conversations error:', err)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add shared/db/conversations.ts shared/db/index.ts shared/db/migrations/ web/app/api/linus/conversations/route.ts admin/app/api/linus/conversations/route.ts
git commit -m "feat: add Linus conversations PostgreSQL table + API routes (web + admin)"
```

---

### Task 3: Create `syncEngine.ts` — Upload Queue + Metadata Sync

**Files:**
- Create: `web/app/lib/syncEngine.ts`

- [ ] **Step 1: Create the sync engine module**

Create `web/app/lib/syncEngine.ts`:

```typescript
/**
 * syncEngine — background sync orchestrator for videoDJ.Studio
 *
 * Handles:
 * - Upload queue: video files -> MinIO (3 concurrent, priority for live mode)
 * - Metadata sync: track data -> PostgreSQL (batched, write-through)
 * - Conversation sync: Linus summaries -> PostgreSQL
 * - Reconcile: pull cloud state -> merge into IndexedDB on load
 */

import type { Track } from '@/app/hooks/usePlayerStore'
import { uploadToCloud, getStreamUrl } from '@/app/lib/cloudStorage'
import { updateTrackMeta as updateLocalTrackMeta } from '@/app/lib/db'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SyncMode = 'setup' | 'active' | 'live'

interface UploadJob {
  trackId: string
  file: File
  userId: string
  priority: boolean
  retries: number
}

interface SyncStatus {
  uploading: { current: number; total: number; failed: number }
  syncing: boolean
  online: boolean
  mode: SyncMode
}

type StatusListener = (status: SyncStatus) => void

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let mode: SyncMode = 'setup'
let userId: string | null = null

const uploadQueue: UploadJob[] = []
let activeUploads = 0
const MAX_RETRIES = 3
const listeners: Set<StatusListener> = new Set()
let totalEnqueued = 0
let totalFailed = 0

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function getStatus(): SyncStatus {
  return {
    uploading: { current: activeUploads, total: uploadQueue.length + activeUploads, failed: totalFailed },
    syncing: false,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    mode,
  }
}

function notify() {
  const s = getStatus()
  listeners.forEach(fn => fn(s))
}

export function onStatusChange(fn: StatusListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

function maxConcurrency(): number {
  return mode === 'live' ? 2 : 3
}

function hasPrioritySlot(): boolean {
  return mode === 'live'
}

// ---------------------------------------------------------------------------
// Upload Queue
// ---------------------------------------------------------------------------

function processQueue() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return

  // Process priority jobs first in live mode
  if (hasPrioritySlot() && activeUploads < maxConcurrency() + 1) {
    const priorityIdx = uploadQueue.findIndex(j => j.priority)
    if (priorityIdx !== -1) {
      const job = uploadQueue.splice(priorityIdx, 1)[0]
      runUpload(job)
    }
  }

  // Fill remaining slots
  while (activeUploads < maxConcurrency() && uploadQueue.length > 0) {
    const job = uploadQueue.shift()!
    runUpload(job)
  }
}

async function runUpload(job: UploadJob) {
  activeUploads++
  notify()

  try {
    const { key } = await uploadToCloud(job.file, job.userId, job.trackId)

    // Update local metadata with minio_key
    await updateLocalTrackMeta(job.trackId, { minioKey: key, uploadStatus: 'uploaded' } as Partial<Track>)

    // Sync minio_key to PostgreSQL
    await fetch('/api/tracks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: job.trackId, minio_key: key }),
    })
  } catch (err) {
    console.error(`[syncEngine] Upload failed for ${job.trackId}:`, err)
    job.retries++
    if (job.retries < MAX_RETRIES) {
      // Exponential backoff: 1s, 4s, 16s
      const delay = Math.pow(4, job.retries - 1) * 1000
      setTimeout(() => {
        uploadQueue.push(job)
        processQueue()
      }, delay)
    } else {
      totalFailed++
      await updateLocalTrackMeta(job.trackId, { uploadStatus: 'failed' } as Partial<Track>)
    }
  } finally {
    activeUploads--
    notify()
    processQueue()
  }
}

export function enqueueUpload(trackId: string, file: File, priority = false) {
  if (!userId) {
    console.warn('[syncEngine] No userId — skipping upload')
    return
  }
  totalEnqueued++
  uploadQueue.push({ trackId, file, userId, priority, retries: 0 })
  notify()
  processQueue()
}

// ---------------------------------------------------------------------------
// Metadata Sync (PostgreSQL)
// ---------------------------------------------------------------------------

/** Map client Track (camelCase) to PostgreSQL fields (snake_case) */
function toDbFields(track: Track): Record<string, unknown> {
  return {
    title: track.title,
    artist: track.artist,
    album: track.album,
    remixer: track.remixer,
    genre: track.genre,
    language: track.language,
    bpm: track.bpm,
    key: track.key,
    released: track.released,
    duration: track.duration,
    times_played: track.timesPlayed,
    file_name: track.file,
    minio_key: track.minioKey || null,
    bad_file: track.badFile || false,
    bad_reason: track.badReason || null,
    loudness: track.loudness || null,
    thumbnail_url: track.thumbnail || null,
  }
}

/** Map PostgreSQL row (snake_case) to client Track (camelCase) */
function fromDbRow(row: Record<string, unknown>): Partial<Track> {
  return {
    id: row.id as string,
    title: row.title as string,
    artist: row.artist as string,
    album: row.album as string,
    remixer: row.remixer as string,
    genre: row.genre as string,
    language: row.language as string | null,
    bpm: row.bpm as number,
    key: row.key as string,
    released: row.released as string,
    duration: row.duration as number,
    timesPlayed: row.times_played as number,
    file: row.file_name as string,
    minioKey: row.minio_key as string | undefined,
    badFile: row.bad_file as boolean,
    badReason: row.bad_reason as string | undefined,
    loudness: row.loudness as number | undefined,
    thumbnail: row.thumbnail_url as string | undefined,
  }
}

/** Sync a batch of tracks to PostgreSQL. Skips failures silently. */
export async function syncMetadata(tracks: Track[]) {
  if (!userId) return
  const BATCH = 50

  for (let i = 0; i < tracks.length; i += BATCH) {
    const batch = tracks.slice(i, i + BATCH)
    try {
      await Promise.allSettled(batch.map(track =>
        fetch('/api/tracks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, ...toDbFields(track) }),
        }).then(async res => {
          if (res.status === 409) {
            // Already exists — update instead
            await fetch('/api/tracks', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: track.id, ...toDbFields(track) }),
            })
          }
        })
      ))
    } catch (err) {
      console.error('[syncEngine] Metadata batch sync error:', err)
    }
  }
}

/** Sync a single track update to PostgreSQL */
export async function syncTrackUpdate(trackId: string, updates: Partial<Track>) {
  if (!userId) return
  try {
    const dbUpdates: Record<string, unknown> = {}
    if (updates.title !== undefined) dbUpdates.title = updates.title
    if (updates.artist !== undefined) dbUpdates.artist = updates.artist
    if (updates.album !== undefined) dbUpdates.album = updates.album
    if (updates.remixer !== undefined) dbUpdates.remixer = updates.remixer
    if (updates.genre !== undefined) dbUpdates.genre = updates.genre
    if (updates.language !== undefined) dbUpdates.language = updates.language
    if (updates.bpm !== undefined) dbUpdates.bpm = updates.bpm
    if (updates.key !== undefined) dbUpdates.key = updates.key
    if (updates.released !== undefined) dbUpdates.released = updates.released
    if (updates.timesPlayed !== undefined) dbUpdates.times_played = updates.timesPlayed
    if (updates.badFile !== undefined) dbUpdates.bad_file = updates.badFile
    if (updates.badReason !== undefined) dbUpdates.bad_reason = updates.badReason
    if (updates.loudness !== undefined) dbUpdates.loudness = updates.loudness
    if (updates.minioKey !== undefined) dbUpdates.minio_key = updates.minioKey

    if (Object.keys(dbUpdates).length > 0) {
      await fetch('/api/tracks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: trackId, ...dbUpdates }),
      })
    }
  } catch (err) {
    console.error('[syncEngine] Track update sync error:', err)
  }
}

// ---------------------------------------------------------------------------
// Reconcile (pull cloud state into local)
// ---------------------------------------------------------------------------

/** Pull tracks from PostgreSQL, merge missing ones into local list */
export async function reconcile(): Promise<Partial<Track>[]> {
  if (!userId) return []
  try {
    const res = await fetch(`/api/tracks?userId=${userId}`)
    if (!res.ok) return []
    const { tracks } = await res.json()
    return (tracks || []).map((row: Record<string, unknown>) => fromDbRow(row))
  } catch (err) {
    console.error('[syncEngine] Reconcile error:', err)
    return []
  }
}

// ---------------------------------------------------------------------------
// Video URL Resolution
// ---------------------------------------------------------------------------

/** For tracks with minioKey but no videoUrl, fetch pre-signed stream URLs */
export async function resolveVideoUrls(tracks: Track[]): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>()
  const needUrls = tracks.filter(t => !t.videoUrl && t.minioKey)

  await Promise.allSettled(needUrls.map(async track => {
    try {
      const url = await getStreamUrl(track.minioKey!)
      urlMap.set(track.id, url)
    } catch {
      // Silently skip — track stays unplayable
    }
  }))

  return urlMap
}

// ---------------------------------------------------------------------------
// Conversation Sync
// ---------------------------------------------------------------------------

export async function syncConversation(data: {
  summary: string
  topics: string[]
  actions: string[]
  messageCount: number
}) {
  try {
    await fetch('/api/linus/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch (err) {
    console.error('[syncEngine] Conversation sync error:', err)
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function setMode(newMode: SyncMode) {
  mode = newMode
  notify()
}

export async function start(): Promise<string | null> {
  // Resolve current user
  try {
    const res = await fetch('/api/auth/session')
    const data = await res.json()
    userId = data.userId
  } catch {
    userId = null
  }

  // Listen for online/offline
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { notify(); processQueue() })
    window.addEventListener('offline', () => notify())
  }

  return userId
}

export function getUserId(): string | null {
  return userId
}
```

- [ ] **Step 2: Verify the module compiles**

Run: `cd web && npx tsc --noEmit 2>&1 | grep syncEngine` (should produce no errors)

- [ ] **Step 3: Commit**

```bash
git add web/app/lib/syncEngine.ts
git commit -m "feat: add syncEngine — upload queue, metadata sync, conversation sync, reconcile"
```

---

### Task 4: Wire syncEngine into Page Load + Folder Scan

**Files:**
- Modify: `web/app/page.tsx` (import syncEngine, call start on mount, enqueue uploads on scan)

- [ ] **Step 1: Add syncEngine imports to page.tsx**

At the top of `web/app/page.tsx`, add:

```typescript
import * as syncEngine from '@/app/lib/syncEngine'
```

- [ ] **Step 2: Initialize syncEngine on mount**

In the main `useEffect` that runs on mount (the one that calls `loadAllTracks()`), add syncEngine initialization after loading tracks. Find the block around line 187:

```typescript
const tracks = await loadAllTracks()
console.log(`[restore] ${tracks.length} tracks loaded, ${tracks.filter(t => !!t.videoUrl).length} with blobs`)
```

Add after it:

```typescript
// Start cloud sync engine
const cloudUserId = await syncEngine.start()
if (cloudUserId) {
  // Reconcile: pull any cloud-only tracks into local
  const cloudTracks = await syncEngine.reconcile()
  if (cloudTracks.length > 0) {
    const localIds = new Set(tracks.map(t => t.id))
    const newFromCloud = cloudTracks.filter(ct => ct.id && !localIds.has(ct.id))
    if (newFromCloud.length > 0) {
      console.log(`[sync] ${newFromCloud.length} tracks found in cloud but not local`)
      // These tracks have minioKey but no videoUrl yet — resolve URLs
      const merged = [...tracks, ...newFromCloud as Track[]]
      setLibrary(merged)
      // Resolve MinIO video URLs for tracks without local files
      const urlMap = await syncEngine.resolveVideoUrls(merged)
      if (urlMap.size > 0) {
        const withUrls = merged.map(t => urlMap.has(t.id) ? { ...t, videoUrl: urlMap.get(t.id) } : t)
        setLibrary(withUrls)
      }
    }
  }
}
```

- [ ] **Step 3: Enqueue uploads after folder scan**

In the folder scan handler (the function that processes scanned files, around line 660-702), after `saveTracks(newItems)` and the library update, add:

```typescript
// Background: sync metadata to PostgreSQL + enqueue MinIO uploads
if (syncEngine.getUserId()) {
  syncEngine.syncMetadata(newTracks)
  for (const item of newItems) {
    if (item.blob instanceof File) {
      syncEngine.enqueueUpload(item.track.id, item.blob)
    }
  }
}
```

- [ ] **Step 4: Sync metadata updates**

Find the places in page.tsx where `updateTrackMeta` is called (inline edit saves, play count increments). After each `updateTrackMeta(id, updates)` call, add:

```typescript
syncEngine.syncTrackUpdate(id, updates)
```

- [ ] **Step 5: Set live mode when streaming**

Find where the stream starts (look for `setIsLive(true)` or similar). Add:

```typescript
syncEngine.setMode('live')
```

And where stream stops:

```typescript
syncEngine.setMode('active')
```

- [ ] **Step 6: Verify dev server loads without errors**

Open `http://localhost:3030` — check browser console for `[sync]` and `[syncEngine]` log messages. No crash on load.

- [ ] **Step 7: Commit**

```bash
git add web/app/page.tsx
git commit -m "feat: wire syncEngine into page load, folder scan, metadata updates, and live mode"
```

---

### Task 5: Wire Linus Conversation Sync into CommandBar

**Files:**
- Modify: `web/components/command/CommandBar.tsx:245-270`

- [ ] **Step 1: Add syncEngine import**

At the top of `CommandBar.tsx`, add:

```typescript
import * as syncEngine from '@/app/lib/syncEngine'
```

- [ ] **Step 2: Add cloud sync after conversation summary**

In the `handleClose` callback (around line 245-270), after the existing `saveLinusMemory()` call, add the cloud sync. The block currently looks like:

```typescript
if (data.success && data.summary) {
  await saveLinusMemory({
    timestamp: new Date().toISOString(),
    summary: data.summary,
    topics: data.topics || [],
    actions: data.actions || [],
  })
  // Reload memories so next session has them
  const updated = await loadLinusMemories()
  setMemories(updated)
}
```

Add after `setMemories(updated)`:

```typescript
// Sync to cloud for admin dashboard
syncEngine.syncConversation({
  summary: data.summary,
  topics: data.topics || [],
  actions: data.actions || [],
  messageCount: msgs.length,
})
```

- [ ] **Step 3: Commit**

```bash
git add web/components/command/CommandBar.tsx
git commit -m "feat: sync Linus conversations to PostgreSQL on chat close"
```

---

### Task 6: Update Admin Dashboard to Show Real Conversations

**Files:**
- Modify: `admin/app/(dashboard)/linus/page.tsx`

- [ ] **Step 1: Replace static placeholder with data fetching**

Replace the entire content of `admin/app/(dashboard)/linus/page.tsx`:

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Bot, MessageSquare, Zap, Terminal, TrendingUp, RefreshCw } from 'lucide-react'
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter'

interface Conversation {
  id: string
  user_id: string
  user_name: string | null
  email: string
  summary: string
  topics: string[]
  actions: string[]
  message_count: number
  created_at: string
}

export default function LinusPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/linus/conversations?limit=50')
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConversations()
    const interval = setInterval(fetchConversations, 30000)
    return () => clearInterval(interval)
  }, [fetchConversations])

  const totalMessages = conversations.reduce((sum, c) => sum + c.message_count, 0)

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold glow-green" style={{ color: 'var(--linus-green)' }}>Linus AI Agent</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Conversation history, API usage, and model configuration
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Conversations', value: conversations.length, icon: MessageSquare, accent: 'var(--linus-green)' },
          { label: 'Total Messages', value: totalMessages, icon: Terminal, accent: 'var(--linus-green)' },
          { label: 'Avg Messages/Conv', value: conversations.length > 0 ? Math.round(totalMessages / conversations.length) : 0, icon: Zap, accent: 'var(--status-amber)' },
          { label: 'Active Users', value: new Set(conversations.map(c => c.user_id)).size, icon: TrendingUp, accent: 'var(--status-green)' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}
            className="glass-card glass-card--linus p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={14} style={{ color: stat.accent }} />
              <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-tertiary)' }}>{stat.label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: stat.accent }}>
              <AnimatedCounter value={stat.value} />
            </p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Model config */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="glass-card glass-card--linus p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Zap size={14} style={{ color: 'var(--linus-green)' }} />
            Model Configuration
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Provider', value: 'Anthropic (Claude API)' },
              { label: 'Model', value: 'claude-sonnet-4-20250514' },
              { label: 'Mode', value: 'API Key' },
              { label: 'Fallback', value: 'Ollama/Qwen 2.5 (after KVM8 migration)' },
              { label: 'Status', value: 'Active' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.label}</span>
                <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent conversations */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="glass-card glass-card--linus p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <MessageSquare size={14} style={{ color: 'var(--linus-green)' }} />
            Recent Conversations
            <button onClick={fetchConversations} className="ml-auto" style={{ color: 'var(--text-tertiary)' }}>
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          </h3>
          {conversations.length === 0 ? (
            <div className="flex items-center justify-center py-12 gap-3" style={{ color: 'var(--text-tertiary)' }}>
              <Bot size={24} style={{ opacity: 0.3, color: 'var(--linus-green)' }} />
              <div>
                <p className="text-sm">{loading ? 'Loading...' : 'No conversations yet'}</p>
                <p className="text-[11px] mt-0.5">{loading ? '' : 'Conversations appear here after users chat with Linus'}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {conversations.slice(0, 10).map(conv => (
                <div key={conv.id} className="p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono" style={{ color: 'var(--linus-green)' }}>
                      {conv.user_name || conv.email}
                    </span>
                    <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(conv.created_at).toLocaleString()} — {conv.message_count} msgs
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{conv.summary}</p>
                  {conv.topics.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {conv.topics.map(topic => (
                        <span key={topic} className="px-1.5 py-0.5 rounded text-[9px]"
                          style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--linus-green)', border: '1px solid rgba(34,197,94,0.2)' }}>
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Command stats */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="glass-card glass-card--linus p-6">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Terminal size={14} style={{ color: 'var(--linus-green)' }} />
          Slash Command Usage
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {['/scan', '/fix-bpm', '/playlist', '/automix', '/filter', '/health', '/key-detect', '/suggest-next'].map((cmd, i) => (
            <motion.div key={cmd} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 + i * 0.03 }}
              className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
              <span className="text-xs font-mono" style={{ color: 'var(--linus-green)' }}>{cmd}</span>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>0</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
```

- [ ] **Step 2: Verify admin builds**

Run: `cd admin && npx tsc --noEmit 2>&1 | grep -i error | head -5`
Expected: No errors related to the linus page

- [ ] **Step 3: Commit**

```bash
git add admin/app/\(dashboard\)/linus/page.tsx
git commit -m "feat: admin Linus page shows real conversations from PostgreSQL"
```

---

### Task 7: Update `db.ts` to Persist `minioKey` and `uploadStatus`

**Files:**
- Modify: `web/app/lib/db.ts`

- [ ] **Step 1: Ensure minioKey and uploadStatus are saved/loaded in IndexedDB**

The `saveTrack` and `loadAllTracks` functions strip `videoUrl` before saving to IndexedDB. The new `minioKey` and `uploadStatus` fields need to pass through. Since IndexedDB is schemaless, they'll persist automatically as part of the track object — but we need to make sure `loadAllTracks` resolves video URLs from MinIO when File refs aren't available.

In `web/app/lib/db.ts`, modify the `loadAllTracks` function. Find the return statement that maps metas:

```typescript
return metas.map(meta => ({
  ...defaults,
  ...meta,
  videoUrl: getVideoUrl(meta.id),
}))
```

Replace with:

```typescript
return metas.map(meta => {
  const localUrl = getVideoUrl(meta.id)
  return {
    ...defaults,
    ...meta,
    videoUrl: localUrl || undefined,
    // minioKey passes through from IndexedDB — videoUrl resolved later by syncEngine
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add web/app/lib/db.ts
git commit -m "feat: db.ts preserves minioKey through IndexedDB load/save cycle"
```

---

### Task 8: Integration Test — Full Flow

**Files:** No new files — manual verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev:web
```

- [ ] **Step 2: Test session API**

Open browser, log in at `http://localhost:3030/login`, then:
```bash
curl -s http://localhost:3030/api/auth/session --cookie "videodj_session=YOUR_TOKEN" | jq .
```
Expected: `{ "userId": "...", "email": "...", "name": "...", "role": "..." }`

- [ ] **Step 3: Test folder scan + upload**

1. Open the app, scan a folder with a few video files
2. Check browser console for `[syncEngine]` messages
3. Verify tracks appear in playlist with metadata

- [ ] **Step 4: Test Linus conversation sync**

1. Open Linus chat, send a few messages, close the chat panel
2. Check browser console for conversation sync POST
3. Open admin dashboard at `http://localhost:3050` (or admin.videodj.studio)
4. Navigate to Linus page — verify conversation appears

- [ ] **Step 5: Test page refresh**

1. Refresh the page
2. Tracks should load from IndexedDB (metadata visible)
3. Tracks with minioKey should resolve video URLs from MinIO (may take a moment)
4. Tracks without minioKey show as unplayable

- [ ] **Step 6: Final commit + push**

```bash
git add -A
git commit -m "feat: cloud sync phase 2+3 complete — PostgreSQL metadata, MinIO uploads, Linus conversations"
git push origin main
```

---

## File Summary

| Action | File | Purpose |
|--------|------|---------|
| Modify | `web/app/hooks/usePlayerStore.ts` | Add `minioKey`, `uploadStatus` to Track |
| Create | `web/app/api/auth/session/route.ts` | Resolve session cookie to userId |
| Create | `shared/db/conversations.ts` | Linus conversations CRUD |
| Create | `shared/db/migrations/001_linus_conversations.sql` | PostgreSQL table |
| Modify | `shared/db/index.ts` | Export conversations module |
| Create | `web/app/api/linus/conversations/route.ts` | Web Linus API |
| Create | `admin/app/api/linus/conversations/route.ts` | Admin Linus API |
| Create | `web/app/lib/syncEngine.ts` | Upload queue + metadata sync + reconcile |
| Modify | `web/app/page.tsx` | Init syncEngine, enqueue uploads, reconcile |
| Modify | `web/components/command/CommandBar.tsx` | Sync conversations on close |
| Modify | `admin/app/(dashboard)/linus/page.tsx` | Real conversation data |
| Modify | `web/app/lib/db.ts` | Preserve minioKey through IndexedDB |
