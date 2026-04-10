'use client'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XIcon } from '@/components/ui/x'
import { SearchIcon } from '@/components/ui/search'
import { Music } from 'lucide-react'
import type { Track, UserPlaylist } from '@/app/hooks/usePlayerStore'
import { formatTime } from '@/app/hooks/usePlayerStore'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PlaylistModalProps {
  library: Track[]
  onClose: () => void
  onCreate: (playlist: UserPlaylist) => void
}

// ---------------------------------------------------------------------------
// Virtual row height
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 40
const OVERSCAN = 6

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlaylistModal({ library, onClose, onCreate }: PlaylistModalProps) {
  const [name, setName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(400)
  const rafId = useRef(0)

  // Auto-focus name input
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { nameRef.current?.focus() }, [])

  // Resize observer
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) setContainerHeight(entry.contentRect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // RAF-throttled scroll
  const handleScroll = useCallback(() => {
    if (rafId.current) return
    rafId.current = requestAnimationFrame(() => {
      if (containerRef.current) setScrollTop(containerRef.current.scrollTop)
      rafId.current = 0
    })
  }, [])

  // Filter tracks by search
  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return library
    const q = searchQuery.toLowerCase()
    return library.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.genre.toLowerCase().includes(q)
    )
  }, [library, searchQuery])

  // Calculate total duration of selected tracks
  const totalDuration = useMemo(() => {
    let total = 0
    for (const t of library) {
      if (selected.has(t.id)) total += t.duration || 0
    }
    return total
  }, [library, selected])

  // Format total duration as hh:mm:ss
  function formatTotalDuration(sec: number): string {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
    return `${m}m ${String(s).padStart(2, '0')}s`
  }

  function toggleTrack(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(filteredTracks.map(t => t.id)))
  }

  function deselectAll() {
    setSelected(new Set())
  }

  function handleCreate() {
    if (!name.trim() || selected.size === 0) return

    const playlist: UserPlaylist = {
      id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      createdAt: Date.now(),
      createdBy: 'user',
      trackIds: Array.from(selected),
      totalDuration,
    }

    onCreate(playlist)
  }

  // Virtual scroll calculations
  const totalHeight = filteredTracks.length * ROW_HEIGHT
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIdx = Math.min(filteredTracks.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN)

  const today = new Date()
  const dateStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          onClick={e => e.stopPropagation()}
          style={{
            width: 680, maxHeight: '85vh',
            background: '#0d0d16', border: '1px solid #2a2a3e',
            borderRadius: 16, display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* ── Header ──────────────────────────────────────────── */}
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid #1a1a2e',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#e0e0f0', letterSpacing: 0.5 }}>
              Create Playlist
            </span>
            <div style={{ flex: 1 }} />

            {/* Total duration */}
            {selected.size > 0 && (
              <span style={{
                fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
                color: '#ffff00', background: 'rgba(255,255,0,0.08)',
                border: '1px solid rgba(255,255,0,0.2)',
                padding: '3px 10px', borderRadius: 6,
              }}>
                {selected.size} tracks · {formatTotalDuration(totalDuration)}
              </span>
            )}

            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'transparent', border: '1px solid #2a2a3e',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#555570',
              }}
            >
              <XIcon size={14} />
            </button>
          </div>

          {/* ── Name + Date ─────────────────────────────────────── */}
          <div style={{ padding: '12px 20px', display: 'flex', gap: 12, borderBottom: '1px solid #1a1a2e' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 9, color: '#555570', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                Playlist Name
              </label>
              <input
                ref={nameRef}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My Playlist"
                style={{
                  width: '100%', height: 34, background: '#14141f',
                  border: '1px solid #2a2a3e', borderRadius: 8,
                  padding: '0 12px', color: '#e0e0f0', fontSize: 13,
                  fontWeight: 600, outline: 'none',
                }}
              />
            </div>
            <div style={{ width: 160 }}>
              <label style={{ fontSize: 9, color: '#555570', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                Created
              </label>
              <div style={{
                height: 34, background: '#14141f', border: '1px solid #2a2a3e',
                borderRadius: 8, padding: '0 12px', color: '#888',
                fontSize: 12, display: 'flex', alignItems: 'center',
                fontFamily: 'var(--font-mono)',
              }}>
                {dateStr}
              </div>
            </div>
          </div>

          {/* ── Search + Select All ─────────────────────────────── */}
          <div style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #1a1a2e' }}>
            <SearchIcon size={12} style={{ color: '#555570', flexShrink: 0 }} />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search tracks..."
              style={{
                flex: 1, height: 28, background: 'transparent',
                border: 'none', color: '#e0e0f0', fontSize: 11,
                outline: 'none',
              }}
            />
            <button
              onClick={selected.size === filteredTracks.length ? deselectAll : selectAll}
              style={{
                fontSize: 10, fontWeight: 700, padding: '4px 10px',
                borderRadius: 4, background: 'transparent',
                border: '1px solid #2a2a3e', color: '#888',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {selected.size === filteredTracks.length && filteredTracks.length > 0 ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          {/* ── Track List (virtualized) ────────────────────────── */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            style={{ flex: 1, overflowY: 'auto', minHeight: 200 }}
          >
            <style>{`.pl-row:hover{background:rgba(255,255,0,0.03)}`}</style>
            <div style={{ height: totalHeight, position: 'relative' }}>
              {filteredTracks.slice(startIdx, endIdx).map((track, i) => {
                const isSelected = selected.has(track.id)
                return (
                  <div
                    key={track.id}
                    style={{
                      position: 'absolute',
                      top: (startIdx + i) * ROW_HEIGHT,
                      left: 0, right: 0, height: ROW_HEIGHT,
                    }}
                  >
                    <div
                      className="pl-row"
                      onClick={() => toggleTrack(track.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '0 20px', height: '100%', cursor: 'pointer',
                        borderBottom: '1px solid #0f0f1a',
                        background: isSelected ? 'rgba(255,255,0,0.04)' : 'transparent',
                      }}
                    >
                      {/* Checkbox */}
                      <div style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                        border: `2px solid ${isSelected ? '#ffff00' : '#2a2a3e'}`,
                        background: isSelected ? '#ffff00' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                      }}>
                        {isSelected && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5L4.5 7.5L8 3" stroke="#0a0a14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>

                      {/* Thumbnail */}
                      <div style={{
                        width: 28, height: 28, borderRadius: 4, flexShrink: 0,
                        background: '#1a1a2a', border: '1px solid #1a1a2e',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden',
                      }}>
                        {track.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={track.thumbnail} alt="" loading="lazy" decoding="async"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <Music size={10} color="#333348" />
                        )}
                      </div>

                      {/* Artist — Title */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 11, fontWeight: 600,
                          color: isSelected ? '#e0e0f0' : '#999',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {track.artist || 'Unknown'} — {track.title}
                        </div>
                      </div>

                      {/* Genre */}
                      <span style={{
                        fontSize: 9, color: '#555570', fontFamily: 'var(--font-mono)',
                        width: 60, flexShrink: 0, textAlign: 'right',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {track.genre || '—'}
                      </span>

                      {/* BPM */}
                      <span style={{
                        fontSize: 9, color: '#555570', fontFamily: 'var(--font-mono)',
                        width: 35, flexShrink: 0, textAlign: 'right',
                      }}>
                        {track.bpm || '—'}
                      </span>

                      {/* Duration */}
                      <span style={{
                        fontSize: 9, color: '#555570', fontFamily: 'var(--font-mono)',
                        width: 35, flexShrink: 0, textAlign: 'right',
                      }}>
                        {formatTime(track.duration)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Footer ──────────────────────────────────────────── */}
          <div style={{
            padding: '12px 20px', borderTop: '1px solid #1a1a2e',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 11, color: '#555570', flex: 1 }}>
              {library.length} tracks in library
            </span>
            <button
              onClick={onClose}
              style={{
                height: 36, padding: '0 20px', borderRadius: 8,
                background: 'transparent', border: '1px solid #2a2a3e',
                color: '#888', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || selected.size === 0}
              style={{
                height: 36, padding: '0 24px', borderRadius: 8,
                background: name.trim() && selected.size > 0 ? '#ffff00' : '#2a2a3e',
                color: name.trim() && selected.size > 0 ? '#0a0a14' : '#555',
                border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                letterSpacing: 0.5,
              }}
            >
              Create Playlist
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
