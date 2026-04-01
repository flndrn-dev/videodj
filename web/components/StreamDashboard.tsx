'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { StreamCompositor, StreamRecorder, DEFAULT_STREAM_CONFIG, RESOLUTION_PRESETS, type StreamConfig } from '@/app/lib/streamCapture'
import type { DeckPanelHandle } from '@/components/deck/DeckPanel'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StreamDashboardProps {
  onClose: () => void
  deckARef: React.RefObject<DeckPanelHandle | null>
  deckBRef: React.RefObject<DeckPanelHandle | null>
  crossfader: number
  nowPlaying: { title: string; artist: string; bpm: number; key: string } | null
}

type StreamPlatform = 'twitch' | 'youtube'
type StreamStatus = 'offline' | 'connecting' | 'live' | 'error'

// ---------------------------------------------------------------------------
// Stream Dashboard
// ---------------------------------------------------------------------------

export function StreamDashboard({ onClose, deckARef, deckBRef, crossfader, nowPlaying }: StreamDashboardProps) {
  const [platform, setPlatform] = useState<StreamPlatform>('twitch')
  const [streamKey, setStreamKey] = useState('')
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p')
  const [bitrate, setBitrate] = useState(4500)
  const [overlayEnabled, setOverlayEnabled] = useState(true)
  const [overlayPosition, setOverlayPosition] = useState<StreamConfig['overlayPosition']>('bottom-left')
  const [status, setStatus] = useState<StreamStatus>('offline')
  const [ffmpegInstalled, setFfmpegInstalled] = useState<boolean | null>(null)
  const [streamDuration, setStreamDuration] = useState(0)
  const [error, setError] = useState('')

  const compositorRef = useRef<StreamCompositor | null>(null)
  const recorderRef = useRef<StreamRecorder | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const sendIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Load saved stream key from localStorage
  useEffect(() => {
    const savedKey = localStorage.getItem(`stream_key_${platform}`)
    if (savedKey) setStreamKey(savedKey)
  }, [platform])

  // Check FFmpeg on mount
  useEffect(() => {
    fetch('/api/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check-ffmpeg' }),
    })
      .then(r => r.json())
      .then(data => setFfmpegInstalled(data.installed))
      .catch(() => setFfmpegInstalled(false))
  }, [])

  // Update compositor crossfader
  useEffect(() => {
    compositorRef.current?.setCrossfader(crossfader)
  }, [crossfader])

  // Update compositor now playing
  useEffect(() => {
    compositorRef.current?.setNowPlaying(nowPlaying)
  }, [nowPlaying])

  // Start preview
  const startPreview = useCallback(() => {
    if (compositorRef.current) return

    const res = RESOLUTION_PRESETS[resolution]
    const config: StreamConfig = {
      ...DEFAULT_STREAM_CONFIG,
      ...res,
      videoBitrate: bitrate,
      overlayEnabled,
      overlayPosition,
    }

    const compositor = new StreamCompositor(config)
    compositorRef.current = compositor

    // Get video elements from deck refs
    const videoA = deckARef.current?.getVideoElement() || null
    const videoB = deckBRef.current?.getVideoElement() || null
    compositor.setVideoSources(videoA, videoB)
    compositor.setCrossfader(crossfader)
    compositor.setNowPlaying(nowPlaying)

    // Start compositing (but don't record yet)
    compositor.start()

    // Mount canvas to preview container
    if (previewRef.current) {
      const canvas = compositor.getCanvas()
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      canvas.style.objectFit = 'contain'
      canvas.style.borderRadius = '8px'
      previewRef.current.innerHTML = ''
      previewRef.current.appendChild(canvas)
    }
  }, [resolution, bitrate, overlayEnabled, overlayPosition, deckARef, deckBRef, crossfader, nowPlaying])

  // Stop preview
  const stopPreview = useCallback(() => {
    compositorRef.current?.stop()
    compositorRef.current = null
    if (previewRef.current) previewRef.current.innerHTML = ''
  }, [])

  // Auto-start preview when dashboard opens
  useEffect(() => {
    const timer = setTimeout(startPreview, 500)
    return () => {
      clearTimeout(timer)
      stopPreview()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Go Live
  const goLive = useCallback(async () => {
    if (!streamKey) { setError('Enter your stream key'); return }
    if (!ffmpegInstalled) { setError('FFmpeg is not installed'); return }
    if (!compositorRef.current) { setError('Preview not started'); return }

    setError('')
    setStatus('connecting')

    // Build RTMP URL
    const rtmpUrl = platform === 'twitch'
      ? `rtmp://live.twitch.tv/app/${streamKey}`
      : `rtmp://a.rtmp.youtube.com/live2/${streamKey}`

    const res = RESOLUTION_PRESETS[resolution]

    try {
      // Start FFmpeg on server
      const resp = await fetch('/api/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          rtmpUrl,
          width: res.width,
          height: res.height,
          videoBitrate: bitrate,
          audioBitrate: 192,
        }),
      })
      const data = await resp.json()
      if (!data.success) { setStatus('error'); setError(data.error); return }

      // Save stream key
      localStorage.setItem(`stream_key_${platform}`, streamKey)

      // Start MediaRecorder and send chunks to server
      const stream = compositorRef.current.getStream()
      if (!stream) { setStatus('error'); setError('No stream available'); return }

      const recorder = new StreamRecorder()
      recorderRef.current = recorder

      recorder.start(stream, async (chunk) => {
        // Convert blob to base64 and send to server
        const reader = new FileReader()
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1]
          try {
            await fetch('/api/stream', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'data', chunk: base64 }),
            })
          } catch { /* swallow network errors during streaming */ }
        }
        reader.readAsDataURL(chunk)
      }, 1000) // 1 second chunks

      setStatus('live')
      setStreamDuration(0)

      // Duration counter
      durationIntervalRef.current = setInterval(() => {
        setStreamDuration(d => d + 1)
      }, 1000)

    } catch (e) {
      setStatus('error')
      setError((e as Error).message)
    }
  }, [streamKey, ffmpegInstalled, platform, resolution, bitrate])

  // Stop stream
  const stopStream = useCallback(async () => {
    recorderRef.current?.stop()
    recorderRef.current = null

    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current)
    if (sendIntervalRef.current) clearInterval(sendIntervalRef.current)

    try {
      await fetch('/api/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      })
    } catch { /* ignore */ }

    setStatus('offline')
    setStreamDuration(0)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (status === 'live') stopStream()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && status !== 'live') onClose() }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{
          background: '#12121e', borderRadius: 16, border: '1px solid #2a2a3e',
          width: 900, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto',
          padding: 32,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>
              Stream Dashboard
            </h2>
            <p style={{ fontSize: 12, color: '#555570', margin: '4px 0 0' }}>
              Configure and go live on Twitch or YouTube
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {status === 'live' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8,
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
              }}>
                <motion.div
                  style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <span style={{ fontSize: 12, fontWeight: 800, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>
                  LIVE {formatDuration(streamDuration)}
                </span>
              </div>
            )}
            <button onClick={status === 'live' ? undefined : onClose}
              style={{ background: 'none', border: 'none', cursor: status === 'live' ? 'not-allowed' : 'pointer', color: '#555570', padding: 4 }}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24 }}>
          {/* Left: Preview */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: '#555570', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
              Stream Preview
            </div>
            <div ref={previewRef} style={{
              width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: 8,
              border: '1px solid #2a2a3e', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: '#555570', fontSize: 12 }}>Loading preview...</span>
            </div>

            {/* Now Playing info */}
            {nowPlaying && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#0a0a14', borderRadius: 6, border: '1px solid #1a1a2e' }}>
                <div style={{ fontSize: 11, color: '#ccc', fontWeight: 600 }}>{nowPlaying.title}</div>
                <div style={{ fontSize: 10, color: '#555570' }}>{nowPlaying.artist} · {nowPlaying.bpm} BPM · {nowPlaying.key}</div>
              </div>
            )}
          </div>

          {/* Right: Settings */}
          <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* FFmpeg status */}
            {ffmpegInstalled === false && (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: 11, color: '#ef4444' }}>
                FFmpeg not found. Install it:<br />
                <code style={{ fontSize: 10, color: '#ff8888' }}>brew install ffmpeg</code>
              </div>
            )}
            {ffmpegInstalled === true && (
              <div style={{ padding: '8px 12px', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 8, fontSize: 11, color: '#4ade80' }}>
                FFmpeg ready
              </div>
            )}

            {/* Platform */}
            <div>
              <label style={labelStyle}>Platform</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPlatform('twitch')} style={{
                  ...pillStyle, background: platform === 'twitch' ? '#9146FF' : '#1a1a2e',
                  color: platform === 'twitch' ? '#fff' : '#888',
                  border: platform === 'twitch' ? '1px solid #9146FF' : '1px solid #2a2a3e',
                }}>Twitch</button>
                <button onClick={() => setPlatform('youtube')} style={{
                  ...pillStyle, background: platform === 'youtube' ? '#FF0000' : '#1a1a2e',
                  color: platform === 'youtube' ? '#fff' : '#888',
                  border: platform === 'youtube' ? '1px solid #FF0000' : '1px solid #2a2a3e',
                }}>YouTube</button>
              </div>
            </div>

            {/* Stream Key */}
            <div>
              <label style={labelStyle}>Stream Key</label>
              <input
                type="password"
                value={streamKey}
                onChange={e => setStreamKey(e.target.value)}
                placeholder={platform === 'twitch' ? 'live_xxxxxxxxx' : 'xxxx-xxxx-xxxx-xxxx'}
                style={inputStyle}
                disabled={status === 'live'}
              />
            </div>

            {/* Resolution */}
            <div>
              <label style={labelStyle}>Resolution</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['720p', '1080p'] as const).map(r => (
                  <button key={r} onClick={() => setResolution(r)} disabled={status === 'live'} style={{
                    ...pillStyle,
                    background: resolution === r ? '#ffff00' : '#1a1a2e',
                    color: resolution === r ? '#000' : '#888',
                    border: resolution === r ? '1px solid #ffff00' : '1px solid #2a2a3e',
                  }}>{r}</button>
                ))}
              </div>
            </div>

            {/* Bitrate */}
            <div>
              <label style={labelStyle}>Video Bitrate: {bitrate} kbps</label>
              <input
                type="range" min={2500} max={6000} step={500}
                value={bitrate} onChange={e => setBitrate(Number(e.target.value))}
                disabled={status === 'live'}
                style={{ width: '100%', accentColor: '#ffff00' }}
              />
            </div>

            {/* Overlay */}
            <div>
              <label style={labelStyle}>Now Playing Overlay</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={overlayEnabled} onChange={e => setOverlayEnabled(e.target.checked)} />
                <span style={{ fontSize: 11, color: '#888' }}>Show on stream</span>
              </div>
              {overlayEnabled && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  {(['bottom-left', 'bottom-right', 'top-left', 'top-right'] as const).map(pos => (
                    <button key={pos} onClick={() => setOverlayPosition(pos)} style={{
                      ...pillStyle, fontSize: 9, padding: '3px 8px',
                      background: overlayPosition === pos ? '#ffff00' : '#1a1a2e',
                      color: overlayPosition === pos ? '#000' : '#555',
                      border: overlayPosition === pos ? '1px solid #ffff00' : '1px solid #2a2a3e',
                    }}>{pos.replace('-', ' ')}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: 11, color: '#ef4444' }}>
                {error}
              </div>
            )}

            {/* GO LIVE / STOP */}
            <AnimatePresence mode="wait">
              {status === 'live' ? (
                <motion.button
                  key="stop"
                  initial={{ scale: 0.95 }} animate={{ scale: 1 }}
                  onClick={stopStream}
                  style={{
                    width: '100%', padding: '14px 0', borderRadius: 10,
                    background: '#ef4444', color: '#fff',
                    fontWeight: 900, fontSize: 14, border: 'none', cursor: 'pointer',
                    letterSpacing: 1,
                  }}
                >
                  STOP STREAM
                </motion.button>
              ) : (
                <motion.button
                  key="go"
                  initial={{ scale: 0.95 }} animate={{ scale: 1 }}
                  onClick={goLive}
                  disabled={status === 'connecting' || !ffmpegInstalled}
                  style={{
                    width: '100%', padding: '14px 0', borderRadius: 10,
                    background: status === 'connecting' ? '#555' : 'linear-gradient(135deg, #ffff00, #cccc00)',
                    color: '#000', fontWeight: 900, fontSize: 14, border: 'none',
                    cursor: status === 'connecting' || !ffmpegInstalled ? 'not-allowed' : 'pointer',
                    letterSpacing: 1, opacity: !ffmpegInstalled ? 0.4 : 1,
                  }}
                >
                  {status === 'connecting' ? 'CONNECTING...' : 'GO LIVE'}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, color: '#555570',
  fontFamily: 'var(--font-mono)', letterSpacing: 1,
  textTransform: 'uppercase', marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: '#0a0a14', border: '1px solid #2a2a3e',
  color: '#ccc', fontSize: 13, fontFamily: 'var(--font-mono)',
  outline: 'none',
}

const pillStyle: React.CSSProperties = {
  flex: 1, padding: '8px 12px', borderRadius: 8,
  fontWeight: 700, fontSize: 11, cursor: 'pointer',
  transition: 'all 0.15s',
}
