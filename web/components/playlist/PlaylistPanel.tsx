'use client'
import { useState, useCallback, useRef, useEffect, type DragEvent } from 'react'
import { motion } from 'framer-motion'
import { PlayIcon } from '@/components/ui/play'
import { FolderOpenIcon } from '@/components/ui/folder-open'
import { SquarePenIcon } from '@/components/ui/square-pen'
import { CheckIcon } from '@/components/ui/check'
import { SearchIcon } from '@/components/ui/search'
import { XIcon } from '@/components/ui/x'
import { Trash2, Music, ListMusic } from 'lucide-react'
import type { Track } from '@/app/hooks/usePlayerStore'
import { formatTime } from '@/app/hooks/usePlayerStore'

interface PlaylistPanelProps {
  playlist: Track[]
  library: Track[]
  languageFilter: string | null
  onLoadTrack: (deck: 'A' | 'B', t: Track) => void
  onOpenFolder: () => void
  onUpdateTrack: (id: string, updates: Partial<Track>) => void
  onDeleteTrack: (id: string) => void
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

function TrackRow({
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
    <motion.div
      draggable={!editing}
      onDragStart={(e) => onDragStart(e as unknown as DragEvent<HTMLDivElement>, track)}
      onDoubleClick={handleDoubleClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.01 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 0,
        padding: '5px 12px', cursor: editing ? 'default' : 'grab',
        userSelect: 'none', borderBottom: '1px solid #1a1a2e',
      }}
      whileHover={{ backgroundColor: 'rgba(255,255,0,0.03)' }}
    >
      {/* Nr */}
      <span style={{
        width: 28, fontSize: 10, fontFamily: 'var(--font-mono)',
        color: '#333348', textAlign: 'center', flexShrink: 0,
      }}>
        {String(index + 1).padStart(2, '0')}
      </span>

      {/* Deck A button (blue) */}
      <motion.button
        onClick={() => onLoadTrack('A', track)}
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.9 }}
        title="Load to Deck A"
        style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          background: 'rgba(69,177,232,0.1)', border: '1px solid rgba(69,177,232,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', marginRight: 4,
        }}
      >
        <PlayIcon size={10} style={{ color: '#45b1e8' }} />
      </motion.button>

      {/* Deck B button (red) */}
      <motion.button
        onClick={() => onLoadTrack('B', track)}
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.9 }}
        title="Load to Deck B"
        style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', marginRight: 10,
        }}
      >
        <PlayIcon size={10} style={{ color: '#ef4444' }} />
      </motion.button>

      {/* Thumbnail */}
      <div style={{
        width: 36, height: 36, borderRadius: 6, flexShrink: 0, marginRight: 10,
        background: '#1a1a2a', border: '1px solid #2a2a3e',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {track.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
              fontSize: 9, color: '#555570', marginTop: 1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {track.artist || '—'}
            </div>
          </>
        )}
      </div>

      {/* Album */}
      <div style={{ width: 140, flexShrink: 0, marginRight: 8 }}>
        <EditableCell value={track.album} field="album" editing={editing} onChange={handleFieldChange} width={140} />
      </div>

      {/* Remixers */}
      <div style={{ width: 90, flexShrink: 0, marginRight: 8 }}>
        <EditableCell value={track.remixer} field="remixer" editing={editing} onChange={handleFieldChange} width={90} />
      </div>

      {/* Genre */}
      <div style={{ width: 70, flexShrink: 0, marginRight: 8 }}>
        <EditableCell value={track.genre} field="genre" editing={editing} onChange={handleFieldChange} width={70} />
      </div>

      {/* Language */}
      <div style={{ width: 30, flexShrink: 0, marginRight: 8, textAlign: 'center' }}>
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
      <div style={{ width: 55, flexShrink: 0, marginRight: 8, textAlign: 'right' }}>
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
          <motion.button
            onClick={handleSave}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            title="Save changes"
            style={{
              width: 24, height: 24, borderRadius: 6,
              background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <CheckIcon size={10} style={{ color: '#4ade80' }} />
          </motion.button>
        ) : (
          <motion.button
            onClick={() => { pendingUpdates.current = {}; setEditing(true) }}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            title="Edit track info"
            style={{
              width: 24, height: 24, borderRadius: 6,
              background: 'transparent', border: '1px solid #2a2a3e',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <SquarePenIcon size={10} style={{ color: '#555570' }} />
          </motion.button>
        )}
        <motion.button
          onClick={() => onDeleteTrack(track.id)}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          title="Delete track"
          style={{
            width: 24, height: 24, borderRadius: 6,
            background: 'transparent', border: '1px solid #2a2a3e',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Trash2 size={10} color="#555570" />
        </motion.button>
      </div>
    </motion.div>
  )
}

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
    if (containerRef.current) setScrollTop(containerRef.current.scrollTop)
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
  playlist, library, languageFilter, onLoadTrack, onOpenFolder, onUpdateTrack, onDeleteTrack,
}: PlaylistPanelProps) {
  const allTracks = playlist.length > 0 ? playlist : library
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Filter tracks by search query (searches title, artist, album, genre)
  const tracks = (searching && searchQuery.trim())
    ? allTracks.filter((t) => {
        const q = searchQuery.toLowerCase()
        return (
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q) ||
          t.genre.toLowerCase().includes(q) ||
          t.remixer.toLowerCase().includes(q) ||
          (t.language || '').toLowerCase().includes(q)
        )
      })
    : allTracks

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
          {playlist.length > 0 ? 'Playlist' : 'Library'}
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

        {/* Search input */}
        {searching && (
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={(e) => { if (e.key === 'Escape') handleSearchToggle() }}
            placeholder="Search playlist..."
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

        <motion.button
          onClick={onOpenFolder}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          title="Create playlist from folder"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 28, padding: '0 12px', borderRadius: 6,
            background: 'rgba(255,255,0,0.06)', border: '1px solid rgba(255,255,0,0.25)',
            cursor: 'pointer', color: '#ffff00', fontSize: 11, fontWeight: 600,
          }}
        >
          <FolderOpenIcon size={12} />
          Create Playlist
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
        <span style={{ width: 140, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginRight: 8 }}>ALBUM</span>
        <span style={{ width: 90, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginRight: 8 }}>REMIXERS</span>
        <span style={{ width: 70, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginRight: 8 }}>GENRE</span>
        <span style={{ width: 30, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginRight: 8, textAlign: 'center' }}>LANG</span>
        <span style={{ width: 60, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginRight: 8, textAlign: 'right' }}>BPM/KEY</span>
        <span style={{ width: 55, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginRight: 8, textAlign: 'right' }}>RELEASED</span>
        <span style={{ width: 40, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginRight: 8, textAlign: 'right' }}>TIME</span>
        <span style={{ width: 30, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginRight: 10, textAlign: 'center' }}>PLAYS</span>
        <span style={{ width: 52, fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)' }}></span>{/* actions */}
      </div>

      {/* Scrollable track list — virtualized for large libraries */}
      <VirtualTrackList
        tracks={tracks}
        searchQuery={searchQuery}
        onLoadTrack={onLoadTrack}
        onUpdateTrack={onUpdateTrack}
        onDeleteTrack={onDeleteTrack}
        onDragStart={handleDragStart}
      />
    </motion.div>
  )
}
