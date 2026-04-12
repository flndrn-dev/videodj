'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Music, Search, CheckCircle, XCircle, AlertTriangle, Trash2, RefreshCw, Pencil, X, Save } from 'lucide-react'

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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<TrackRow>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [users, setUsers] = useState<{ id: string; email: string; name: string }[]>([])
  const [userFilter, setUserFilter] = useState('')

  const flagTrackBad = async (trackId: string, bad: boolean, reason?: string) => {
    await fetch('/api/tracks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: trackId, bad_file: bad, bad_reason: bad ? (reason || 'Flagged') : null }),
    })
    setTracks(prev => prev.map(t => t.id === trackId
      ? { ...t, bad_file: bad, bad_reason: bad ? (reason || 'Flagged') : null }
      : t
    ))
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const toggleSelectAll = () => {
    if (selected.size === tracks.length) setSelected(new Set())
    else setSelected(new Set(tracks.map(t => t.id)))
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

  const handleAuthorize = async (track: TrackRow) => {
    await fetch('/api/tracks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: track.id, bad_file: false, bad_reason: null }),
    })
    setTracks(prev => prev.map(t => t.id === track.id ? { ...t, bad_file: false, bad_reason: null } : t))
  }

  const handleDelete = async (track: TrackRow) => {
    if (!confirm(`Delete "${track.title}" by ${track.artist}?\nThis removes it from the database permanently.`)) return
    await fetch(`/api/tracks?id=${track.id}`, { method: 'DELETE' })
    setTracks(prev => prev.filter(t => t.id !== track.id))
    setTotal(prev => prev - 1)
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

  // Status logic: bad_file → BAD, no file_name → NO FILE, otherwise → OK
  const getStatus = (track: TrackRow) => {
    if (track.bad_file) return { label: 'BAD', bg: 'rgba(239,68,68,0.15)', color: '#ef4444' }
    if (!track.file_name) return { label: 'NO FILE', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
    return { label: 'OK', bg: 'rgba(74,222,128,0.1)', color: '#4ade80' }
  }

  const statCards = [
    { label: 'Total', value: stats.total, icon: Music, color: '#888', filter: 'all' as const },
    { label: 'Good', value: stats.good, icon: CheckCircle, color: '#4ade80', filter: 'good' as const },
    { label: 'Bad', value: stats.bad, icon: XCircle, color: '#ef4444', filter: 'bad' as const },
    { label: 'No Filename', value: stats.no_file, icon: AlertTriangle, color: '#f59e0b', filter: 'no_file' as const },
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

        {/* Search + filter + refresh */}
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
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', marginBottom: 8,
            background: 'rgba(255,255,0,0.06)', border: '1px solid rgba(255,255,0,0.15)', borderRadius: 8,
          }}>
            <span style={{ fontSize: 11, color: '#ffff00', fontWeight: 600 }}>{selected.size} selected</span>
            <button onClick={handleBulkDelete}
              style={{ padding: '4px 14px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Trash2 size={12} /> Delete Selected
            </button>
            <button onClick={() => {
              const ids = tracks.filter(t => selected.has(t.id))
              ids.forEach(t => flagTrackBad(t.id, true, 'Bulk flagged'))
            }}
              style={{ padding: '4px 14px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <XCircle size={12} /> Flag Bad
            </button>
            <button onClick={() => {
              const ids = tracks.filter(t => selected.has(t.id))
              ids.forEach(t => flagTrackBad(t.id, false))
            }}
              style={{ padding: '4px 14px', borderRadius: 6, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', cursor: 'pointer', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle size={12} /> Clear Bad Flag
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
            display: 'grid', gridTemplateColumns: '45px 28px 1fr 120px 80px 55px 55px 50px 70px 160px',
            padding: '8px 16px', borderBottom: '1px solid #2a2a4e', fontSize: 9,
            color: '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
          }}>
            <span>#</span>
            <input type="checkbox" checked={selected.size > 0 && selected.size === tracks.length} onChange={toggleSelectAll}
              style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#ffff00' }} />
            <span>Title / Artist</span>
            <span>User</span>
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
          ) : tracks.map(track => {
            const st = getStatus(track)
            return (
            <div key={track.id}>
              <div
                style={{
                  display: 'grid', gridTemplateColumns: '45px 28px 1fr 120px 80px 55px 55px 50px 70px 160px',
                  padding: '8px 16px', borderBottom: '1px solid #1a1a2e',
                  alignItems: 'center', fontSize: 11,
                  opacity: track.bad_file ? 0.7 : 1,
                }}
              >
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#333348' }}>
                  {String((page - 1) * 50 + tracks.indexOf(track) + 1).padStart(5, '0')}
                </span>
                <input type="checkbox" checked={selected.has(track.id)} onChange={() => toggleSelect(track.id)}
                  style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#ffff00' }} />
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
                    background: st.bg, color: st.color,
                  }}>
                    {st.label}
                  </span>
                  {track.bad_file && track.bad_reason && (
                    <div style={{ fontSize: 8, color: '#ef4444', opacity: 0.7, marginTop: 2, maxWidth: 70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      title={track.bad_reason}>
                      {track.bad_reason}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
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
                      <button onClick={() => handleDelete(track)} title="Remove — delete from database"
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
                    <button onClick={() => handleDelete(track)} title="Delete from database"
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
          )})}
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
