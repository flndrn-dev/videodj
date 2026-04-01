'use client'
import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle, type DragEvent } from 'react'
import { motion } from 'framer-motion'
import { PlayIcon } from '@/components/ui/play'
import { PauseIcon } from '@/components/ui/pause'
import { ChevronUpIcon } from '@/components/ui/chevron-up'
import { Disc3Icon } from '@/components/ui/disc-3'
import { Waveform } from '@/components/deck/Waveform'
import type { DeckState, Track } from '@/app/hooks/usePlayerStore'
import { AudioEngine, type EQState } from '@/app/lib/audioEngine'
import { LoopController } from '@/app/lib/loopSystem'
import { hotcueManager } from '@/app/lib/hotcues'
import { TempoController } from '@/app/lib/tempoSync'

// ---------------------------------------------------------------------------
// EQ Slider — styled to match the crossfader (custom pointer-based)
// ---------------------------------------------------------------------------

export function EQSlider({ label, accent, killed, onChange, onKill, reverse }: {
  label: string
  accent: string
  killed: boolean
  onChange: (db: number) => void
  onKill: () => void
  reverse?: boolean  // true = KILL slider LABEL (for Deck B, right-to-left)
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [value, setVal] = useState(0) // -40 to +6

  const getValueFromX = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(-40 + ratio * 46) // -40 to +6
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const db = getValueFromX(e.clientX)
    setVal(db)
    onChange(db)
  }, [onChange, getValueFromX])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const db = getValueFromX(e.clientX)
    setVal(db)
    onChange(db)
  }, [onChange, getValueFromX])

  const handlePointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  const thumbPercent = ((value + 40) / 46) * 100
  const centerPercent = (40 / 46) * 100

  const killBtn = (
    <button
      onClick={onKill}
      style={{
        fontSize: 8, fontWeight: 800, padding: '3px 8px', borderRadius: 4,
        background: killed ? '#ef4444' : 'transparent',
        color: killed ? '#fff' : '#555',
        border: `1px solid ${killed ? '#ef4444' : '#2a2a3e'}`,
        cursor: 'pointer', letterSpacing: 0.5,
        transition: 'all 0.15s', flexShrink: 0,
      }}
    >
      {killed ? 'ON' : 'KILL'}
    </button>
  )

  const slider = (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        flex: 1, height: 3, borderRadius: 2,
        position: 'relative', background: '#1a1a2e',
        cursor: 'pointer', userSelect: 'none',
        minWidth: 50,
      }}
    >
      {value < 0 && (
        <div style={{
          position: 'absolute', left: `${thumbPercent}%`, top: 0, height: '100%',
          width: `${centerPercent - thumbPercent}%`,
          background: killed ? '#ef4444' : accent, borderRadius: 2, opacity: 0.6,
        }} />
      )}
      {value > 0 && (
        <div style={{
          position: 'absolute', left: `${centerPercent}%`, top: 0, height: '100%',
          width: `${thumbPercent - centerPercent}%`,
          background: killed ? '#ef4444' : accent, borderRadius: 2, opacity: 0.6,
        }} />
      )}
      <div style={{
        position: 'absolute',
        left: `${thumbPercent}%`,
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 10,
        height: 18,
        borderRadius: 3,
        background: '#2a2a3e',
        border: '1px solid #3a3a50',
        boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
        cursor: 'grab',
        zIndex: 2,
      }} />
    </div>
  )

  const labelEl = (
    <span style={{
      fontSize: 9, fontWeight: 700, width: 26,
      textAlign: reverse ? 'left' : 'right',
      color: killed ? '#ef4444' : '#888',
      fontFamily: 'var(--font-mono)', letterSpacing: 0.5, flexShrink: 0,
    }}>
      {label}
    </span>
  )

  // Deck A (default): KILL → slider → LABEL
  // Deck B (reverse):  LABEL → slider → KILL
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {reverse ? labelEl : killBtn}
      {slider}
      {reverse ? killBtn : labelEl}
    </div>
  )
}

function fmtTime(seconds: number): string {
  if (!seconds || seconds < 0 || !isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface DeckPanelProps {
  deckId: 'A' | 'B'
  deck: DeckState
  isActive: boolean
  volume: number
  initialTime?: number
  onPlayPause: () => void
  onCue: () => void
  onEject: () => void
  onLoadTrack: (t: Track) => void
  onTimeUpdate?: (currentTime: number, duration: number) => void
}

export interface DeckPanelHandle {
  getVideoElement: () => HTMLVideoElement | null
  setPlaybackRate: (rate: number) => void
  getAudioEngine: () => AudioEngine
  setEQ: (band: 'high' | 'mid' | 'low', db: number) => void
  toggleKill: (band: 'high' | 'mid' | 'low') => void
  getEQ: () => EQState
  getLoopController: () => LoopController
  getTempoController: () => TempoController
}

export const DeckPanel = forwardRef<DeckPanelHandle, DeckPanelProps>(function DeckPanel({ deckId, deck, isActive, volume, initialTime, onPlayPause, onCue, onEject, onLoadTrack, onTimeUpdate }, ref) {
  const accent = deckId === 'A' ? '#45b1e8' : '#ef4444'
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioEngineRef = useRef(new AudioEngine())
  const loopRef = useRef(new LoopController())
  const tempoRef = useRef(new TempoController())
  const [loopActive, setLoopActive] = useState(false)
  const [hotcueSlots, setHotcueSlots] = useState<(number | null)[]>([null, null, null, null])

  // Connect loop + tempo controllers to video element
  useEffect(() => {
    const vid = videoRef.current
    if (vid) {
      loopRef.current.attach(vid)
      tempoRef.current.setOnRateChange(rate => { if (vid) vid.playbackRate = rate })
    }
    return () => { loopRef.current.detach() }
  }, [deck.track?.videoUrl])

  // Set BPM on tempo controller when track loads
  useEffect(() => {
    if (deck.track?.bpm) tempoRef.current.setOriginalBpm(deck.track.bpm)
  }, [deck.track?.bpm])

  // Load hotcues for current track
  useEffect(() => {
    if (deck.track?.id) {
      const cues = hotcueManager.getCues(deck.track.id)
      setHotcueSlots(prev => {
        const slots: (number | null)[] = [null, null, null, null]
        cues.slice(0, 4).forEach((c, i) => { slots[i] = c.time })
        return slots
      })
    } else {
      setHotcueSlots([null, null, null, null])
    }
  }, [deck.track?.id])

  useImperativeHandle(ref, () => ({
    getVideoElement: () => videoRef.current,
    getLoopController: () => loopRef.current,
    getTempoController: () => tempoRef.current,
    setPlaybackRate: (rate: number) => {
      if (videoRef.current) {
        videoRef.current.playbackRate = rate
        // Disable pitch correction to avoid latency during beatmatching
        ;(videoRef.current as HTMLVideoElement & { preservesPitch: boolean }).preservesPitch = rate === 1
      }
    },
    getAudioEngine: () => audioEngineRef.current,
    setEQ: (band: 'high' | 'mid' | 'low', db: number) => audioEngineRef.current.setEQ(band, db),
    toggleKill: (band: 'high' | 'mid' | 'low') => audioEngineRef.current.toggleKill(band),
    getEQ: () => audioEngineRef.current.getEQ(),
  }))
  const discContainerRef = useRef<HTMLDivElement>(null)
  const [discSize, setDiscSize] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const rafRef = useRef<number>(0)
  const initialTimeApplied = useRef(false)
  const onTimeUpdateRef = useRef(onTimeUpdate)
  onTimeUpdateRef.current = onTimeUpdate

  // ---------------------------------------------------------------------------
  // Time tracking via RAF — always runs, reads from video element
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let running = true
    function tick() {
      if (!running) return
      const vid = videoRef.current
      if (vid && vid.readyState >= 2) {
        setCurrentTime(vid.currentTime)
        if (vid.duration && !isNaN(vid.duration)) {
          setVideoDuration(vid.duration)
          onTimeUpdateRef.current?.(vid.currentTime, vid.duration)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [])

  // ---------------------------------------------------------------------------
  // Audio engine: connect once when video has data, control volume through it
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const vid = videoRef.current
    if (!vid || audioEngineRef.current.isConnected()) return

    // Wait for video to have data before connecting (needs a source loaded)
    function tryConnect() {
      if (!vid || audioEngineRef.current.isConnected()) return
      if (vid.readyState >= 2) {
        const connected = audioEngineRef.current.connect(vid)
        if (!connected) {
          vid.volume = Math.max(0, Math.min(1, volume))
        }
      }
    }

    vid.addEventListener('loadeddata', tryConnect, { once: true })
    // Also try immediately in case it's already loaded
    tryConnect()

    return () => vid.removeEventListener('loadeddata', tryConnect)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck.track?.videoUrl])

  useEffect(() => {
    audioEngineRef.current.setVolume(volume)
  }, [volume])

  // ---------------------------------------------------------------------------
  // Load video source + seek to initialTime
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return

    if (deck.track?.videoUrl) {
      vid.src = deck.track.videoUrl

      function onLoaded() {
        if (!vid) return
        // Seek to restore position
        if (initialTime && initialTime > 0 && !initialTimeApplied.current) {
          initialTimeApplied.current = true
          vid.currentTime = initialTime
          setCurrentTime(initialTime)
        }
        if (vid.duration && !isNaN(vid.duration)) {
          setVideoDuration(vid.duration)
        }
      }

      vid.addEventListener('loadeddata', onLoaded, { once: true })
      vid.load()
    } else {
      initialTimeApplied.current = false
      vid.removeAttribute('src')
      vid.load()
      setCurrentTime(0)
      setVideoDuration(0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck.track?.videoUrl])

  // ---------------------------------------------------------------------------
  // Play / Pause — simple, direct, no gates
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return

    if (deck.playing) {
      // Connect audio engine if not yet connected (needs user gesture context)
      if (!audioEngineRef.current.isConnected() && vid) {
        audioEngineRef.current.connect(vid)
      }
      // Resume audio context (browser policy: needs user gesture)
      audioEngineRef.current.resume()

      // Need to wait for video to have data before playing
      function tryPlay() {
        if (!vid) return
        vid.play().catch(() => {
          // Browser blocked autoplay with sound — try muted then unmute
          vid.muted = true
          vid.play().then(() => {
            setTimeout(() => { vid.muted = false }, 200)
          }).catch(() => {})
        })
      }

      if (vid.readyState >= 2) {
        tryPlay()
      } else {
        vid.addEventListener('loadeddata', tryPlay, { once: true })
      }
    } else {
      vid.pause()
    }
  }, [deck.playing])

  // ---------------------------------------------------------------------------
  // Reset when track is ejected (id becomes null)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!deck.track) {
      setCurrentTime(0)
      setVideoDuration(0)
      initialTimeApplied.current = false
    }
  }, [deck.track])

  // ---------------------------------------------------------------------------
  // Disc size measurement
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const el = discContainerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setDiscSize(Math.floor(Math.min(width, height) * 0.9))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ---------------------------------------------------------------------------
  // Seek handler for waveform clicks
  // ---------------------------------------------------------------------------
  const handleSeek = useCallback((time: number) => {
    const vid = videoRef.current
    if (vid) {
      vid.currentTime = time
      setCurrentTime(time)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Drag & drop
  // ---------------------------------------------------------------------------
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.style.outline = 'none'
    try {
      const track: Track = JSON.parse(e.dataTransfer.getData('application/json'))
      onLoadTrack(track)
    } catch {}
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    e.currentTarget.style.outline = `2px solid ${accent}`
    e.currentTarget.style.outlineOffset = '-2px'
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.currentTarget.style.outline = 'none'
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28, delay: deckId === 'A' ? 0.1 : 0.15 }}
      onDrop={handleDrop as unknown as React.DragEventHandler<HTMLDivElement>}
      onDragOver={handleDragOver as unknown as React.DragEventHandler<HTMLDivElement>}
      onDragLeave={handleDragLeave as unknown as React.DragEventHandler<HTMLDivElement>}
      style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '8px 16px', background: '#0a0a14',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Video — always mounted so ref is stable */}
      <video
        ref={videoRef}
        playsInline
        onEnded={onPlayPause}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          opacity: deck.track?.videoUrl ? (isActive ? 0.15 : 0.08) : 0,
          pointerEvents: 'none', zIndex: 0,
        }}
      />

      {/* Top row: Deck label + Waveform bar */}
      <div style={{
        zIndex: 1, width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        flexShrink: 0, flexDirection: deckId === 'A' ? 'row' : 'row-reverse',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{
            fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: 4,
            color: isActive ? accent : '#555570', textTransform: 'uppercase',
          }}>
            Deck {deckId}
          </span>
          {isActive && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              style={{
                width: 6, height: 6, borderRadius: '50%', background: accent,
                boxShadow: `0 0 8px ${accent}`,
              }}
            />
          )}
        </div>

        {deck.track && (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{
              width: '100%', height: 36,
              background: '#0a0a12', borderRadius: 6,
              overflow: 'hidden', border: '1px solid #1a1a2e',
            }}>
              <Waveform
                videoUrl={deck.track.videoUrl}
                currentTime={currentTime}
                duration={videoDuration}
                playing={deck.playing}
                accent={accent}
                onSeek={handleSeek}
              />
            </div>
            {videoDuration > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: accent, fontWeight: 700 }}>
                  {fmtTime(currentTime)}
                </span>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#555570', fontWeight: 700 }}>
                  -{fmtTime(videoDuration - currentTime)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vinyl disc */}
      <div
        ref={discContainerRef}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', minHeight: 0, zIndex: 1, overflow: 'hidden',
        }}
      >
        <motion.div
          animate={deck.playing ? { rotate: 360 } : {}}
          transition={deck.playing ? { duration: 2.5, repeat: Infinity, ease: 'linear' } : {}}
          style={{
            width: discSize || 100, height: discSize || 100,
            borderRadius: '50%',
            background: `radial-gradient(circle at 50% 50%, #1a1a2a 25%, ${accent}18 55%, ${accent}08 75%, #0a0a14)`,
            border: `2px solid ${accent}${isActive ? '88' : '33'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: isActive ? `0 0 60px ${accent}22, inset 0 0 40px ${accent}08` : 'none',
            transition: 'border-color 0.3s, box-shadow 0.3s',
            flexShrink: 0,
          }}
        >
          <Disc3Icon size={80} style={{ color: accent, opacity: isActive ? 1 : 0.5 }} />
        </motion.div>
      </div>

      {/* Track info */}
      <div style={{ textAlign: 'center', zIndex: 1, flexShrink: 0 }}>
        {deck.track ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#e0e0f0' }}>
              {deck.track.title}
              {deck.track.bpm > 0 && (
                <span style={{ color: accent, fontWeight: 700, fontSize: 11, marginLeft: 6 }}>
                  {deck.track.bpm} BPM
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, color: '#555570', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {deck.track.artist && <>{deck.track.artist}</>}
              {deck.track.key && <> &middot; {deck.track.key}</>}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: '#333348' }}>Drop a video here</div>
        )}
      </div>

      {/* Loop + Hotcue + Pitch controls */}
      {deck.track && (
        <div style={{ display: 'flex', gap: 6, zIndex: 1, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* Loop buttons */}
          <div style={{ display: 'flex', gap: 3 }}>
            {[1, 2, 4, 8].map(bars => (
              <button
                key={bars}
                onClick={() => {
                  loopRef.current.autoLoop(currentTime, deck.track?.bpm || 120, bars)
                  setLoopActive(true)
                }}
                style={{
                  fontSize: 8, fontWeight: 800, padding: '3px 6px', borderRadius: 3,
                  background: loopActive && loopRef.current.getState().barLength === bars ? accent : 'transparent',
                  color: loopActive && loopRef.current.getState().barLength === bars ? '#000' : '#555',
                  border: `1px solid ${loopActive && loopRef.current.getState().barLength === bars ? accent : '#2a2a3e'}`,
                  cursor: 'pointer',
                }}
              >
                {bars}
              </button>
            ))}
            <button
              onClick={() => { loopRef.current.deactivate(); setLoopActive(false) }}
              style={{
                fontSize: 7, fontWeight: 800, padding: '3px 5px', borderRadius: 3,
                background: loopActive ? '#ef4444' : 'transparent',
                color: loopActive ? '#fff' : '#444',
                border: `1px solid ${loopActive ? '#ef4444' : '#2a2a3e'}`,
                cursor: 'pointer',
              }}
            >
              {loopActive ? 'EXIT' : 'LOOP'}
            </button>
          </div>

          {/* Hotcue buttons (4 slots: A B C D) */}
          <div style={{ display: 'flex', gap: 3 }}>
            {['A', 'B', 'C', 'D'].map((label, idx) => {
              const hasHotcue = hotcueSlots[idx] !== null
              const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e']
              return (
                <button
                  key={label}
                  onClick={() => {
                    if (hasHotcue && videoRef.current) {
                      // Jump to hotcue
                      videoRef.current.currentTime = hotcueSlots[idx]!
                    } else if (deck.track?.id) {
                      // Set hotcue at current position
                      hotcueManager.setCue(deck.track.id, idx, currentTime, label)
                      setHotcueSlots(prev => { const n = [...prev]; n[idx] = currentTime; return n })
                    }
                  }}
                  onContextMenu={e => {
                    e.preventDefault()
                    // Right-click to delete
                    if (deck.track?.id) {
                      hotcueManager.removeCue(deck.track.id, label)
                      setHotcueSlots(prev => { const n = [...prev]; n[idx] = null; return n })
                    }
                  }}
                  style={{
                    fontSize: 8, fontWeight: 900, padding: '3px 6px', borderRadius: 3,
                    background: hasHotcue ? colors[idx] : 'transparent',
                    color: hasHotcue ? '#000' : '#444',
                    border: `1px solid ${hasHotcue ? colors[idx] : '#2a2a3e'}`,
                    cursor: 'pointer', minWidth: 20, textAlign: 'center',
                  }}
                  title={hasHotcue ? `Jump to ${label} (${fmtTime(hotcueSlots[idx]!)}) — right-click to delete` : `Set hotcue ${label}`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* Pitch / BPM display */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              fontSize: 8, fontFamily: 'var(--font-mono)', color: '#555',
            }}>
              {tempoRef.current.getState().pitch !== 0
                ? `${tempoRef.current.getState().pitch > 0 ? '+' : ''}${tempoRef.current.getState().pitch.toFixed(1)}%`
                : ''}
            </span>
          </div>
        </div>
      )}

      {/* Transport controls — centered */}
      <div style={{
        display: 'flex', gap: 8, zIndex: 1, flexShrink: 0, paddingBottom: 4,
        alignItems: 'center', justifyContent: 'center',
      }}>
          <motion.button
            onClick={onPlayPause}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.92 }}
            title={deck.playing ? 'Pause' : 'Play'}
            style={{
              width: 40, height: 40, borderRadius: '50%',
              background: deck.playing ? `${accent}22` : accent,
              border: `1px solid ${accent}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: deck.playing ? accent : '#fff',
            }}
          >
            {deck.playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
          </motion.button>

          <motion.button
            onClick={() => {
              onCue()
              const vid = videoRef.current
              if (vid) { vid.currentTime = 0; vid.pause() }
              setCurrentTime(0)
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.92 }}
            title="Cue — return to start"
            style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'transparent', border: `1px solid ${accent}44`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#888',
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>CUE</span>
          </motion.button>

          <motion.button
            onClick={onEject}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.92 }}
            title="Eject — remove track from deck"
            style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'transparent', border: `1px solid ${accent}44`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#888',
              opacity: deck.track ? 1 : 0.3,
              pointerEvents: deck.track ? 'auto' : 'none',
            }}
          >
            <ChevronUpIcon size={16} />
          </motion.button>
      </div>
    </motion.div>
  )
})
