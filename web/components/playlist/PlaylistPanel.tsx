'use client'
import { useState, useCallback, useRef, useEffect, useMemo, memo, type DragEvent } from 'react'
import { motion } from 'framer-motion'
import { PlayIcon } from '@/components/ui/play'
import type { PlayIconHandle } from '@/components/ui/play'
import { FolderOpenIcon } from '@/components/ui/folder-open'
import { SquarePenIcon } from '@/components/ui/square-pen'
import { CheckIcon } from '@/components/ui/check'
import { SearchIcon } from '@/components/ui/search'
import { XIcon } from '@/components/ui/x'
import { Trash2, Music, ListMusic, Plus, User, Database, ChevronDown, PanelRightOpen, PanelRightClose } from 'lucide-react'
import type { Track, UserPlaylist } from '@/app/hooks/usePlayerStore'
import { formatTime } from '@/app/hooks/usePlayerStore'

interface PlaylistPanelProps {
  playlist: Track[]
  library: Track[]
  languageFilter: string | null
  userPlaylists: UserPlaylist[]
  activePlaylistId: string | null
  onLoadTrack: (deck: 'A' | 'B', t: Track) => void
  onOpenFolder: () => void
  onUpdateTrack: (id: string, updates: Partial<Track>) => void
  onDeleteTrack: (id: string) => void
  onCreatePlaylist: () => void
  onSelectPlaylist: (id: string | null) => void
  onDeletePlaylist: (id: string) => void
  onPlayPlaylist: (id: string) => void
  onExportLibrary: () => void
  streamMinimized?: boolean
  onOpenStream?: () => void
}

// ---------------------------------------------------------------------------
// Editable cell
// ---------------------------------------------------------------------------

function EditableCell({
  value,
  field,
  editing,
  onChange,
  width,
  align = 'left',
}: {
  value: string
  field: string
  editing: boolean
  onChange: (field: string, value: string) => void
  width: number | string
  align?: 'left' | 'right' | 'center'
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  if (editing) {
    return (
      <input
        ref={inputRef}
        defaultValue={value}
        onBlur={(e) => onChange(field, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        style={{
          width: '100%', background: '#1a1a2e', border: '1px solid rgba(255,255,0,0.3)',
          borderRadius: 4, padding: '2px 4px', color: '#e0e0f0',
          fontSize: 10, fontFamily: 'var(--font-mono)', outline: 'none',
          textAlign: align,
        }}
      />
    )
  }

  return (
    <span style={{
      display: 'block', width, fontSize: 10, fontFamily: 'var(--font-mono)',
      color: '#888', textAlign: align, whiteSpace: 'nowrap', overflow: 'hidden',
      textOverflow: 'ellipsis',
    }}>
      {value || '—'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Track row
// ---------------------------------------------------------------------------

const TrackRow = memo(function TrackRow({
  track,
  index,
  onLoadTrack,
  onUpdateTrack,
  onDeleteTrack,
  onDragStart,
}: {
  track: Track
  index: number
  onLoadTrack: (deck: 'A' | 'B', t: Track) => void
  onUpdateTrack: (id: string, updates: Partial<Track>) => void
  onDeleteTrack: (id: string) => void
  onDragStart: (e: DragEvent<HTMLDivElement>, track: Track) => void
}) {
  const [editing, setEditing] = useState(false)
  const pendingUpdates = useRef<Partial<Track>>({})

  function handleFieldChange(field: string, value: string) {
    if (field === 'bpm' || field === 'duration') {
      pendingUpdates.current[field as 'bpm' | 'duration'] = Number(value) || 0
    } else {
      (pendingUpdates.current as Record<string, string>)[field] = value
    }
  }

  function handleSave() {
    if (Object.keys(pendingUpdates.current).length > 0) {
      onUpdateTrack(track.id, pendingUpdates.current)
      pendingUpdates.current = {}
    }
    setEditing(false)
  }

  function handleDoubleClick() {
    if (!editing) {
      pendingUpdates.current = {}
      setEditing(true)
    }
  }

  return (
    <div
      draggable={!editing}
      onDragStart={(e) => onDragStart(e as unknown as DragEvent<HTMLDivElement>, track)}
      onDoubleClick={handleDoubleClick}
      className="track-row"
      title={track.badFile ? `Flagged: ${track.badReason || 'broken file'}` : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 0,
        padding: '5px 12px', cursor: editing ? 'default' : track.badFile ? 'not-allowed' : 'grab',
        userSelect: 'none', borderBottom: '1px solid #1a1a2e',
        height: '100%',
        opacity: track.badFile ? 0.35 : 1,
        pointerEvents: track.badFile ? 'none' : 'auto',
      }}
    >
      {/* Nr */}
      <span style={{
        width: 28, fontSize: 10, fontFamily: 'var(--font-mono)',
        color: '#333348', textAlign: 'center', flexShrink: 0,
      }}>
        {String(index + 1).padStart(2, '0')}
      </span>

      {/* Deck A button (blue) */}
      <button
        onClick={() => onLoadTrack('A', track)}
        title="Load to Deck A"
        className="deck-btn"
        style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          background: 'rgba(69,177,232,0.1)', border: '1px solid rgba(69,177,232,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', marginRight: 4,
        }}
      >
        <PlayIcon size={10} style={{ color: '#45b1e8' }} />
      </button>

      {/* Deck B button (red) */}
      <button
        onClick={() => onLoadTrack('B', track)}
        title="Load to Deck B"
        className="deck-btn"
        style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', marginRight: 10,
        }}
      >
        <PlayIcon size={10} style={{ color: '#ef4444' }} />
      </button>

      {/* Thumbnail */}
      <div style={{
        width: 36, height: 36, borderRadius: 6, flexShrink: 0, marginRight: 10,
        background: '#1a1a2a', border: '1px solid #2a2a3e',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {track.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.thumbnail} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Music size={14} color="#333348" />
        )}
      </div>

      {/* Title / Artist */}
      <div style={{ flex: 2, minWidth: 0, marginRight: 8 }}>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <EditableCell value={track.title} field="title" editing onChange={handleFieldChange} width="100%" />
            <EditableCell value={track.artist} field="artist" editing onChange={handleFieldChange} width="100%" />
          </div>
        ) : (
          <>
            <div style={{
              fontSize: 11, fontWeight: 600, color: '#e0e0f0',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {track.title}
            </div>
            <div style={{
              fontSize: 10, color: '#555570', marginTop: 1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {track.artist || '—'}
            </div>
          </>
        )}
      </div>

      {/* Album */}
      <div className="col-album" style={{ width: 200, flexShrink: 0, marginRight: 8 }}>
        <EditableCell value={track.album} field="album" editing={editing} onChange={handleFieldChange} width={140} />
      </div>

      {/* Remixers */}
      <div className="col-remixer" style={{ width: 90, flexShrink: 0, marginRight: 8 }}>
        <EditableCell value={track.remixer} field="remixer" editing={editing} onChange={handleFieldChange} width={90} />
      </div>

      {/* Genre */}
      <div className="col-genre" style={{ width: 70, flexShrink: 0, marginRight: 8 }}>
        <EditableCell value={track.genre} field="genre" editing={editing} onChange={handleFieldChange} width={70} />
      </div>

      {/* Language */}
      <div className="col-language" style={{ width: 30, flexShrink: 0, marginRight: 8, textAlign: 'center' }}>
        <EditableCell
          value={track.language?.toUpperCase() || ''}
          field="language"
          editing={editing}
          onChange={handleFieldChange}
          width={30}
          align="center"
        />
      </div>

      {/* BPM / Key */}
      <div style={{ width: 60, flexShrink: 0, marginRight: 8, textAlign: 'right' }}>
        {editing ? (
          <div style={{ display: 'flex', gap: 2 }}>
            <EditableCell value={String(track.bpm || '')} field="bpm" editing onChange={handleFieldChange} width="50%" align="right" />
            <EditableCell value={track.key} field="key" editing onChange={handleFieldChange} width="50%" align="right" />
          </div>
        ) : (
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#888' }}>
            {track.bpm > 0 ? track.bpm : '—'} / {track.key || '—'}
          </span>
        )}
      </div>

      {/* Released */}
      <div className="col-released" style={{ width: 55, flexShrink: 0, marginRight: 8, textAlign: 'right' }}>
        <EditableCell value={track.released} field="released" editing={editing} onChange={handleFieldChange} width={55} align="right" />
      </div>

      {/* Time */}
      <span style={{
        width: 40, flexShrink: 0, fontSize: 10, fontFamily: 'var(--font-mono)',
        color: '#555570', textAlign: 'right', marginRight: 8,
      }}>
        {formatTime(track.duration)}
      </span>

      {/* Times Played */}
      <span style={{
        width: 30, flexShrink: 0, fontSize: 10, fontFamily: 'var(--font-mono)',
        color: (track.timesPlayed || 0) > 0 ? '#ffff00' : '#333348',
        textAlign: 'center', marginRight: 10,
      }}>
        {track.timesPlayed || 0}
      </span>

      {/* Edit/Save + Delete */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {editing ? (
          <button
            onClick={handleSave}
            title="Save changes"
            className="deck-btn"
            style={{
              width: 24, height: 24, borderRadius: 6,
              background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <CheckIcon size={10} style={{ color: '#4ade80' }} />
          </button>
        ) : (
          <button
            onClick={() => { pendingUpdates.current = {}; setEditing(true) }}
            title="Edit track info"
            className="deck-btn"
            style={{
              width: 24, height: 24, borderRadius: 6,
              background: 'transparent', border: '1px solid #2a2a3e',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <SquarePenIcon size={10} style={{ color: '#555570' }} />
          </button>
        )}
        <button
          onClick={() => {
            if (window.confirm(`Delete "${track.artist || 'Unknown'} — ${track.title}" from your library? This cannot be undone.`)) {
              onDeleteTrack(track.id)
            }
          }}
          title="Delete track"
          className="deck-btn"
          style={{
            width: 24, height: 24, borderRadius: 6,
            background: 'transparent', border: '1px solid #2a2a3e',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Trash2 size={10} color="#555570" />
        </button>
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Virtual scroll — only renders visible rows for large libraries
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 44 // px per row
const OVERSCAN = 8    // extra rows above/below viewport

function VirtualTrackList({ tracks, searchQuery, onLoadTrack, onUpdateTrack, onDeleteTrack, onDragStart }: {
  tracks: Track[]
  searchQuery: string
  onLoadTrack: (deck: 'A' | 'B', track: Track) => void
  onUpdateTrack: (id: string, updates: Partial<Track>) => void
  onDeleteTrack: (id: string) => void
  onDragStart: (e: DragEvent<HTMLDivElement>, track: Track) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(400)
  const rafId = useRef(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) setContainerHeight(entry.contentRect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleScroll = useCallback(() => {
    if (rafId.current) return // already scheduled
    rafId.current = requestAnimationFrame(() => {
      if (containerRef.current) {
        const st = containerRef.current.scrollTop
        setScrollTop(st)
        // Persist scroll position across page refresh
        try { sessionStorage.setItem('playlist-scroll', String(st)) } catch { /* ignore */ }
      }
      rafId.current = 0
    })
  }, [])

  // Restore scroll position on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('playlist-scroll')
      if (saved && containerRef.current) {
        const val = Number(saved)
        if (val > 0) {
          containerRef.current.scrollTop = val
          setScrollTop(val)
        }
      }
    } catch { /* ignore */ }
  }, [])

  if (tracks.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        {searchQuery ? (
          <>
            <SearchIcon size={32} style={{ color: '#333348' }} />
            <span style={{ fontSize: 12, color: '#333348' }}>No results for &ldquo;{searchQuery}&rdquo;</span>
          </>
        ) : (
          <>
            <FolderOpenIcon size={32} style={{ color: '#333348' }} />
            <span style={{ fontSize: 12, color: '#333348' }}>No videos loaded — open a folder to get started</span>
          </>
        )}
      </div>
    )
  }

  const totalHeight = tracks.length * ROW_HEIGHT
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIdx = Math.min(tracks.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN)

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ flex: 1, overflowY: 'auto' }}
    >
      <style>{`.track-row:hover{background:rgba(255,255,0,0.03)}.deck-btn:hover{transform:scale(1.15)}.deck-btn:active{transform:scale(0.9)}`}</style>
      <div style={{ height: totalHeight, position: 'relative' }}>
        {tracks.slice(startIdx, endIdx).map((track, i) => (
          <div
            key={track.id}
            style={{
              position: 'absolute',
              top: (startIdx + i) * ROW_HEIGHT,
              left: 0,
              right: 0,
              height: ROW_HEIGHT,
            }}
          >
            <TrackRow
              track={track}
              index={startIdx + i}
              onLoadTrack={onLoadTrack}
              onUpdateTrack={onUpdateTrack}
              onDeleteTrack={onDeleteTrack}
              onDragStart={onDragStart}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function PlaylistPanel({
  playlist, library, languageFilter, userPlaylists, activePlaylistId,
  onLoadTrack, onOpenFolder, onUpdateTrack, onDeleteTrack,
  onCreatePlaylist, onSelectPlaylist, onDeletePlaylist, onPlayPlaylist, onExportLibrary,
  streamMinimized, onOpenStream,
}: PlaylistPanelProps) {
  // If a user playlist is selected, show those tracks; otherwise show main library/playlist
  const activeUserPlaylist = activePlaylistId ? userPlaylists.find(p => p.id === activePlaylistId) : null
  const allTracks = useMemo(() => {
    if (activeUserPlaylist) {
      const idSet = new Set(activeUserPlaylist.trackIds)
      return library.filter(t => idSet.has(t.id))
    }
    return playlist.length > 0 ? playlist : library
  }, [activeUserPlaylist, playlist, library])
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [showPlaylists, setShowPlaylists] = useState(false)
  const [dbMenuOpen, setDbMenuOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dbMenuRef = useRef<HTMLDivElement>(null)

  // Close DB menu on outside click
  useEffect(() => {
    if (!dbMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (dbMenuRef.current && !dbMenuRef.current.contains(e.target as Node)) setDbMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dbMenuOpen])

  // Filter tracks by search query — supports field prefixes: artist: title: lang: genre: year: album:
  const tracks = useMemo(() => {
    if (!searching || !searchQuery.trim()) return allTracks
    const raw = searchQuery.trim()

    // Check for field prefix: "lang:NL", "artist:Queen", "year:1985", "genre:Rock", "title:Love"
    const prefixMatch = raw.match(/^(artist|title|lang|language|genre|year|released|album|bpm|key):(.+)/i)
    if (prefixMatch) {
      const field = prefixMatch[1].toLowerCase()
      const val = prefixMatch[2].trim().toLowerCase()

      return allTracks.filter(t => {
        switch (field) {
          case 'artist': return t.artist.toLowerCase().includes(val)
          case 'title': return t.title.toLowerCase().includes(val)
          case 'lang':
          case 'language': return (t.language || '').toLowerCase() === val
          case 'genre': return t.genre.toLowerCase().includes(val)
          case 'year':
          case 'released': return (t.released || '') === val || (t.released || '').startsWith(val)
          case 'album': return t.album.toLowerCase().includes(val)
          case 'bpm': return String(t.bpm) === val
          case 'key': return (t.key || '').toLowerCase() === val
          default: return true
        }
      })
    }

    // General search — across title and artist only (avoids false matches like "nl" in "only")
    const q = raw.toLowerCase()
    // If query is 2-3 chars uppercase, treat as language code
    if (/^[A-Z]{2,3}$/.test(raw)) {
      return allTracks.filter(t => (t.language || '').toUpperCase() === raw.toUpperCase())
    }
    // If query is a 4-digit number, treat as year
    if (/^\d{4}$/.test(raw)) {
      return allTracks.filter(t => (t.released || '').startsWith(raw))
    }
    return allTracks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q)
    )
  }, [allTracks, searching, searchQuery])

  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, track: Track) => {
    e.dataTransfer.setData('application/json', JSON.stringify(track))
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  function handleSearchToggle() {
    if (searching) {
      // Reset search state — clear query first so filter resets immediately
      setSearching(false)
      setSearchQuery('')
    } else {
      setSearching(true)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }

  // Also clear search when input is emptied manually
  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearchQuery(e.target.value)
  }

  return (
    <motion.div
      className="playlist-zone"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28, delay: 0.2 }}
      style={{
        height: '40%', flexShrink: 0,
        background: '#0d0d16',
        borderTop: '1px solid #2a2a3e',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header bar */}
      <div style={{
        padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid #1a1a2e',
        flexShrink: 0,
      }}>
        <ListMusic size={14} color="#ffff00" />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#888', textTransform: 'uppercase' }}>
          {activeUserPlaylist ? activeUserPlaylist.name : playlist.length > 0 ? 'Playlist' : 'Library'}
        </span>
        <span style={{
          fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
          color: '#ffff00', background: 'rgba(255,255,0,0.08)',
          border: '1px solid rgba(255,255,0,0.2)',
          padding: '2px 9px', borderRadius: 6, minWidth: 28, textAlign: 'center',
        }}>
          {allTracks.length} Tracks
        </span>

        {languageFilter && (
          <span style={{
            fontSize: 9, fontFamily: 'var(--font-mono)',
            color: '#ffff00', background: 'rgba(255,255,0,0.06)',
            border: '1px solid rgba(255,255,0,0.25)',
            padding: '2px 8px', borderRadius: 4,
          }}>
            {languageFilter.toUpperCase()}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Stream minimized button */}
        {streamMinimized && onOpenStream && (
          <button
            onClick={onOpenStream}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 14px', borderRadius: 20,
              background: 'rgba(255,255,0,0.06)', border: '1px solid rgba(255,255,0,0.2)',
              color: '#e0e0f0', fontSize: 10, fontWeight: 800,
              cursor: 'pointer', letterSpacing: 0.5,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,0,0.5)'; e.currentTarget.style.color = '#ffff00' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,0,0.2)'; e.currentTarget.style.color = '#e0e0f0' }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px rgba(239,68,68,0.5)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            STREAM
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Search input */}
        {searching && (
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={(e) => { if (e.key === 'Escape') handleSearchToggle() }}
            placeholder="Search... (artist: title: lang: genre: year:)"
            style={{
              width: 180, height: 28, background: '#14141f', border: '1px solid #2a2a3e',
              borderRadius: 6, padding: '0 10px', color: '#e0e0f0',
              fontSize: 11, outline: 'none', fontFamily: 'inherit',
            }}
          />
        )}

        {/* Search / Close toggle button */}
        <motion.button
          onClick={handleSearchToggle}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          title={searching ? 'Clear search' : 'Search playlist'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 28, width: 28, borderRadius: 6,
            background: searching ? 'rgba(255,255,0,0.06)' : 'transparent',
            border: `1px solid ${searching ? 'rgba(255,255,0,0.25)' : '#2a2a3e'}`,
            cursor: 'pointer', color: searching ? '#ffff00' : '#555570',
          }}
        >
          {searching ? <XIcon size={12} /> : <SearchIcon size={12} />}
        </motion.button>

        {/* Back to library button (when viewing a user playlist) */}
        {activePlaylistId && (
          <motion.button
            onClick={() => onSelectPlaylist(null)}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            title="Back to library"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              height: 28, padding: '0 10px', borderRadius: 6,
              background: 'transparent', border: '1px solid #2a2a3e',
              cursor: 'pointer', color: '#888', fontSize: 10, fontWeight: 600,
            }}
          >
            ← Library
          </motion.button>
        )}

        {/* DB Management dropdown */}
        <div ref={dbMenuRef} style={{ position: 'relative' }}>
          <motion.button
            onClick={() => setDbMenuOpen(!dbMenuOpen)}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            title="Database management"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              height: 28, padding: '0 10px', borderRadius: 6,
              background: dbMenuOpen ? 'rgba(255,255,0,0.06)' : 'transparent',
              border: `1px solid ${dbMenuOpen ? 'rgba(255,255,0,0.25)' : '#2a2a3e'}`,
              cursor: 'pointer', color: dbMenuOpen ? '#ffff00' : '#888', fontSize: 11, fontWeight: 600,
            }}
          >
            <Database size={11} />
            DB Mngt
            <ChevronDown size={10} style={{ transform: dbMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </motion.button>

          {dbMenuOpen && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50,
              background: '#14141f', border: '1px solid #2a2a3e', borderRadius: 8,
              minWidth: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}>
              <button
                onClick={() => { onExportLibrary(); setDbMenuOpen(false) }}
                style={{
                  width: '100%', padding: '10px 14px', border: 'none',
                  background: 'transparent', cursor: 'pointer', textAlign: 'left',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,0,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: '#e0e0f0' }}>
                  Export Tagged Library
                </span>
                <span style={{ fontSize: 9, color: '#555570', lineHeight: 1.3 }}>
                  Download all tracks with updated metadata baked into the files
                </span>
              </button>
            </div>
          )}
        </div>

        <motion.button
          onClick={onCreatePlaylist}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          title="Create a new playlist"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 28, padding: '0 12px', borderRadius: 6,
            background: 'rgba(255,255,0,0.06)', border: '1px solid rgba(255,255,0,0.25)',
            cursor: 'pointer', color: '#ffff00', fontSize: 11, fontWeight: 600,
          }}
        >
          <Plus size={12} />
          Create Playlist
        </motion.button>

        <motion.button
          onClick={() => setShowPlaylists(prev => !prev)}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          title={showPlaylists ? 'Hide playlists' : 'Show playlists'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 6,
            background: showPlaylists ? 'rgba(255,255,0,0.12)' : 'rgba(255,255,0,0.04)',
            border: `1px solid rgba(255,255,0,${showPlaylists ? '0.4' : '0.15'})`,
            cursor: 'pointer', color: showPlaylists ? '#ffff00' : '#777',
            transition: 'all 0.15s ease',
          }}
        >
          {showPlaylists ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
        </motion.button>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        padding: '4px 12px', borderBottom: '1px solid #1a1a2e',
        flexShrink: 0, background: '#0d0d16',
      }}>
        <span style={{ width: 28, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>#</span>
        <span style={{ width: 52, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)' }}></span>{/* deck buttons */}
        <span style={{ width: 46, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)' }}></span>{/* thumbnail */}
        <span style={{ flex: 2, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginRight: 8 }}>TITLE / ARTIST</span>
        <span style={{ width: 200, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginRight: 8 }}>ALBUM</span>
        <span style={{ width: 90, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginRight: 8 }}>REMIXERS</span>
        <span style={{ width: 70, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginRight: 8 }}>GENRE</span>
        <span style={{ width: 30, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginRight: 8, textAlign: 'center' }}>LANG</span>
        <span style={{ width: 60, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginRight: 8, textAlign: 'right' }}>BPM/KEY</span>
        <span style={{ width: 55, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginRight: 8, textAlign: 'right' }}>RELEASED</span>
        <span style={{ width: 40, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginRight: 8, textAlign: 'right' }}>TIME</span>
        <span style={{ width: 30, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginRight: 10, textAlign: 'center' }}>PLAYS</span>
        <span style={{ width: 52, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)' }}></span>{/* actions */}
      </div>

      {/* Main content area: track list + sidebar */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Track list */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <VirtualTrackList
            tracks={tracks}
            searchQuery={searchQuery}
            onLoadTrack={onLoadTrack}
            onUpdateTrack={onUpdateTrack}
            onDeleteTrack={onDeleteTrack}
            onDragStart={handleDragStart}
          />
        </div>

        {/* Playlist sidebar */}
        {userPlaylists.length > 0 && showPlaylists && (
          <div style={{
            width: 200, flexShrink: 0, borderLeft: '1px solid #1a1a2e',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{
              padding: '6px 10px', borderBottom: '1px solid #1a1a2e',
              fontSize: 9, fontWeight: 700, letterSpacing: 1,
              color: '#555570', textTransform: 'uppercase',
            }}>
              Playlists
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* Library button */}
              <button
                onClick={() => onSelectPlaylist(null)}
                style={{
                  width: '100%', padding: '8px 10px', border: 'none',
                  background: !activePlaylistId ? 'rgba(255,255,0,0.06)' : 'transparent',
                  borderBottom: '1px solid #0f0f1a', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  textAlign: 'left',
                }}
              >
                <ListMusic size={16} color={!activePlaylistId ? '#ffff00' : '#555570'} style={{ flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 600,
                    color: !activePlaylistId ? '#ffff00' : '#888',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    Library
                  </div>
                  <div style={{ fontSize: 8, color: '#444', fontFamily: 'var(--font-mono)' }}>
                    {library.length} tracks
                  </div>
                </div>
              </button>

              {/* User playlists */}
              {userPlaylists.map(pl => (
                <div
                  key={pl.id}
                  style={{
                    display: 'flex', alignItems: 'center',
                    borderBottom: '1px solid #0f0f1a',
                    background: activePlaylistId === pl.id ? 'rgba(255,255,0,0.06)' : 'transparent',
                  }}
                >
                  <button
                    onClick={() => onSelectPlaylist(pl.id)}
                    style={{
                      flex: 1, padding: '8px 10px', border: 'none',
                      background: 'transparent', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                      textAlign: 'left', minWidth: 0,
                    }}
                  >
                    {/* Icon: Linus logo or user icon */}
                    {pl.createdBy === 'linus' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src="/assets/Linus.svg" alt="Linus" style={{ width: 20, height: 20, borderRadius: 3, flexShrink: 0 }} />
                    ) : (
                      <User size={16} color={activePlaylistId === pl.id ? '#ffff00' : '#555570'} style={{ flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 10, fontWeight: 600,
                        color: activePlaylistId === pl.id ? '#ffff00' : '#888',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {pl.name}
                      </div>
                      <div style={{ fontSize: 8, color: '#444', fontFamily: 'var(--font-mono)' }}>
                        {pl.trackIds.length} tracks
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onPlayPlaylist(pl.id) }}
                    title="Play this playlist as autoplay"
                    style={{
                      width: 24, height: 24, border: 'none', background: 'transparent',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, color: '#4ade80', transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                  >
                    <PlayIcon size={12} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeletePlaylist(pl.id) }}
                    title="Delete playlist"
                    style={{
                      width: 24, height: 24, border: 'none', background: 'transparent',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, marginRight: 4, color: '#ef4444', transition: 'opacity 0.15s',
                      opacity: 0.4,
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
