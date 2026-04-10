'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MessageCircle } from 'lucide-react'
import { StreamCompositor, DEFAULT_STREAM_CONFIG, RESOLUTION_PRESETS, type StreamConfig } from '@/app/lib/streamCapture'
import { WHIPClient } from '@/app/lib/whipClient'
import { TwitchChatClient, YouTubeChatClient, type TwitchMessage, type YouTubeMessage } from '@/app/lib/twitchChat'
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

type StreamStatus = 'offline' | 'connecting' | 'live' | 'error'

// ---------------------------------------------------------------------------
// Stream Dashboard
// ---------------------------------------------------------------------------

type Platform = 'twitch' | 'youtube'

interface ChatMessage {
  id: string
  author: string
  message: string
  color: string
  timestamp: number
  platform: Platform
  isMod: boolean
}

export function StreamDashboard({ onClose, deckARef, deckBRef, crossfader, nowPlaying }: StreamDashboardProps) {
  const [platform, setPlatform] = useState<Platform>('twitch')
  const [streamKey, setStreamKey] = useState('')
  const [twitchChannel, setTwitchChannel] = useState('')
  const [youtubeApiKey, setYoutubeApiKey] = useState('')
  const [youtubeVideoId, setYoutubeVideoId] = useState('')
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p')
  const [bitrate, setBitrate] = useState(4500)
  const [overlayEnabled, setOverlayEnabled] = useState(true)
  const [overlayPosition, setOverlayPosition] = useState<StreamConfig['overlayPosition']>('bottom-left')
  const [status, setStatus] = useState<StreamStatus>('offline')
  const [streamDuration, setStreamDuration] = useState(0)
  const [error, setError] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatStatus, setChatStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [showChat, setShowChat] = useState(true)

  const compositorRef = useRef<StreamCompositor | null>(null)
  const whipClientRef = useRef<WHIPClient | null>(null)
  const twitchChatRef = useRef<TwitchChatClient | null>(null)
  const youtubeChatRef = useRef<YouTubeChatClient | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Load saved settings from localStorage
  useEffect(() => {
    const savedKey = localStorage.getItem('stream_key_twitch')
    if (savedKey) setStreamKey(savedKey)
    const savedChannel = localStorage.getItem('twitch_channel')
    if (savedChannel) setTwitchChannel(savedChannel)
    const savedYtKey = localStorage.getItem('youtube_api_key')
    if (savedYtKey) setYoutubeApiKey(savedYtKey)
    const savedYtId = localStorage.getItem('youtube_video_id')
    if (savedYtId) setYoutubeVideoId(savedYtId)
    const savedPlatform = localStorage.getItem('stream_platform') as Platform | null
    if (savedPlatform) setPlatform(savedPlatform)
  }, [])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

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

  // Chat connections
  const connectChat = useCallback(() => {
    // Disconnect any existing
    twitchChatRef.current?.disconnect()
    youtubeChatRef.current?.disconnect()

    const addMessage = (msg: ChatMessage) => {
      setChatMessages(prev => {
        const next = [...prev, msg]
        return next.length > 200 ? next.slice(-150) : next
      })
    }

    if (platform === 'twitch') {
      const channel = twitchChannel
      if (!channel) return
      localStorage.setItem('twitch_channel', channel)

      const client = new TwitchChatClient()
      twitchChatRef.current = client
      client.connect(channel, (msg: TwitchMessage) => {
        addMessage({
          id: msg.id,
          author: msg.displayName,
          message: msg.message,
          color: msg.color,
          timestamp: msg.timestamp,
          platform: 'twitch',
          isMod: msg.isModerator,
        })
      }, (s) => {
        setChatStatus(s)
      })
    } else if (platform === 'youtube') {
      if (!youtubeApiKey || !youtubeVideoId) return

      localStorage.setItem('youtube_api_key', youtubeApiKey)
      localStorage.setItem('youtube_video_id', youtubeVideoId)

      const client = new YouTubeChatClient()
      youtubeChatRef.current = client
      client.connect(youtubeVideoId, youtubeApiKey, (msg: YouTubeMessage) => {
        addMessage({
          id: msg.id,
          author: msg.author,
          message: msg.message,
          color: msg.isOwner ? '#ffff00' : msg.isModerator ? '#4ade80' : '#888',
          timestamp: msg.timestamp,
          platform: 'youtube',
          isMod: msg.isModerator || msg.isOwner,
        })
      }, (s, err) => {
        setChatStatus(s)
        if (err) setError(err)
      })
    }
  }, [platform, twitchChannel, youtubeApiKey, youtubeVideoId])

  const disconnectChat = useCallback(() => {
    twitchChatRef.current?.disconnect()
    twitchChatRef.current = null
    youtubeChatRef.current?.disconnect()
    youtubeChatRef.current = null
    setChatStatus('disconnected')
  }, [])

  // Go Live
  const goLive = useCallback(async () => {
    if (!streamKey) { setError('Enter your stream key'); return }
    if (!compositorRef.current) { setError('Preview not started'); return }

    setError('')
    setStatus('connecting')

    try {
      const stream = compositorRef.current.getStream()
      if (!stream) { setStatus('error'); setError('No stream available'); return }

      localStorage.setItem('stream_key_twitch', streamKey)
      localStorage.setItem('stream_platform', platform)

      const whipClient = new WHIPClient()
      whipClientRef.current = whipClient

      whipClient.setOnStateChange((state, err) => {
        if (state === 'live') {
          setStatus('live')
        } else if (state === 'error') {
          setStatus('error')
          setError(err || 'Stream connection failed')
        } else if (state === 'idle') {
          setStatus('offline')
        }
      })

      await whipClient.start(stream, streamKey, { videoBitrate: bitrate })

      setStreamDuration(0)
      durationIntervalRef.current = setInterval(() => {
        setStreamDuration(d => d + 1)
      }, 1000)

      // Auto-connect chat when going live
      connectChat()

    } catch (e) {
      setStatus('error')
      setError((e as Error).message)
    }
  }, [streamKey, bitrate, platform, connectChat])

  // Stop stream
  const stopStream = useCallback(async () => {
    await whipClientRef.current?.stop()
    whipClientRef.current = null
    disconnectChat()

    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current)

    setStatus('offline')
    setStreamDuration(0)
  }, [disconnectChat])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      twitchChatRef.current?.disconnect()
      youtubeChatRef.current?.disconnect()
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
              Go live on Twitch
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
            {/* Platform */}
            <div>
              <label style={labelStyle}>Platform</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['twitch', 'youtube'] as const).map(p => (
                  <button key={p} onClick={() => setPlatform(p)} disabled={status === 'live'} style={{
                    ...pillStyle,
                    background: platform === p ? (p === 'twitch' ? '#9146ff' : '#ff0000') : '#1a1a2e',
                    color: platform === p ? '#fff' : '#888',
                    border: platform === p ? `1px solid ${p === 'twitch' ? '#9146ff' : '#ff0000'}` : '1px solid #2a2a3e',
                  }}>{p === 'twitch' ? 'Twitch' : 'YouTube'}</button>
                ))}
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

            {/* Twitch channel (for chat) */}
            {platform === 'twitch' && (
              <div>
                <label style={labelStyle}>Channel Name (for chat)</label>
                <input
                  value={twitchChannel}
                  onChange={e => setTwitchChannel(e.target.value)}
                  placeholder="your_channel"
                  style={inputStyle}
                  disabled={status === 'live'}
                />
              </div>
            )}

            {/* YouTube-specific settings */}
            {platform === 'youtube' && (
              <>
                <div>
                  <label style={labelStyle}>YouTube API Key</label>
                  <input
                    type="password"
                    value={youtubeApiKey}
                    onChange={e => setYoutubeApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    style={inputStyle}
                    disabled={status === 'live'}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Video / Broadcast ID</label>
                  <input
                    value={youtubeVideoId}
                    onChange={e => setYoutubeVideoId(e.target.value)}
                    placeholder="dQw4w9WgXcQ or full URL"
                    style={inputStyle}
                    disabled={status === 'live'}
                  />
                  <span style={{ fontSize: 9, color: '#444', marginTop: 2, display: 'block' }}>
                    Needed for live chat — paste video ID or YouTube URL
                  </span>
                </div>
              </>
            )}

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
                  disabled={status === 'connecting'}
                  style={{
                    width: '100%', padding: '14px 0', borderRadius: 10,
                    background: status === 'connecting' ? '#555' : 'linear-gradient(135deg, #ffff00, #cccc00)',
                    color: '#000', fontWeight: 900, fontSize: 14, border: 'none',
                    cursor: status === 'connecting' ? 'not-allowed' : 'pointer',
                    letterSpacing: 1, opacity: status === 'connecting' ? 0.5 : 1,
                  }}
                >
                  {status === 'connecting' ? 'CONNECTING...' : 'GO LIVE'}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Chat Panel */}
        {showChat && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageCircle size={14} color="#555570" />
                <span style={{ fontSize: 10, color: '#555570', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase' }}>
                  Live Chat
                </span>
                {chatStatus === 'connected' && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {chatStatus === 'disconnected' ? (
                  <button onClick={connectChat} style={{ ...pillStyle, fontSize: 9, padding: '3px 10px', background: '#1a1a2e', color: '#888', border: '1px solid #2a2a3e' }}>
                    Connect Chat
                  </button>
                ) : (
                  <button onClick={disconnectChat} style={{ ...pillStyle, fontSize: 9, padding: '3px 10px', background: '#1a1a2e', color: '#888', border: '1px solid #2a2a3e' }}>
                    Disconnect
                  </button>
                )}
                <button onClick={() => setShowChat(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555570', padding: 2 }}>
                  <X size={14} />
                </button>
              </div>
            </div>
            <div style={{
              height: 180, background: '#0a0a14', borderRadius: 8, border: '1px solid #1a1a2e',
              overflowY: 'auto', padding: '8px 12px',
            }}>
              {chatMessages.length === 0 ? (
                <div style={{ color: '#333348', fontSize: 11, textAlign: 'center', marginTop: 60 }}>
                  {chatStatus === 'connected' ? 'Waiting for messages...' : 'Chat not connected'}
                </div>
              ) : (
                chatMessages.map(msg => (
                  <div key={msg.id} style={{ marginBottom: 4, fontSize: 11, lineHeight: 1.4 }}>
                    <span style={{ color: msg.color, fontWeight: msg.isMod ? 700 : 500 }}>
                      {msg.author}
                    </span>
                    <span style={{ color: '#555570' }}>: </span>
                    <span style={{ color: '#ccc' }}>{msg.message}</span>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
          </div>
        )}
        {!showChat && (
          <button onClick={() => setShowChat(true)} style={{ marginTop: 12, ...pillStyle, fontSize: 9, padding: '4px 12px', background: '#1a1a2e', color: '#555570', border: '1px solid #2a2a3e', width: 'auto' }}>
            <MessageCircle size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Show Chat
          </button>
        )}
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
