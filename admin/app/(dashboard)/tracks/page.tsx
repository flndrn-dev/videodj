'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Music, Search, CheckCircle, XCircle, AlertTriangle, Trash2, Shield, RefreshCw, Download, Pencil, X, Save, Play } from 'lucide-react'

interface TrackRow {
  id: string
  user_id: string
  title: string
  artist: string
  album: string
  genre: string
  bpm: number
  key: string
  duration: number
  bad_file: boolean | null
  bad_reason: string | null
  minio_key: string | null
  file_name: string | null
  times_played: number
  created_at: string
}

interface Stats {
  total: string
  bad: string
  good: string
  no_file: string
}

function formatDuration(s: number): string {
  if (!s) return '--:--'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function TracksPage() {
  const [tracks, setTracks] = useState<TrackRow[]>([])
  const [stats, setStats] = useState<Stats>({ total: '0', bad: '0', good: '0', no_file: '0' })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'good' | 'bad' | 'no_file'>('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<TrackRow>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)
  const [users, setUsers] = useState<{ id: string; email: string; name: string }[]>([])
  const [userFilter, setUserFilter] = useState('')
  const [recovering, setRecovering] = useState(false)
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'ok' | 'broken'>>({})
  const [bulkTesting, setBulkTesting] = useState(false)
  const [bulkTestProgress, setBulkTestProgress] = useState({ done: 0, total: 0, ok: 0, broken: 0 })

  const flagTrackBad = async (trackId: string, bad: boolean, reason?: string) => {
    await fetch('/api/tracks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: trackId, bad_file: bad, bad_reason: bad ? (reason || 'Failed playability test') : null }),
    })
    setTracks(prev => prev.map(t => t.id === trackId
      ? { ...t, bad_file: bad, bad_reason: bad ? (reason || 'Failed playability test') : undefined }
      : t
    ))
  }

  const testTrack = async (trackId: string, minioKey: string) => {
    setTestStatus(prev => ({ ...prev, [trackId]: 'testing' }))
    try {
      const res = await fetch('/api/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', minioKey }),
      })
      const data = await res.json()
      if (!data.streamUrl) {
        setTestStatus(prev => ({ ...prev, [trackId]: 'broken' }))
        await flagTrackBad(trackId, true, 'File missing from storage')
        return
      }

      const video = document.createElement('video')
      video.crossOrigin = 'anonymous'
      video.preload = 'metadata'

      const result = await new Promise<'ok' | 'broken'>((resolve) => {
        const timeout = setTimeout(() => resolve('broken'), 8000)
        video.onloadedmetadata = () => { clearTimeout(timeout); resolve('ok') }
        video.onerror = () => { clearTimeout(timeout); resolve('broken') }
        video.src = data.streamUrl
      })

      video.src = ''
      setTestStatus(prev => ({ ...prev, [trackId]: result }))

      if (result === 'broken') {
        await flagTrackBad(trackId, true, 'Video failed to load')
      } else if (tracks.find(t => t.id === trackId)?.bad_file) {
        await flagTrackBad(trackId, false)
      }
    } catch {
      setTestStatus(prev => ({ ...prev, [trackId]: 'broken' }))
      await flagTrackBad(trackId, true, 'Test error — network or storage')
    }
  }

  const handleBulkTest = async () => {
    const toTest = tracks.filter(t => selected.has(t.id) && t.minio_key)
    if (toTest.length === 0) return
    setBulkTesting(true)
    setBulkTestProgress({ done: 0, total: toTest.length, ok: 0, broken: 0 })

    // Test 3 at a time for speed
    const CONCURRENCY = 3
    let ok = 0, broken = 0, done = 0

    const testOne = async (track: TrackRow) => {
      setTestStatus(prev => ({ ...prev, [track.id]: 'testing' }))
      try {
        const res = await fetch('/api/tracks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'test', minioKey: track.minio_key }),
        })
        const data = await res.json()
        if (!data.streamUrl) {
          setTestStatus(prev => ({ ...prev, [track.id]: 'broken' })); broken++
          await flagTrackBad(track.id, true, 'File missing from storage')
          done++; setBulkTestProgress({ done, total: toTest.length, ok, broken }); return
        }

        const video = document.createElement('video')
        video.crossOrigin = 'anonymous'
        video.preload = 'metadata'
        const result = await new Promise<'ok' | 'broken'>((resolve) => {
          const timeout = setTimeout(() => resolve('broken'), 8000)
          video.onloadedmetadata = () => { clearTimeout(timeout); resolve('ok') }
          video.onerror = () => { clearTimeout(timeout); resolve('broken') }
          video.src = data.streamUrl
        })
        video.src = ''
        setTestStatus(prev => ({ ...prev, [track.id]: result }))
        if (result === 'ok') {
          ok++
          if (track.bad_file) await flagTrackBad(track.id, false)
        } else {
          broken++
          await flagTrackBad(track.id, true, 'Video failed to load')
        }
      } catch {
        setTestStatus(prev => ({ ...prev, [track.id]: 'broken' })); broken++
        await flagTrackBad(track.id, true, 'Test error — network or storage')
      }
      done++
      setBulkTestProgress({ done, total: toTest.length, ok, broken })
    }

    // Process in batches of CONCURRENCY
    for (let i = 0; i < toTest.length; i += CONCURRENCY) {
      const batch = toTest.slice(i, i + CONCURRENCY)
      await Promise.all(batch.map(testOne))
    }

    setBulkTesting(false)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const toggleSelectAll = () => {
    const withFile = tracks.filter(t => t.minio_key)
    if (selected.size === withFile.length) setSelected(new Set())
    else setSelected(new Set(withFile.map(t => t.id)))
  }
  const handleBulkDownload = async () => {
    const toDownload = tracks.filter(t => selected.has(t.id) && t.minio_key)
    if (toDownload.length === 0) return
    setDownloading(true)
    for (const track of toDownload) {
      try {
        const res = await fetch('/api/tracks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'download', minioKey: track.minio_key }),
        })
        const data = await res.json()
        if (data.downloadUrl) {
          const a = document.createElement('a')
          a.href = data.downloadUrl
          a.download = track.file_name || `${track.title}.mp4`
          a.click()
          await new Promise(r => setTimeout(r, 500)) // small delay between downloads
        }
      } catch { /* skip failed */ }
    }
    setDownloading(false)
  }
  const handleBulkDelete = async () => {
    const toDelete = tracks.filter(t => selected.has(t.id))
    if (toDelete.length === 0) return
    if (!confirm(`Delete ${toDelete.length} selected tracks? This is permanent.`)) return
    for (const track of toDelete) {
      await fetch(`/api/tracks?id=${track.id}`, { method: 'DELETE' })
    }
    setTracks(prev => prev.filter(t => !selected.has(t.id)))
    setTotal(prev => prev - toDelete.length)
    setSelected(new Set())
  }

  const fetchTracks = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50', status })
      if (search) params.set('search', search)
      if (userFilter) params.set('userId', userFilter)
      const res = await fetch(`/api/tracks?${params}`)
      const data = await res.json()
      setTracks(data.tracks || [])
      setTotal(data.total || 0)
      setStats(data.stats || stats)
      if (data.users) setUsers(data.users)
    } catch (e) {
      console.error('Failed to fetch tracks:', e)
    }
    setLoading(false)
  }, [page, status, search, userFilter])

  useEffect(() => { fetchTracks() }, [fetchTracks])

  const handleVerify = async (track: TrackRow) => {
    if (!track.minio_key) return
    setVerifying(prev => new Set(prev).add(track.id))
    try {
      const res = await fetch('/api/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', id: track.id, minioKey: track.minio_key }),
      })
      const data = await res.json()
      const update = data.exists
        ? { bad_file: false, bad_reason: null }
        : { bad_file: true, bad_reason: 'File not found in MinIO' }
      await fetch('/api/tracks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: track.id, ...update }),
      })
      setTracks(prev => prev.map(t => t.id === track.id ? { ...t, ...update } : t))
    } catch (e) {
      console.error('Verify failed:', e)
    }
    setVerifying(prev => { const n = new Set(prev); n.delete(track.id); return n })
  }

  const handleAuthorize = async (track: TrackRow) => {
    await fetch('/api/tracks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: track.id, bad_file: false, bad_reason: null }),
    })
    setTracks(prev => prev.map(t => t.id === track.id ? { ...t, bad_file: false, bad_reason: null } : t))
  }

  const handleDelete = async (track: TrackRow) => {
    if (!confirm(`Delete "${track.title}" by ${track.artist}?\nThis removes it from DB and MinIO permanently.`)) return
    await fetch(`/api/tracks?id=${track.id}`, { method: 'DELETE' })
    setTracks(prev => prev.filter(t => t.id !== track.id))
    setTotal(prev => prev - 1)
  }

  const handleDownload = async (track: TrackRow) => {
    if (!track.minio_key) return
    try {
      const res = await fetch(`/api/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'download', minioKey: track.minio_key }),
      })
      const data = await res.json()
      if (data.downloadUrl) {
        const a = document.createElement('a')
        a.href = data.downloadUrl
        a.download = track.file_name || `${track.title}.mp4`
        a.click()
      }
    } catch (e) {
      console.error('Download failed:', e)
    }
  }

  const handleSaveEdit = async (track: TrackRow) => {
    await fetch('/api/tracks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: track.id, ...editData }),
    })
    setTracks(prev => prev.map(t => t.id === track.id ? { ...t, ...editData } : t))
    setEditingId(null)
    setEditData({})
  }

  const totalPages = Math.ceil(total / 50)

  const statCards = [
    { label: 'Total', value: stats.total, icon: Music, color: '#888', filter: 'all' as const },
    { label: 'Good', value: stats.good, icon: CheckCircle, color: '#4ade80', filter: 'good' as const },
    { label: 'Bad', value: stats.bad, icon: XCircle, color: '#ef4444', filter: 'bad' as const },
    { label: 'No File', value: stats.no_file, icon: AlertTriangle, color: '#f59e0b', filter: 'no_file' as const },
  ]

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400 }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <Music size={24} color="var(--brand-yellow)" />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>
            Tracks Management
          </h1>
        </div>

        {/* Stats — clickable to filter */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {statCards.map(s => (
            <button
              key={s.label}
              onClick={() => { setStatus(s.filter); setPage(1) }}
              style={{
                background: status === s.filter ? `${s.color}10` : '#16162a',
                border: status === s.filter ? `2px solid ${s.color}40` : '1px solid #2a2a4e',
                borderRadius: 12, padding: '16px 20px',
                display: 'flex', alignItems: 'center', gap: 14,
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              }}
            >
              <s.icon size={20} color={s.color} />
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#666' }}>{s.label}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Search + filter + refresh — uniform height */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'stretch' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
            <Search size={14} color="#555" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search by title, artist, genre..."
              style={{
                width: '100%', height: '100%', boxSizing: 'border-box',
                padding: '0 12px 0 34px', borderRadius: 8,
                background: '#0d0d1a', border: '1px solid #2a2a4e', color: '#ccc',
                fontSize: 11, outline: 'none',
              }}
            />
          </div>
          {/* User filter */}
          <select
            value={userFilter}
            onChange={e => { setUserFilter(e.target.value); setPage(1) }}
            style={{
              padding: '7px 10px', borderRadius: 8, background: '#0d0d1a',
              border: userFilter ? '1px solid rgba(255,255,0,0.3)' : '1px solid #2a2a4e',
              color: userFilter ? '#ffff00' : '#888', fontSize: 11, cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">All Users</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name || u.email} ({u.id.slice(0, 8)})</option>
            ))}
          </select>

          <button
            onClick={fetchTracks}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #2a2a4e', background: 'transparent', color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}
          >
            <RefreshCw size={12} /> Refresh
          </button>

          {/* Recover user library — select all files for a user and download */}
          {userFilter && (
            <button
              onClick={async () => {
                if (!confirm(`Recover full library for this user?\nThis will download ALL their files from MinIO.`)) return
                setRecovering(true)
                const allParams = new URLSearchParams({ page: '1', limit: '9999', status: 'all', userId: userFilter })
                const res = await fetch(`/api/tracks?${allParams}`)
                const data = await res.json()
                const withFiles = (data.tracks || []).filter((t: TrackRow) => t.minio_key)
                for (const track of withFiles) {
                  try {
                    const dlRes = await fetch('/api/tracks', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'download', minioKey: track.minio_key }),
                    })
                    const dlData = await dlRes.json()
                    if (dlData.downloadUrl) {
                      const a = document.createElement('a')
                      a.href = dlData.downloadUrl
                      a.download = track.file_name || `${track.title}.mp4`
                      a.click()
                      await new Promise(r => setTimeout(r, 700))
                    }
                  } catch { /* skip */ }
                }
                setRecovering(false)
                alert(`Recovery complete — ${withFiles.length} files downloaded.`)
              }}
              disabled={recovering}
              style={{
                padding: '6px 14px', borderRadius: 8,
                background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)',
                color: '#a855f7', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6, opacity: recovering ? 0.5 : 1,
              }}
            >
              <Download size={12} /> {recovering ? 'Recovering...' : 'Recover Full Library'}
            </button>
          )}
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', marginBottom: 8,
            background: 'rgba(255,255,0,0.06)', border: '1px solid rgba(255,255,0,0.15)', borderRadius: 8,
          }}>
            <span style={{ fontSize: 11, color: '#ffff00', fontWeight: 600 }}>{selected.size} selected</span>
            <button onClick={handleBulkTest} disabled={bulkTesting}
              style={{ padding: '4px 14px', borderRadius: 6, background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7', cursor: 'pointer', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, opacity: bulkTesting ? 0.5 : 1 }}>
              <Play size={12} /> {bulkTesting ? `Testing ${bulkTestProgress.done}/${bulkTestProgress.total}...` : 'Test Playable'}
            </button>
            {bulkTesting && (
              <span style={{ fontSize: 9, color: '#888', fontFamily: 'var(--font-mono)' }}>
                {bulkTestProgress.ok} ok / {bulkTestProgress.broken} broken
              </span>
            )}
            <button onClick={handleBulkDownload} disabled={downloading}
              style={{ padding: '4px 14px', borderRadius: 6, background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', cursor: 'pointer', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, opacity: downloading ? 0.5 : 1 }}>
              <Download size={12} /> {downloading ? 'Downloading...' : 'Download Selected'}
            </button>
            <button onClick={handleBulkDelete}
              style={{ padding: '4px 14px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Trash2 size={12} /> Delete Selected
            </button>
            <button onClick={() => setSelected(new Set())}
              style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', border: '1px solid #2a2a4e', color: '#888', cursor: 'pointer', fontSize: 10 }}>
              Clear
            </button>
          </div>
        )}

        {/* Table */}
        <div style={{ background: '#0d0d1a', border: '1px solid #2a2a4e', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '28px 1fr 120px 80px 55px 55px 50px 70px 220px',
            padding: '8px 16px', borderBottom: '1px solid #2a2a4e', fontSize: 9,
            color: '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
          }}>
            <input type="checkbox" checked={selected.size > 0 && selected.size === tracks.filter(t => t.minio_key).length} onChange={toggleSelectAll}
              style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#ffff00' }} />
            <span>Title / Artist</span>
            <span>User ID</span>
            <span>Genre</span>
            <span>BPM</span>
            <span>Key</span>
            <span>Dur</span>
            <span>Status</span>
            <span style={{ textAlign: 'right' }}>Actions</span>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#555' }}>Loading...</div>
          ) : tracks.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#555' }}>No tracks found</div>
          ) : tracks.map(track => (
            <div key={track.id}>
              <div
                style={{
                  display: 'grid', gridTemplateColumns: '28px 1fr 120px 80px 55px 55px 50px 70px 220px',
                  padding: '8px 16px', borderBottom: '1px solid #1a1a2e',
                  alignItems: 'center', fontSize: 11,
                  opacity: track.bad_file ? 0.7 : 1,
                }}
              >
                <input type="checkbox" checked={selected.has(track.id)} onChange={() => toggleSelect(track.id)}
                  disabled={!track.minio_key}
                  style={{ width: 14, height: 14, cursor: track.minio_key ? 'pointer' : 'default', accentColor: '#ffff00', opacity: track.minio_key ? 1 : 0.2 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#ddd', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {track.title}
                  </div>
                  <div style={{ color: '#666', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {track.artist || 'Unknown'}
                    {track.album ? ` — ${track.album}` : ''}
                  </div>
                </div>
                <span style={{ color: '#555', fontSize: 8, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {users.find(u => u.id === track.user_id)?.name || users.find(u => u.id === track.user_id)?.email || track.user_id?.slice(0, 8)}
                </span>
                <span style={{ color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 10 }}>
                  {track.genre || '—'}
                </span>
                <span style={{ color: '#888', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{track.bpm || '—'}</span>
                <span style={{ color: '#888', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{track.key || '—'}</span>
                <span style={{ color: '#888', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{formatDuration(track.duration)}</span>
                <div>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                    background: track.bad_file ? 'rgba(239,68,68,0.15)' : !track.minio_key ? 'rgba(245,158,11,0.15)' : 'rgba(74,222,128,0.1)',
                    color: track.bad_file ? '#ef4444' : !track.minio_key ? '#f59e0b' : '#4ade80',
                  }}>
                    {track.bad_file ? 'BAD' : !track.minio_key ? 'NO FILE' : 'OK'}
                  </span>
                  {track.bad_file && track.bad_reason && (
                    <div style={{ fontSize: 8, color: '#ef4444', opacity: 0.7, marginTop: 2, maxWidth: 70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      title={track.bad_reason}>
                      {track.bad_reason}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
                  {track.minio_key && (
                    <>
                      {/* Play test button */}
                      <button
                        onClick={() => testTrack(track.id, track.minio_key!)}
                        disabled={testStatus[track.id] === 'testing'}
                        title="Test if file is playable"
                        style={{
                          padding: '3px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3,
                          border: testStatus[track.id] === 'ok' ? '1px solid rgba(74,222,128,0.4)' :
                                 testStatus[track.id] === 'broken' ? '1px solid rgba(239,68,68,0.4)' :
                                 '1px solid rgba(168,85,247,0.3)',
                          background: testStatus[track.id] === 'ok' ? 'rgba(74,222,128,0.1)' :
                                     testStatus[track.id] === 'broken' ? 'rgba(239,68,68,0.1)' :
                                     'transparent',
                          color: testStatus[track.id] === 'ok' ? '#4ade80' :
                                 testStatus[track.id] === 'broken' ? '#ef4444' :
                                 testStatus[track.id] === 'testing' ? '#a855f7' : '#a855f7',
                          cursor: testStatus[track.id] === 'testing' ? 'wait' : 'pointer', fontSize: 9,
                          opacity: testStatus[track.id] === 'testing' ? 0.6 : 1,
                        }}
                      >
                        <Play size={9} />
                        {testStatus[track.id] === 'testing' ? 'Testing...' :
                         testStatus[track.id] === 'ok' ? 'Playable' :
                         testStatus[track.id] === 'broken' ? 'Broken' : 'Test'}
                      </button>
                      <button onClick={() => handleDownload(track)} title="Download file"
                        style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #2a2a4e', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: 9 }}>
                        <Download size={10} />
                      </button>
                    </>
                  )}
                  <button onClick={() => { setEditingId(editingId === track.id ? null : track.id); setEditData({ title: track.title, artist: track.artist, album: track.album, genre: track.genre, bpm: track.bpm, key: track.key }) }} title="Edit metadata"
                    style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid rgba(255,255,0,0.2)', background: 'transparent', color: '#ffff00', cursor: 'pointer', fontSize: 9 }}>
                    <Pencil size={10} />
                  </button>
                  {track.bad_file && (
                    <>
                      <button onClick={() => handleAuthorize(track)} title="Accept — clear bad file flag"
                        style={{
                          padding: '3px 10px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4,
                          border: '1px solid rgba(74,222,128,0.4)', background: 'rgba(74,222,128,0.12)',
                          color: '#4ade80', cursor: 'pointer', fontSize: 9, fontWeight: 600,
                        }}>
                        <CheckCircle size={10} /> Accept
                      </button>
                      <button onClick={() => handleDelete(track)} title="Remove — delete from DB + MinIO"
                        style={{
                          padding: '3px 10px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4,
                          border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.12)',
                          color: '#ef4444', cursor: 'pointer', fontSize: 9, fontWeight: 600,
                        }}>
                        <Trash2 size={10} /> Remove
                      </button>
                    </>
                  )}
                  {!track.bad_file && (
                    <button onClick={() => handleDelete(track)} title="Delete from DB + MinIO"
                      style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 9 }}>
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              </div>

              {/* Inline edit row */}
              <AnimatePresence>
                {editingId === track.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    style={{ overflow: 'hidden', borderBottom: '1px solid #2a2a4e', background: '#12121f' }}
                  >
                    <div style={{ display: 'flex', gap: 8, padding: '8px 16px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {(['title', 'artist', 'album', 'genre'] as const).map(field => (
                        <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>{field}</span>
                          <input
                            value={String(editData[field] || '')}
                            onChange={e => setEditData(prev => ({ ...prev, [field]: e.target.value }))}
                            style={{ padding: '4px 8px', borderRadius: 4, background: '#0d0d1a', border: '1px solid #2a2a4e', color: '#ccc', fontSize: 11, width: field === 'title' ? 200 : 130, outline: 'none' }}
                          />
                        </label>
                      ))}
                      {(['bpm'] as const).map(field => (
                        <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>{field}</span>
                          <input
                            type="number"
                            value={String(editData[field] || '')}
                            onChange={e => setEditData(prev => ({ ...prev, [field]: parseInt(e.target.value) || 0 }))}
                            style={{ padding: '4px 8px', borderRadius: 4, background: '#0d0d1a', border: '1px solid #2a2a4e', color: '#ccc', fontSize: 11, width: 60, outline: 'none' }}
                          />
                        </label>
                      ))}
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Key</span>
                        <input
                          value={String(editData.key || '')}
                          onChange={e => setEditData(prev => ({ ...prev, key: e.target.value }))}
                          style={{ padding: '4px 8px', borderRadius: 4, background: '#0d0d1a', border: '1px solid #2a2a4e', color: '#ccc', fontSize: 11, width: 50, outline: 'none' }}
                        />
                      </label>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', paddingBottom: 2 }}>
                        <button onClick={() => handleSaveEdit(track)}
                          style={{ padding: '4px 12px', borderRadius: 4, background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Save size={10} /> Save
                        </button>
                        <button onClick={() => { setEditingId(null); setEditData({}) }}
                          style={{ padding: '4px 12px', borderRadius: 4, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <X size={10} /> Cancel
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #2a2a4e', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: 11 }}
            >
              Prev
            </button>
            <span style={{ padding: '4px 12px', color: '#888', fontSize: 11 }}>
              Page {page} of {totalPages} ({total} tracks)
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #2a2a4e', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: 11 }}
            >
              Next
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}
