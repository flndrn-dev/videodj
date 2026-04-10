'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { XIcon } from '@/components/ui/x'
import type { XIconHandle } from '@/components/ui/x'
import { MinimizeIcon } from '@/components/ui/minimize'
import type { MinimizeIconHandle } from '@/components/ui/minimize'
import { BookTextIcon } from '@/components/ui/book-text'
import type { BookTextIconHandle } from '@/components/ui/book-text'
import { MaximizeIcon } from '@/components/ui/maximize'
import type { MaximizeIconHandle } from '@/components/ui/maximize'
import { TwitchChatClient } from '@/app/lib/twitchChat'
import { loadCountdownVideos } from '@/app/lib/db'
import type { DeckPanelHandle } from '@/components/deck/DeckPanel'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CameraFeed {
  id: string
  stream: MediaStream
  label: string
  x: number  // % from left
  y: number  // % from top
  width: number  // % of preview width
}

interface StreamPreviewProps {
  onClose: () => void
  onMinimize?: () => void
  deckARef: React.RefObject<DeckPanelHandle | null>
  deckBRef: React.RefObject<DeckPanelHandle | null>
  crossfader: number
  nowPlaying: { title: string; artist: string; released?: string; thumbnail?: string } | null
  twitchMessages?: { username: string; message: string; color: string }[]
  onStartPlaying?: () => void
}

// ---------------------------------------------------------------------------
// Stream Preview
// ---------------------------------------------------------------------------

export function StreamPreview({ onClose, onMinimize, deckARef, deckBRef, crossfader, nowPlaying, twitchMessages = [], onStartPlaying }: StreamPreviewProps) {
  const [cameras, setCameras] = useState<CameraFeed[]>([])
  const [draggingCam, setDraggingCam] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [poppedOut, setPoppedOut] = useState(false)

  // Stream setup state
  const [streamTitle, setStreamTitle] = useState('DJ Bodhi Live — videoDJ.Studio')
  const [categoryQuery, setCategoryQuery] = useState('')
  const [categories, setCategories] = useState<{ id: string; name: string; box_art_url?: string }[]>([])
  const [selectedCategory, setSelectedCategory] = useState<{ id: string; name: string } | null>({ id: '26936', name: 'Music' })
  const [streamTags, setStreamTags] = useState('DJ,Music,Live')
  const [autoNowPlaying, setAutoNowPlaying] = useState(true)
  const [isLive, setIsLive] = useState(false)
  const [channelUpdating, setChannelUpdating] = useState(false)
  const lastAnnouncedTrack = useRef('')

  // Schedule state
  const [schedule, setSchedule] = useState<{ id: string; start_time: string; title: string; duration?: string }[]>([])
  const [newScheduleTitle, setNewScheduleTitle] = useState('DJ Set')
  const [newScheduleDate, setNewScheduleDate] = useState('')
  const [newScheduleTime, setNewScheduleTime] = useState('20:00')
  const [newScheduleDuration, setNewScheduleDuration] = useState('120')
  const [scheduleError, setScheduleError] = useState('')
  const [showGuide, setShowGuide] = useState(false)
  const [streamError, setStreamError] = useState('')
  const [streamElapsed, setStreamElapsed] = useState(0)
  const streamStartTimeRef = useRef(0)
  const streamTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Mic state
  const [micActive, setMicActive] = useState(false)
  const [micAvailable, setMicAvailable] = useState(false)
  const micStreamRef = useRef<MediaStream | null>(null)

  // Launch dialog state
  const [showLaunchDialog, setShowLaunchDialog] = useState(false)
  const [launchTwitch, setLaunchTwitch] = useState(true)
  const [launchRecord, setLaunchRecord] = useState(false)

  // Countdown state
  const [countdownPhase, setCountdownPhase] = useState<'idle' | 'playing' | 'crossfading' | 'done'>('idle')
  const countdownVideoRef = useRef<HTMLVideoElement | null>(null)
  const countdownFadeStart = useRef(0) // timestamp when crossfade begins
  const CROSSFADE_DURATION = 2 // seconds to crossfade from countdown → deck
  const [countdownList, setCountdownList] = useState<{ id: string; name: string }[]>([])
  const [selectedCountdownId, setSelectedCountdownId] = useState<string>('default')
  const streamRecorderRef = useRef<MediaRecorder | null>(null)
  const streamWsRef = useRef<WebSocket | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cameraVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const rafRef = useRef(0)
  const popupRef = useRef<Window | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunks = useRef<Blob[]>([])
  const logoImgRef = useRef<HTMLImageElement | null>(null)
  const djLogoRef = useRef<HTMLImageElement | null>(null)
  const closeIconRef = useRef<XIconHandle>(null)
  const minimizeIconRef = useRef<MinimizeIconHandle>(null)
  const guideCloseIconRef = useRef<XIconHandle>(null)
  const guideIconRef = useRef<BookTextIconHandle>(null)
  const popOutIconRef = useRef<MaximizeIconHandle>(null)
  const chatClientRef = useRef<TwitchChatClient | null>(null)
  const [chatMessages, setChatMessages] = useState<{ username: string; message: string; color: string }[]>([])
  const [chatStatus, setChatStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')

  // Connect to Twitch IRC chat on mount
  useEffect(() => {
    const channel = localStorage.getItem('twitch_channel') || localStorage.getItem('twitch_username')
    if (!channel) return

    const token = localStorage.getItem('twitch_token') || ''
    const username = localStorage.getItem('twitch_username') || ''

    const client = new TwitchChatClient()
    chatClientRef.current = client

    client.connect(
      channel,
      (msg) => {
        setChatMessages(prev => [...prev.slice(-50), { username: msg.displayName, message: msg.message, color: msg.color }])
      },
      (status) => {
        setChatStatus(status)
        console.log('[Twitch Chat]', status)
      },
      token,
      username,
    )

    return () => { client.disconnect() }
  }, [])

  // Detect microphone + camera availability on mount
  const [camAvailable, setCamAvailable] = useState(false)
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      setMicAvailable(devices.some(d => d.kind === 'audioinput'))
      setCamAvailable(devices.some(d => d.kind === 'videoinput'))
    }).catch(() => {})
  }, [])

  // Toggle mic on/off
  const toggleMic = useCallback(async () => {
    if (micActive && micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
      setMicActive(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      setMicActive(true)
    } catch {
      setMicActive(false)
    }
  }, [micActive])

  // Load countdown list + restore active blob URL from IndexedDB
  useEffect(() => {
    loadCountdownVideos().then(vids => {
      setCountdownList(vids.map(v => ({ id: v.id, name: v.name })))
      // Restore selected
      const activeId = localStorage.getItem('dj_countdown_active_id')
      if (activeId) {
        setSelectedCountdownId(activeId)
        const match = vids.find(v => v.id === activeId)
        if (match) {
          const url = URL.createObjectURL(match.blob)
          localStorage.setItem('dj_countdown_video', url)
        }
      }
    })
  }, [])

  // Use local chat messages (merged with any passed via props)
  const allChatMessages = chatMessages.length > 0 ? chatMessages : twitchMessages

  // Pre-load the videoDJ logo for canvas rendering
  useEffect(() => {
    const img = new Image()
    img.src = '/logo.svg'
    img.onload = () => { logoImgRef.current = img }
    // Load custom DJ logo from localStorage if set
    const customLogo = localStorage.getItem('dj_custom_logo')
    if (customLogo) {
      const dj = new Image()
      dj.src = customLogo
      dj.onload = () => { djLogoRef.current = dj }
    }
  }, [])


  // Load channel info + schedule on mount
  useEffect(() => {
    const token = localStorage.getItem('twitch_token')
    const broadcasterId = localStorage.getItem('twitch_user_id')
    if (!token || !broadcasterId) return

    // Get current channel info
    fetch('/api/twitch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-channel', token, broadcasterId }),
    }).then(r => r.json()).then(data => {
      if (data.success && data.channel) {
        setStreamTitle(data.channel.title || '')
        if (data.channel.game_name) {
          setSelectedCategory({ id: data.channel.game_id, name: data.channel.game_name })
        }
        if (data.channel.tags) setStreamTags(data.channel.tags.join(','))
      }
    }).catch(() => {})

    // Load schedule from localStorage first (always available)
    try {
      const saved = localStorage.getItem('dj_schedule')
      if (saved) setSchedule(JSON.parse(saved))
    } catch { /* ignore */ }

    // Then try to merge Twitch schedule (optional)
    fetch('/api/twitch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-schedule', token, broadcasterId }),
    }).then(r => r.json()).then(data => {
      if (data.success && data.schedule?.segments) {
        setSchedule(prev => {
          const localIds = new Set(prev.map(s => s.id))
          const twitchEntries = data.schedule.segments
            .filter((s: { id: string }) => !localIds.has(s.id))
            .map((s: { id: string; start_time: string; title: string; duration?: string }) => ({
              id: s.id, start_time: s.start_time, title: s.title, duration: s.duration,
            }))
          return [...prev, ...twitchEntries]
        })
      }
    }).catch(() => {})
  }, [])

  // Auto "Now Playing" in Twitch chat when track changes
  useEffect(() => {
    if (!autoNowPlaying || !nowPlaying || !isLive) return
    const trackKey = `${nowPlaying.artist}-${nowPlaying.title}`
    if (trackKey === lastAnnouncedTrack.current) return
    lastAnnouncedTrack.current = trackKey

    const token = localStorage.getItem('twitch_token')
    const broadcasterId = localStorage.getItem('twitch_user_id')
    if (!token || !broadcasterId) return

    fetch('/api/twitch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'send-chat', token, broadcasterId,
        message: `🎵 Now Playing: ${nowPlaying.artist || 'Unknown'} — ${nowPlaying.title}`,
      }),
    }).catch(() => {})
  }, [nowPlaying, autoNowPlaying, isLive])

  // Search Twitch categories
  const searchCategories = useCallback(async (query: string) => {
    setCategoryQuery(query)
    if (query.length < 2) { setCategories([]); return }
    const token = localStorage.getItem('twitch_token')
    if (!token) return
    try {
      const res = await fetch('/api/twitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search-categories', token, query }),
      })
      const data = await res.json()
      if (data.success) setCategories(data.categories || [])
    } catch { setCategories([]) }
  }, [])

  // Update channel info on Twitch
  const updateChannel = useCallback(async () => {
    const token = localStorage.getItem('twitch_token')
    const broadcasterId = localStorage.getItem('twitch_user_id')
    if (!token || !broadcasterId) return
    setChannelUpdating(true)
    try {
      await fetch('/api/twitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-channel', token, broadcasterId,
          title: streamTitle,
          gameId: selectedCategory?.id,
          tags: streamTags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      })
    } catch { /* silent */ }
    setChannelUpdating(false)
  }, [streamTitle, selectedCategory, streamTags])

  // Create schedule segment — saves locally, optionally pushes to Twitch
  const createSchedule = useCallback(async () => {
    if (!newScheduleDate) return
    setScheduleError('')
    const startTime = new Date(`${newScheduleDate}T${newScheduleTime}:00`).toISOString()
    const newEntry = { id: `s-${Date.now()}`, start_time: startTime, title: newScheduleTitle, duration: newScheduleDuration }

    // Save locally first (always works)
    const updated = [...schedule, newEntry]
    setSchedule(updated)
    localStorage.setItem('dj_schedule', JSON.stringify(updated))
    setNewScheduleDate('')

    // Try to push to Twitch (optional — may fail without Affiliate)
    const token = localStorage.getItem('twitch_token')
    const broadcasterId = localStorage.getItem('twitch_user_id')
    if (token && broadcasterId) {
      try {
        await fetch('/api/twitch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create-schedule', token, broadcasterId, startTime, title: newScheduleTitle, duration: newScheduleDuration }),
        })
      } catch { /* Twitch push failed — local schedule still saved */ }
    }
  }, [newScheduleDate, newScheduleTime, newScheduleTitle, newScheduleDuration, schedule])

  // Delete schedule segment
  const deleteScheduleSegment = useCallback(async (segmentId: string) => {
    const token = localStorage.getItem('twitch_token')
    const broadcasterId = localStorage.getItem('twitch_user_id')
    if (!token || !broadcasterId) return
    try {
      await fetch('/api/twitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-schedule', token, broadcasterId, segmentId }),
      })
      setSchedule(prev => {
        const updated = prev.filter(s => s.id !== segmentId)
        localStorage.setItem('dj_schedule', JSON.stringify(updated))
        return updated
      })
    } catch { /* silent */ }
  }, [])

  // ---------------------------------------------------------------------------
  // Start/stop RTMP stream via FFmpeg
  // ---------------------------------------------------------------------------

  const startStream = useCallback(async () => {
    setStreamError('')
    const streamKey = localStorage.getItem('twitch_stream_key')
    if (!streamKey) { setStreamError('No stream key. Reconnect Twitch in Settings.'); return }

    const rtmpUrl = `rtmp://live.twitch.tv/app/${streamKey}`
    const canvas = canvasRef.current
    if (!canvas) { setStreamError('No canvas'); return }

    // 1. Connect WebSocket to stream server
    const ws = new WebSocket('ws://localhost:3031')
    streamWsRef.current = ws

    try {
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => {
          ws.send(JSON.stringify({ action: 'start', rtmpUrl }))
          resolve()
        }
        ws.onerror = () => reject(new Error('WebSocket failed'))
        setTimeout(() => reject(new Error('Timeout')), 5000)
      })
    } catch {
      setStreamError('Cannot connect to stream server. Restart the app.')
      return
    }

    if (ws.readyState !== WebSocket.OPEN) return

    ws.onmessage = (e) => { try { console.log('[Stream] Server:', JSON.parse(e.data)) } catch {} }
    ws.onclose = () => {
      if (streamRecorderRef.current?.state !== 'inactive') streamRecorderRef.current?.stop()
      streamRecorderRef.current = null
      streamWsRef.current = null
      setIsLive(false)
      if (streamTimerRef.current) { clearInterval(streamTimerRef.current); streamTimerRef.current = null }
    }

    // 2. Capture canvas video + deck audio
    const videoStream = canvas.captureStream(30)
    const mediaStream = new MediaStream(videoStream.getVideoTracks())

    // Add audio from both decks (each has its own AudioContext)
    for (const ref of [deckARef, deckBRef]) {
      const engine = ref.current?.getAudioEngine()
      if (engine?.getAudioContext() && engine.getGainNode()) {
        const dest = engine.getAudioContext()!.createMediaStreamDestination()
        engine.getGainNode()!.connect(dest)
        dest.stream.getAudioTracks().forEach(t => mediaStream.addTrack(t))
      }
    }

    // Add mic if active
    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach(t => mediaStream.addTrack(t))
    }

    // 3. Start MediaRecorder → send binary chunks over WebSocket
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus' : 'video/webm'
    const recorder = new MediaRecorder(mediaStream, { mimeType: mime, videoBitsPerSecond: 4500000 })

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        e.data.arrayBuffer().then(buf => ws.send(buf))
      }
    }

    recorder.start(1000)
    streamRecorderRef.current = recorder

    // 4. Update Twitch channel info + go live
    await updateChannel()
    setIsLive(true)
    streamStartTimeRef.current = Date.now()
    setStreamElapsed(0)
    streamTimerRef.current = setInterval(() => {
      setStreamElapsed(Math.floor((Date.now() - streamStartTimeRef.current) / 1000))
    }, 1000)

    // 5. Play countdown (non-blocking — stream is already live)
    try {
      const cdVideo = document.createElement('video')
      cdVideo.src = selectedCountdownId !== 'default'
        ? await loadCountdownVideos().then(v => { const m = v.find(x => x.id === selectedCountdownId); return m ? URL.createObjectURL(m.blob) : '/assets/video/countdown.mp4' })
        : '/assets/video/countdown.mp4'
      cdVideo.playsInline = true
      countdownVideoRef.current = cdVideo

      let crossfading = false
      cdVideo.ontimeupdate = () => {
        if (cdVideo.duration && cdVideo.duration - cdVideo.currentTime <= CROSSFADE_DURATION && !crossfading) {
          crossfading = true
          setCountdownPhase('crossfading')
          countdownFadeStart.current = Date.now()
          onStartPlaying?.()
        }
      }
      cdVideo.onended = () => { setCountdownPhase('done'); countdownVideoRef.current = null }

      setCountdownPhase('playing')
      await cdVideo.play()
    } catch {
      setCountdownPhase('done')
      countdownVideoRef.current = null
    }
  }, [deckARef, deckBRef, updateChannel, selectedCountdownId, onStartPlaying])

  const stopStream = useCallback(async () => {
    if (streamRecorderRef.current && streamRecorderRef.current.state !== 'inactive') {
      streamRecorderRef.current.stop()
      streamRecorderRef.current = null
    }
    // Send stop command + close WebSocket
    if (streamWsRef.current && streamWsRef.current.readyState === WebSocket.OPEN) {
      streamWsRef.current.send(JSON.stringify({ action: 'stop' }))
      streamWsRef.current.close()
      streamWsRef.current = null
    }
    setIsLive(false)
    setStreamError('')
    // Stop stream timer
    if (streamTimerRef.current) { clearInterval(streamTimerRef.current); streamTimerRef.current = null }
    setStreamElapsed(0)
    // Reset countdown
    if (countdownVideoRef.current) { countdownVideoRef.current.pause(); countdownVideoRef.current = null }
    setCountdownPhase('idle')
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRecorderRef.current?.state !== 'inactive') streamRecorderRef.current?.stop()
      if (streamWsRef.current?.readyState === WebSocket.OPEN) {
        streamWsRef.current.send(JSON.stringify({ action: 'stop' }))
        streamWsRef.current.close()
      }
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Canvas render loop — composites deck video + cameras + overlays
  // ---------------------------------------------------------------------------
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height

    // Clear
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)

    // --- Countdown phase: render countdown video ---
    const cdVid = countdownVideoRef.current
    const isCountdownActive = cdVid && !cdVid.ended && cdVid.readyState >= 2

    if (isCountdownActive && countdownPhase === 'playing') {
      // Full countdown video
      drawVideoCover(ctx, cdVid, w, h)
      // Skip deck rendering during countdown
      // Draw cameras + overlays below
    } else if (isCountdownActive && countdownPhase === 'crossfading') {
      // Crossfading: blend countdown → deck video
      const elapsed = (Date.now() - countdownFadeStart.current) / 1000
      const fadeProgress = Math.min(1, elapsed / CROSSFADE_DURATION) // 0→1

      // Draw countdown (fading out)
      ctx.globalAlpha = 1 - fadeProgress
      drawVideoCover(ctx, cdVid, w, h)

      // Draw deck video (fading in)
      ctx.globalAlpha = fadeProgress
      const vidA = deckARef.current?.getVideoElement()
      const vidB = deckBRef.current?.getVideoElement()
      const showA = crossfader < 90 && vidA && vidA.readyState >= 2
      const showB = crossfader > 10 && vidB && vidB.readyState >= 2
      if (showA && showB) {
        const aAlpha = crossfader <= 50 ? 1 : (100 - crossfader) / 50
        const bAlpha = crossfader >= 50 ? 1 : crossfader / 50
        ctx.globalAlpha = fadeProgress * aAlpha
        drawVideoCover(ctx, vidA, w, h)
        ctx.globalAlpha = fadeProgress * bAlpha
        drawVideoCover(ctx, vidB, w, h)
      } else if (showA) {
        drawVideoCover(ctx, vidA, w, h)
      } else if (showB) {
        drawVideoCover(ctx, vidB, w, h)
      }
      ctx.globalAlpha = 1
    } else {
      // Normal deck rendering (no countdown or countdown done)
      const vidA = deckARef.current?.getVideoElement()
      const vidB = deckBRef.current?.getVideoElement()

      const showA = crossfader < 90 && vidA && vidA.readyState >= 2
      const showB = crossfader > 10 && vidB && vidB.readyState >= 2

      if (showA && showB) {
        ctx.globalAlpha = crossfader <= 50 ? 1 : Math.max(0, (100 - crossfader) / 50)
        drawVideoCover(ctx, vidA, w, h)
        ctx.globalAlpha = crossfader >= 50 ? 1 : Math.max(0, crossfader / 50)
        drawVideoCover(ctx, vidB, w, h)
        ctx.globalAlpha = 1
      } else if (showA) {
        drawVideoCover(ctx, vidA, w, h)
      } else if (showB) {
        drawVideoCover(ctx, vidB, w, h)
      }
    }

    // Draw camera feeds
    for (const cam of cameras) {
      const vidEl = cameraVideosRef.current.get(cam.id)
      if (vidEl && vidEl.readyState >= 2) {
        const cx = (cam.x / 100) * w
        const cy = (cam.y / 100) * h
        const cw = (cam.width / 100) * w
        const ch = cw * (9 / 16) // maintain 16:9 aspect

        // Border
        ctx.strokeStyle = '#ffff00'
        ctx.lineWidth = 2
        ctx.strokeRect(cx - 1, cy - 1, cw + 2, ch + 2)

        ctx.drawImage(vidEl, cx, cy, cw, ch)
      }
    }

    // Draw Now Playing overlay — matches SVG design:
    // Dark left box with vinyl icon | yellow semi-transparent right box with artist/title
    if (nowPlaying) {
      const scale = h / 1080
      const barH = Math.round(80 * scale)
      const logoBoxW = barH // square left section for DJ logo

      const barY = h - barH - Math.round(20 * scale)
      const barX = Math.round(20 * scale)
      const radius = Math.round(12 * scale)
      const titleFont = `bold ${Math.round(23 * scale)}px system-ui, -apple-system, sans-serif`
      const artistFont = `${Math.round(18 * scale)}px system-ui, -apple-system, sans-serif`
      const yearFont = `${Math.round(15 * scale)}px system-ui, -apple-system, sans-serif`

      // Measure text width for responsive yellow box
      ctx.font = titleFont
      const titleW = ctx.measureText(nowPlaying.title).width
      ctx.font = artistFont
      const artistW = ctx.measureText(nowPlaying.artist || '').width
      const yearText = nowPlaying.released || ''
      ctx.font = yearFont
      const yearW = yearText ? ctx.measureText(yearText).width : 0
      const textContentW = Math.max(titleW, artistW, yearW) + Math.round(24 * scale)
      const totalW = logoBoxW + textContentW

      // --- Dark left box (rounded left corners) — DJ logo ---
      ctx.beginPath()
      ctx.moveTo(barX + radius, barY)
      ctx.lineTo(barX + logoBoxW, barY)
      ctx.lineTo(barX + logoBoxW, barY + barH)
      ctx.lineTo(barX + radius, barY + barH)
      ctx.arcTo(barX, barY + barH, barX, barY + barH - radius, radius)
      ctx.lineTo(barX, barY + radius)
      ctx.arcTo(barX, barY, barX + radius, barY, radius)
      ctx.closePath()
      ctx.fillStyle = '#161615'
      ctx.fill()

      // --- Yellow right box (rounded right corners) — thumb + text ---
      ctx.beginPath()
      ctx.moveTo(barX + logoBoxW, barY)
      ctx.lineTo(barX + totalW - radius, barY)
      ctx.arcTo(barX + totalW, barY, barX + totalW, barY + radius, radius)
      ctx.lineTo(barX + totalW, barY + barH - radius)
      ctx.arcTo(barX + totalW, barY + barH, barX + totalW - radius, barY + barH, radius)
      ctx.lineTo(barX + logoBoxW, barY + barH)
      ctx.closePath()
      ctx.fillStyle = 'rgba(245, 235, 24, 0.3)'
      ctx.fill()

      // --- DJ Logo (custom or default videoDJ logo) — size-8 (32px), centered, no stretch ---
      const logoImg = djLogoRef.current || logoImgRef.current
      if (logoImg) {
        const maxLogoSize = Math.round(36 * scale) // size-9 = 36px at 1080p
        const imgW = logoImg.naturalWidth || logoImg.width
        const imgH = logoImg.naturalHeight || logoImg.height
        const logoAspect = imgW / imgH
        let drawW: number, drawH: number
        if (logoAspect > 1) {
          drawW = maxLogoSize
          drawH = maxLogoSize / logoAspect
        } else {
          drawH = maxLogoSize
          drawW = maxLogoSize * logoAspect
        }
        const logoX = barX + (logoBoxW - drawW) / 2
        const logoY = barY + (barH - drawH) / 2
        ctx.drawImage(logoImg, logoX, logoY, drawW, drawH)
      }

      const textStartX = barX + logoBoxW + Math.round(10 * scale)

      // --- Text: Title / Artist / Year — evenly spaced ---
      ctx.textBaseline = 'middle'
      const lineSpacing = barH / (yearText ? 4 : 3)

      // Title (white, bold)
      ctx.fillStyle = '#ffffff'
      ctx.font = titleFont
      ctx.fillText(nowPlaying.title, textStartX, barY + lineSpacing)

      // Artist (with spacing from title — +2px extra gap)
      const extraGap = Math.round(2 * scale)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.font = artistFont
      ctx.fillText(nowPlaying.artist || '', textStartX, barY + lineSpacing * 2 + extraGap)

      // Year (larger, with spacing from artist)
      if (yearText) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.font = yearFont
        ctx.fillText(yearText, textStartX, barY + lineSpacing * 3 + extraGap)
      }
    }

    // Draw Twitch chat overlay (last 5 messages, right side)
    if (allChatMessages.length > 0) {
      const chatX = w - 320
      const chatW = 300
      const msgH = 22
      const recent = allChatMessages.slice(-5)
      const chatY = h - 44 - recent.length * msgH - 10

      // Semi-transparent background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.beginPath()
      ctx.roundRect(chatX - 8, chatY - 4, chatW + 16, recent.length * msgH + 8, 6)
      ctx.fill()

      for (let i = 0; i < recent.length; i++) {
        const msg = recent[i]
        const y = chatY + i * msgH + 14

        ctx.fillStyle = msg.color || '#9146FF'
        ctx.font = `bold ${Math.round(h / 65)}px system-ui, sans-serif`
        ctx.fillText(msg.username + ':', chatX, y)

        const nameWidth = ctx.measureText(msg.username + ': ').width
        ctx.fillStyle = '#ffffff'
        ctx.font = `${Math.round(h / 65)}px system-ui, sans-serif`
        const text = msg.message.length > 35 ? msg.message.slice(0, 35) + '...' : msg.message
        ctx.fillText(text, chatX + nameWidth, y)
      }
    }

    rafRef.current = requestAnimationFrame(renderFrame)
  }, [crossfader, deckARef, deckBRef, nowPlaying, cameras, allChatMessages, countdownPhase])

  // Start/stop render loop
  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderFrame)
    return () => cancelAnimationFrame(rafRef.current)
  }, [renderFrame])

  // ---------------------------------------------------------------------------
  // Camera management
  // ---------------------------------------------------------------------------
  const addCamera = useCallback(async () => {
    if (cameras.length >= 3) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      const label = stream.getVideoTracks()[0]?.label || `Camera ${cameras.length + 1}`
      const newCam: CameraFeed = {
        id: Date.now().toString(),
        stream,
        label,
        x: 70 - cameras.length * 25, // stagger position
        y: 5,
        width: 20,
      }
      setCameras(prev => [...prev, newCam])

      // Create video element for this camera
      const vid = document.createElement('video')
      vid.srcObject = stream
      vid.muted = true
      vid.playsInline = true
      vid.play()
      cameraVideosRef.current.set(newCam.id, vid)
    } catch { /* camera access denied */ }
  }, [cameras.length])

  const removeCamera = useCallback((id: string) => {
    setCameras(prev => {
      const cam = prev.find(c => c.id === id)
      if (cam) {
        cam.stream.getTracks().forEach(t => t.stop())
        const vid = cameraVideosRef.current.get(id)
        if (vid) { vid.srcObject = null; vid.remove() }
        cameraVideosRef.current.delete(id)
      }
      return prev.filter(c => c.id !== id)
    })
  }, [])

  // ---------------------------------------------------------------------------
  // Camera drag
  // ---------------------------------------------------------------------------
  const handlePreviewPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingCam || !previewRef.current) return
    const rect = previewRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setCameras(prev => prev.map(c =>
      c.id === draggingCam ? { ...c, x: Math.max(0, Math.min(80, x)), y: Math.max(0, Math.min(80, y)) } : c
    ))
  }, [draggingCam])

  // ---------------------------------------------------------------------------
  // Pop out to new window — mirrors canvas to a second canvas in the popup
  // ---------------------------------------------------------------------------
  const pipVideoRef = useRef<HTMLVideoElement | null>(null)

  const popOut = useCallback(async () => {
    if (poppedOut || !canvasRef.current) return

    // Create a video element fed by the canvas stream for PiP
    const stream = canvasRef.current.captureStream(30)
    const video = document.createElement('video')
    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;pointer-events:none'
    document.body.appendChild(video)
    pipVideoRef.current = video

    await video.play()

    try {
      await video.requestPictureInPicture()
      setPoppedOut(true)

      video.addEventListener('leavepictureinpicture', () => {
        setPoppedOut(false)
        video.pause()
        video.srcObject = null
        video.remove()
        pipVideoRef.current = null
      }, { once: true })
    } catch (e) {
      console.warn('[Stream] PiP not supported:', e)
      video.remove()
      pipVideoRef.current = null
    }
  }, [poppedOut])

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      recorderRef.current?.stop()
      setIsRecording(false)
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    const stream = canvas.captureStream(30)
    recordedChunks.current = []

    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm',
      videoBitsPerSecond: 6000000,
    })

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.current.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(recordedChunks.current, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `videodj-stream-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`
      a.click()
      URL.revokeObjectURL(url)
    }

    recorder.start(1000)
    recorderRef.current = recorder
    setIsRecording(true)
  }, [isRecording])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      cameras.forEach(c => c.stream.getTracks().forEach(t => t.stop()))
      recorderRef.current?.stop()
      popupRef.current?.close()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{
          background: '#12121e', borderRadius: 16, border: '1px solid #2a2a3e',
          width: '97vw', maxWidth: 1600, height: '94vh', maxHeight: '94vh', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 20px', borderBottom: '1px solid #1a1a2e', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 900 }}>Stream Preview</span>
            {isRecording && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 10, color: '#ef4444', fontWeight: 700,
                padding: '2px 8px', borderRadius: 4,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              }}>
                <motion.div
                  style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                REC
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Mic */}
            <button
              onClick={toggleMic}
              title={micAvailable ? (micActive ? 'Mute microphone' : 'Unmute microphone') : 'No microphone detected'}
              style={{
                fontSize: 10, fontWeight: 700, padding: '5px 12px', borderRadius: 6,
                background: micActive ? 'rgba(74,222,128,0.15)' : 'transparent',
                color: micActive ? '#4ade80' : micAvailable ? '#888' : '#444',
                border: `1px solid ${micActive ? 'rgba(74,222,128,0.3)' : '#2a2a3e'}`,
                cursor: micAvailable ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: 4,
                opacity: micAvailable ? 1 : 0.4,
              }}
            >
              <span style={{ fontSize: 12 }}>{micActive ? '🎙' : '🎙'}</span>
              {micActive ? 'ON' : 'OFF'}
            </button>
            {/* Add Camera */}
            <button
              onClick={addCamera}
              disabled={!camAvailable || cameras.length >= 3}
              title={!camAvailable ? 'No camera detected' : cameras.length >= 3 ? 'Maximum 3 cameras' : 'Add camera overlay'}
              style={{
                fontSize: 10, fontWeight: 700, padding: '5px 12px', borderRadius: 6,
                background: cameras.length > 0 ? 'rgba(74,222,128,0.15)' : camAvailable ? 'transparent' : 'transparent',
                color: cameras.length > 0 ? '#4ade80' : camAvailable ? '#888' : '#444',
                border: `1px solid ${cameras.length > 0 ? 'rgba(74,222,128,0.3)' : '#2a2a3e'}`,
                cursor: !camAvailable || cameras.length >= 3 ? 'not-allowed' : 'pointer',
                opacity: camAvailable ? 1 : 0.4,
              }}
            >
              + Camera ({cameras.length}/3)
            </button>
            {/* Pop Out */}
            <button
              onClick={popOut}
              disabled={poppedOut}
              title={poppedOut ? 'Preview is in external window' : 'Open preview in separate window'}
              onMouseEnter={e => { if (!poppedOut) { popOutIconRef.current?.startAnimation(); e.currentTarget.style.color = '#ffff00' } }}
              onMouseLeave={e => { popOutIconRef.current?.stopAnimation(); e.currentTarget.style.color = poppedOut ? '#444' : '#888' }}
              style={{
                background: 'transparent', border: 'none', padding: 4, borderRadius: 6,
                color: poppedOut ? '#444' : '#888',
                cursor: poppedOut ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
              }}
            >
              <MaximizeIcon ref={popOutIconRef} size={18} />
            </button>
            {/* Setup Guide */}
            <button
              onClick={() => setShowGuide(true)}
              title="Streaming setup guide"
              onMouseEnter={e => { guideIconRef.current?.startAnimation(); e.currentTarget.style.color = '#ffff00' }}
              onMouseLeave={e => { guideIconRef.current?.stopAnimation(); e.currentTarget.style.color = '#ffff00aa' }}
              style={{
                background: 'transparent', border: 'none', padding: 4, borderRadius: 6,
                color: '#ffff00aa', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <BookTextIcon ref={guideIconRef} size={18} />
            </button>
            {/* Minimize */}
            {onMinimize && (
              <button
                onClick={onMinimize}
                title="Minimize stream panel"
                onMouseEnter={e => { minimizeIconRef.current?.startAnimation(); e.currentTarget.style.background = 'rgba(255,255,0,0.15)'; e.currentTarget.style.color = '#ffff00' }}
                onMouseLeave={e => { minimizeIconRef.current?.stopAnimation(); e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888' }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#888', padding: 4, borderRadius: 6, transition: 'all 0.15s' }}
              >
                <MinimizeIcon ref={minimizeIconRef} size={18} />
              </button>
            )}
            {/* Close */}
            <button
              onClick={onClose}
              onMouseEnter={e => { closeIconRef.current?.startAnimation(); e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#ef4444' }}
              onMouseLeave={e => { closeIconRef.current?.stopAnimation(); e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#555570' }}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#555570', padding: 4, borderRadius: 6, transition: 'all 0.15s' }}
            >
              <XIcon ref={closeIconRef} size={18} />
            </button>
          </div>
        </div>

        {/* Stream Setup Bar — hidden when live */}
        {localStorage.getItem('twitch_token') && !isLive && (
          <div style={{
            padding: '8px 20px', borderBottom: '1px solid #1a1a2e', flexShrink: 0,
            display: 'flex', gap: 10, alignItems: 'flex-end', background: '#0d0d16',
          }}>
            {/* Stream Title */}
            <div style={{ flex: 2, minWidth: 0 }}>
              <label style={{ fontSize: 7, color: '#555570', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>STREAM TITLE</label>
              <input
                value={streamTitle}
                onChange={e => setStreamTitle(e.target.value)}
                placeholder="My DJ Stream"
                style={{
                  width: '100%', height: 28, background: '#14141f', border: '1px solid #2a2a3e',
                  borderRadius: 6, padding: '0 8px', color: '#e0e0f0', fontSize: 11, outline: 'none',
                }}
              />
            </div>

            {/* Category */}
            <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
              <label style={{ fontSize: 7, color: '#555570', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>CATEGORY</label>
              <input
                value={categoryQuery || selectedCategory?.name || ''}
                onChange={e => { searchCategories(e.target.value); setSelectedCategory(null) }}
                placeholder="Search category..."
                style={{
                  width: '100%', height: 28, background: '#14141f', border: `1px solid ${selectedCategory ? 'rgba(145,70,255,0.4)' : '#2a2a3e'}`,
                  borderRadius: 6, padding: '0 8px', color: selectedCategory ? '#9146FF' : '#e0e0f0', fontSize: 11, outline: 'none',
                  fontWeight: selectedCategory ? 700 : 400,
                }}
              />
              {categories.length > 0 && !selectedCategory && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                  background: '#14141f', border: '1px solid #2a2a3e', borderRadius: 6,
                  maxHeight: 150, overflowY: 'auto', marginTop: 2,
                }}>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => { setSelectedCategory({ id: cat.id, name: cat.name }); setCategories([]); setCategoryQuery('') }}
                      style={{
                        display: 'block', width: '100%', padding: '6px 8px', border: 'none',
                        background: 'transparent', color: '#ccc', fontSize: 11, textAlign: 'left',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(145,70,255,0.1)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tags */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={{ fontSize: 7, color: '#555570', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>TAGS</label>
              <input
                value={streamTags}
                onChange={e => setStreamTags(e.target.value)}
                placeholder="DJ, Music, Live"
                style={{
                  width: '100%', height: 28, background: '#14141f', border: '1px solid #2a2a3e',
                  borderRadius: 6, padding: '0 8px', color: '#e0e0f0', fontSize: 11, outline: 'none',
                }}
              />
            </div>

            {/* Stream Key (manual entry if not auto-fetched) */}
            {!localStorage.getItem('twitch_stream_key') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                <label style={{ fontSize: 7, color: '#555570', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>STREAM KEY</label>
                <input
                  type="password"
                  placeholder="Paste stream key..."
                  onBlur={e => { if (e.target.value) localStorage.setItem('twitch_stream_key', e.target.value) }}
                  style={{
                    width: 140, padding: '4px 8px', borderRadius: 4, fontSize: 10,
                    background: '#0d0d16', border: '1px solid #2a2a3e', color: '#e0e0f0',
                    outline: 'none',
                  }}
                />
              </div>
            )}

            {/* GO LIVE button — opens launch dialog */}
            <button
              onClick={() => setShowLaunchDialog(true)}
              style={{
                fontSize: 11, fontWeight: 900, padding: '6px 24px', borderRadius: 6,
                background: '#4ade80', color: '#000',
                border: 'none', cursor: 'pointer',
                letterSpacing: 0.5, flexShrink: 0,
              }}
            >
              GO LIVE
            </button>
          </div>
        )}

        {/* Live Info Bar — shown only when live */}
        {isLive && (
          <div style={{
            padding: '6px 20px', borderBottom: '1px solid #1a1a2e', flexShrink: 0,
            display: 'flex', gap: 12, alignItems: 'center', background: '#0d0d16',
          }}>
            {/* Live indicator + timer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s ease-in-out infinite' }} />
              <span style={{ fontSize: 11, fontWeight: 900, color: '#ef4444', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>
                {String(Math.floor(streamElapsed / 3600)).padStart(2, '0')}:{String(Math.floor((streamElapsed % 3600) / 60)).padStart(2, '0')}:{String(streamElapsed % 60).padStart(2, '0')}
              </span>
            </div>

            {/* Active destinations */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {launchTwitch && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(145,70,255,0.15)', color: '#9146FF', border: '1px solid rgba(145,70,255,0.3)' }}>
                  TWITCH
                </span>
              )}
              {isRecording && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                  REC
                </span>
              )}
            </div>

            {/* Now playing in chat toggle */}
            <button
              onClick={() => setAutoNowPlaying(!autoNowPlaying)}
              title="Auto-announce current track in Twitch chat"
              style={{
                fontSize: 8, fontWeight: 800, padding: '3px 8px', borderRadius: 4,
                background: autoNowPlaying ? 'rgba(74,222,128,0.15)' : 'transparent',
                color: autoNowPlaying ? '#4ade80' : '#555',
                border: `1px solid ${autoNowPlaying ? 'rgba(74,222,128,0.3)' : '#2a2a3e'}`,
                cursor: 'pointer',
              }}
            >
              CHAT: {autoNowPlaying ? 'AUTO' : 'OFF'}
            </button>

            {/* Now playing track */}
            {nowPlaying && (
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: '#555570' }}>♫</span>
                <span style={{ fontSize: 10, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nowPlaying.artist} — {nowPlaying.title}
                </span>
              </div>
            )}

            <div style={{ flex: 1 }} />

            {/* END STREAM */}
            <button
              onClick={() => { stopStream(); if (isRecording) toggleRecording() }}
              style={{
                fontSize: 11, fontWeight: 900, padding: '5px 20px', borderRadius: 6,
                background: '#ef4444', color: '#fff',
                border: 'none', cursor: 'pointer', letterSpacing: 0.5,
              }}
            >
              END STREAM
            </button>
          </div>
        )}

        {/* Stream error */}
        {streamError && (
          <div style={{ padding: '6px 20px', background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.2)', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: '#ef4444' }}>{streamError}</span>
          </div>
        )}

        {/* Launch Dialog — select destinations before going live */}
        {showLaunchDialog && (
          <div
            onClick={e => { if (e.target === e.currentTarget) setShowLaunchDialog(false) }}
            style={{
              position: 'absolute', inset: 0, zIndex: 100,
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div style={{
              background: '#12121e', border: '1px solid #2a2a3e', borderRadius: 16,
              padding: '28px 32px', width: 340, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 4px', color: '#e0e0f0' }}>Start Streaming</h3>
              <p style={{ fontSize: 10, color: '#555570', margin: '0 0 20px' }}>Select where to send your stream</p>

              {/* Twitch toggle */}
              <button
                onClick={() => setLaunchTwitch(!launchTwitch)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                  background: launchTwitch ? 'rgba(145,70,255,0.08)' : '#14141f',
                  border: `1.5px solid ${launchTwitch ? 'rgba(145,70,255,0.4)' : '#2a2a3e'}`,
                  marginBottom: 8, transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 4,
                  background: launchTwitch ? '#9146FF' : '#1a1a2e',
                  border: `1.5px solid ${launchTwitch ? '#9146FF' : '#3a3a4e'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 11, fontWeight: 900, transition: 'all 0.15s',
                }}>
                  {launchTwitch && '✓'}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: launchTwitch ? '#9146FF' : '#888' }}>Twitch</div>
                  <div style={{ fontSize: 9, color: '#555570' }}>Stream live to your channel</div>
                </div>
              </button>

              {/* Record toggle */}
              <button
                onClick={() => setLaunchRecord(!launchRecord)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                  background: launchRecord ? 'rgba(255,255,0,0.05)' : '#14141f',
                  border: `1.5px solid ${launchRecord ? 'rgba(255,255,0,0.3)' : '#2a2a3e'}`,
                  marginBottom: 20, transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 4,
                  background: launchRecord ? '#ffff00' : '#1a1a2e',
                  border: `1.5px solid ${launchRecord ? '#ffff00' : '#3a3a4e'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#000', fontSize: 11, fontWeight: 900, transition: 'all 0.15s',
                }}>
                  {launchRecord && '✓'}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: launchRecord ? '#ffff00' : '#888' }}>Record</div>
                  <div style={{ fontSize: 9, color: '#555570' }}>Save locally for YouTube / Rumble</div>
                </div>
              </button>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowLaunchDialog(false)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8,
                    background: 'transparent', border: '1px solid #2a2a3e',
                    color: '#888', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setShowLaunchDialog(false)
                    // Update channel info first
                    await updateChannel()
                    // Start stream if Twitch selected
                    if (launchTwitch) await startStream()
                    // Start recording if selected
                    if (launchRecord) toggleRecording()
                    // If neither, still start recording (must do something)
                    if (!launchTwitch && !launchRecord) toggleRecording()
                  }}
                  disabled={!launchTwitch && !launchRecord}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8,
                    background: (!launchTwitch && !launchRecord) ? '#1a1a2e' : '#4ade80',
                    border: 'none',
                    color: (!launchTwitch && !launchRecord) ? '#444' : '#000',
                    fontSize: 11, fontWeight: 900, cursor: (!launchTwitch && !launchRecord) ? 'not-allowed' : 'pointer',
                    letterSpacing: 0.5,
                  }}
                >
                  Start
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Preview area */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Main preview */}
          <div
            ref={previewRef}
            onPointerMove={handlePreviewPointerMove}
            onPointerUp={() => setDraggingCam(null)}
            style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden' }}
          >
            {!poppedOut && (
              <canvas
                ref={canvasRef}
                width={1920}
                height={1080}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            )}
            {poppedOut && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555570', fontSize: 14 }}>
                Preview is in external window
              </div>
            )}

            {/* Camera drag handles (overlay) */}
            {!poppedOut && cameras.map(cam => (
              <div
                key={cam.id}
                onPointerDown={() => setDraggingCam(cam.id)}
                style={{
                  position: 'absolute',
                  left: `${cam.x}%`, top: `${cam.y}%`,
                  width: `${cam.width}%`, aspectRatio: '16/9',
                  cursor: 'grab', border: '2px solid rgba(255,255,0,0.5)', borderRadius: 4,
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                  padding: 4,
                }}
              >
                <span style={{ fontSize: 8, color: '#ffff00', background: 'rgba(0,0,0,0.6)', padding: '1px 4px', borderRadius: 2 }}>
                  {cam.label.slice(0, 20)}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeCamera(cam.id) }}
                  style={{ background: 'rgba(239,68,68,0.8)', border: 'none', borderRadius: 2, color: '#fff', fontSize: 8, cursor: 'pointer', padding: '1px 4px' }}
                >
                  X
                </button>
              </div>
            ))}
          </div>

          {/* Twitch chat sidebar */}
          <div style={{
            width: 280, flexShrink: 0, borderLeft: '1px solid #1a1a2e',
            display: 'flex', flexDirection: 'column', background: '#0d0d16',
          }}>
            <div style={{
              padding: '8px 12px', borderBottom: '1px solid #1a1a2e',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#9146FF', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>
                TWITCH CHAT
              </span>
              {!localStorage.getItem('twitch_token') ? (
                <button
                  onClick={() => window.location.href = '/api/twitch?action=login'}
                  style={{
                    fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: 4,
                    background: '#9146FF', color: '#fff', border: 'none', cursor: 'pointer',
                  }}
                >
                  Connect
                </button>
              ) : (
                <span style={{ fontSize: 9, color: '#4ade80', fontWeight: 600 }}>
                  {localStorage.getItem('twitch_username') || 'Connected'}
                </span>
              )}
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {!localStorage.getItem('twitch_token') ? (
                <div style={{ padding: '16px 0', textAlign: 'center' }}>
                  <p style={{ fontSize: 11, color: '#888', lineHeight: 1.5, margin: '0 0 12px' }}>
                    Connect your Twitch account in Settings to enable chat.
                  </p>
                  <p style={{ fontSize: 10, color: '#555' }}>
                    Settings &rarr; Twitch Streaming &rarr; Connect
                  </p>
                </div>
              ) : allChatMessages.length === 0 ? (
                <span style={{ color: '#333', fontSize: 11 }}>No chat messages yet...</span>
              ) : (
                allChatMessages.map((msg, i) => (
                  <div key={i} style={{ fontSize: 11, lineHeight: 1.4 }}>
                    <span style={{ color: msg.color || '#9146FF', fontWeight: 700 }}>{msg.username}</span>
                    <span style={{ color: '#888' }}>: {msg.message}</span>
                  </div>
                ))
              )}
            </div>

            {/* Chat input */}
            {localStorage.getItem('twitch_token') && (
              <div style={{ padding: '6px 12px', borderTop: '1px solid #1a1a2e', flexShrink: 0 }}>
                <form onSubmit={(e) => {
                  e.preventDefault()
                  const input = (e.target as HTMLFormElement).elements.namedItem('chatMsg') as HTMLInputElement
                  const msg = input.value.trim()
                  if (!msg || !chatClientRef.current) return
                  const sent = chatClientRef.current.sendMessage(msg)
                  if (sent) {
                    // Add own message to chat
                    setChatMessages(prev => [...prev.slice(-50), {
                      username: localStorage.getItem('twitch_username') || 'You',
                      message: msg,
                      color: '#ffff00',
                    }])
                    input.value = ''
                  }
                }} style={{ display: 'flex', gap: 4 }}>
                  <input
                    name="chatMsg"
                    placeholder="Send a message..."
                    style={{
                      flex: 1, height: 28, background: '#14141f', border: '1px solid #2a2a3e',
                      borderRadius: 6, padding: '0 8px', color: '#e0e0f0', fontSize: 11, outline: 'none',
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = 'rgba(145,70,255,0.4)'}
                    onBlur={e => e.currentTarget.style.borderColor = '#2a2a3e'}
                  />
                  <button type="submit" style={{
                    padding: '0 10px', borderRadius: 6, border: 'none',
                    background: '#9146FF', color: '#fff', fontSize: 10, fontWeight: 700,
                    cursor: 'pointer',
                  }}>
                    Chat
                  </button>
                </form>
              </div>
            )}

            {/* Schedule section */}
            {localStorage.getItem('twitch_token') && (
              <div style={{ borderTop: '1px solid #1a1a2e', padding: '8px 12px', flexShrink: 0 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#9146FF', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>
                  SCHEDULE
                </span>

                {/* Upcoming streams */}
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {schedule.length === 0 && (
                    <span style={{ fontSize: 10, color: '#444' }}>No upcoming streams</span>
                  )}
                  {schedule.slice(0, 5).map(seg => (
                    <div key={seg.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#ccc' }}>{seg.title}</div>
                        <div style={{ fontSize: 8, color: '#555570', fontFamily: 'var(--font-mono)' }}>
                          {new Date(seg.start_time).toLocaleDateString()} · {new Date(seg.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {seg.duration && ` · ${Number(seg.duration) >= 60 ? `${Math.floor(Number(seg.duration) / 60)}hr` : `${seg.duration}min`}`}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteScheduleSegment(seg.id)}
                        style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 10, padding: 2 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add new schedule */}
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <input
                    value={newScheduleTitle}
                    onChange={e => setNewScheduleTitle(e.target.value)}
                    placeholder="Stream title"
                    style={{
                      width: '100%', height: 24, background: '#14141f', border: '1px solid #2a2a3e',
                      borderRadius: 4, padding: '0 6px', color: '#ccc', fontSize: 10, outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      type="date"
                      value={newScheduleDate}
                      onChange={e => setNewScheduleDate(e.target.value)}
                      style={{
                        flex: 1, height: 24, background: '#14141f', border: '1px solid #2a2a3e',
                        borderRadius: 4, padding: '0 4px', color: '#ccc', fontSize: 10, outline: 'none',
                        colorScheme: 'dark',
                      }}
                    />
                    <input
                      type="time"
                      value={newScheduleTime}
                      onChange={e => setNewScheduleTime(e.target.value)}
                      style={{
                        width: 60, height: 24, background: '#14141f', border: '1px solid #2a2a3e',
                        borderRadius: 4, padding: '0 4px', color: '#ccc', fontSize: 10, outline: 'none',
                        colorScheme: 'dark',
                      }}
                    />
                    <select
                      value={newScheduleDuration}
                      onChange={e => setNewScheduleDuration(e.target.value)}
                      style={{
                        width: 62, height: 24, background: '#14141f', border: '1px solid #2a2a3e',
                        borderRadius: 4, padding: '0 2px', color: '#ccc', fontSize: 10, outline: 'none',
                        colorScheme: 'dark',
                      }}
                    >
                      <option value="60">1hr</option>
                      <option value="120">2hr</option>
                      <option value="180">3hr</option>
                      <option value="240">4hr</option>
                      <option value="360">6hr</option>
                      <option value="480">8hr</option>
                    </select>
                  </div>
                  {/* Countdown selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <label style={{ fontSize: 8, color: '#555570', fontWeight: 700, whiteSpace: 'nowrap' }}>INTRO</label>
                    <select
                      value={selectedCountdownId}
                      onChange={e => {
                        setSelectedCountdownId(e.target.value)
                        if (e.target.value === 'default') {
                          localStorage.removeItem('dj_countdown_active_id')
                          localStorage.removeItem('dj_countdown_video')
                        } else {
                          localStorage.setItem('dj_countdown_active_id', e.target.value)
                        }
                      }}
                      style={{
                        flex: 1, height: 24, background: '#14141f', border: '1px solid #2a2a3e',
                        borderRadius: 4, padding: '0 4px', color: '#ccc', fontSize: 10, outline: 'none',
                        colorScheme: 'dark',
                      }}
                    >
                      <option value="default">Default Countdown</option>
                      {countdownList.map(cd => (
                        <option key={cd.id} value={cd.id}>{cd.name}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={createSchedule}
                    disabled={!newScheduleDate}
                    style={{
                      fontSize: 9, fontWeight: 700, padding: '4px 0', borderRadius: 4,
                      background: newScheduleDate ? '#9146FF' : '#1a1a2e',
                      color: newScheduleDate ? '#fff' : '#444',
                      border: 'none', cursor: newScheduleDate ? 'pointer' : 'not-allowed',
                    }}
                  >
                    + Add to Schedule
                  </button>
                  {scheduleError && (
                    <p style={{ fontSize: 9, color: '#ef4444', margin: '4px 0 0', lineHeight: 1.4 }}>{scheduleError}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Streaming Setup Guide Modal */}
      {showGuide && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => setShowGuide(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
            onClick={e => e.stopPropagation()}
            style={{
              background: '#12121e', border: '1px solid #2a2a3e', borderRadius: 16,
              width: 600, maxWidth: '95vw', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            {/* Guide Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '16px 20px', borderBottom: '1px solid #1a1a2e', flexShrink: 0,
            }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#ffff00' }}>📖</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#e0e0f0' }}>videoDJ.Studio Guide</span>
                <span style={{ fontSize: 9, color: '#555570', marginLeft: 8, fontFamily: 'var(--font-mono)' }}>Everything you need to know</span>
              </div>
              <button
                onClick={() => setShowGuide(false)}
                onMouseEnter={() => guideCloseIconRef.current?.startAnimation()}
                onMouseLeave={() => guideCloseIconRef.current?.stopAnimation()}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555570', padding: 4 }}
              >
                <XIcon ref={guideCloseIconRef} size={16} />
              </button>
            </div>

            {/* Guide Content — scrollable */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              <style>{`.guide-section{margin-bottom:20px}.guide-section h3{font-size:13px;font-weight:800;color:#ffff00;margin:0 0 8px;letter-spacing:0.5px}.guide-section h4{font-size:11px;font-weight:700;color:#e0e0f0;margin:12px 0 4px}.guide-section p,.guide-section li{font-size:11px;color:#888;line-height:1.7;margin:0 0 4px}.guide-section ol,.guide-section ul{padding-left:18px;margin:0 0 8px}.guide-section code{background:#1a1a2e;padding:1px 5px;border-radius:3px;font-size:10px;color:#ffff00;font-family:var(--font-mono)}.guide-step{background:#0d0d16;border:1px solid #1a1a2e;border-radius:8px;padding:12px;margin-bottom:8px}.guide-tip{background:rgba(255,255,0,0.04);border:1px solid rgba(255,255,0,0.15);border-radius:6px;padding:8px 10px;margin:8px 0;font-size:10px;color:#ccc;line-height:1.6}`}</style>

              {/* ── WHAT IS THIS? ─────────────────── */}
              <div className="guide-section">
                <h3>What is videoDJ.Studio?</h3>
                <p>videoDJ.Studio lets you mix music videos like a real DJ — two decks, crossfader, effects — and stream it live to Twitch, or record it to upload to YouTube/Rumble later.</p>
              </div>

              {/* ── THE BUTTONS ─────────────────── */}
              <div className="guide-section">
                <h3>What Every Button Does</h3>
                <div className="guide-step">
                  <h4>🎙 Mic (ON / OFF)</h4>
                  <p>Turns your microphone on or off. When <strong>green</strong>, your mic is live and viewers can hear you talk. When <strong>grey</strong>, you're muted. If it's dimmed, no microphone was detected on your computer.</p>

                  <h4>+ Camera (0/3)</h4>
                  <p>Adds your webcam as an overlay on the stream. You can add up to 3 cameras. Drag the camera box to move it around on the preview. Click the red X on a camera to remove it.</p>

                  <h4>Pop Out (⤢ icon)</h4>
                  <p>Opens the stream preview in a separate window so you can keep it visible while DJing in the main app. Hover over it to see what it does.</p>

                  <h4>Guide (📖 icon)</h4>
                  <p>You're reading it right now! This guide explains everything.</p>

                  <h4>— (minimize icon)</h4>
                  <p>Hides the stream panel but keeps everything running. Your stream stays live! A small <strong>STREAM</strong> button appears in the playlist bar to reopen it.</p>

                  <h4>✕ (close icon)</h4>
                  <p>Closes the stream panel and <strong>stops your stream</strong>. Only click this when you're done streaming.</p>
                </div>
              </div>

              {/* ── BEFORE YOU GO LIVE ─────────────────── */}
              <div className="guide-section">
                <h3>Before You Go Live</h3>
                <div className="guide-step">
                  <h4>Stream Title</h4>
                  <p>Type what you want viewers to see as your stream title on Twitch. Example: <code>DJ Bodhi — 80s Rock Night</code></p>

                  <h4>Category</h4>
                  <p>Start typing to search for a Twitch category. Pick one like <strong>Music</strong> or <strong>DJ</strong>. This helps viewers find your stream.</p>

                  <h4>Tags</h4>
                  <p>Add tags separated by commas. Example: <code>DJ, Music, Rock, 80s, Live</code></p>

                  <div className="guide-tip">💡 Your title, category, and tags are automatically sent to Twitch when you click Start — no need to press anything extra!</div>
                </div>
              </div>

              {/* ── GOING LIVE ─────────────────── */}
              <div className="guide-section">
                <h3>Going Live</h3>
                <div className="guide-step">
                  <ol>
                    <li>Load a song onto a deck and press play</li>
                    <li>Click the green <strong>GO LIVE</strong> button</li>
                    <li>A popup appears — choose what you want to do:</li>
                  </ol>

                  <h4>Twitch (toggle)</h4>
                  <p>Turn this ON to stream live to your Twitch channel. Your viewers see your music videos, crossfades, and overlays in real-time.</p>

                  <h4>Record (toggle)</h4>
                  <p>Turn this ON to save a local copy of your stream as a video file. When you stop, it downloads as a <code>.webm</code> file. Upload it to YouTube, Rumble, or anywhere you want.</p>

                  <div className="guide-tip">💡 You can enable both at the same time — stream to Twitch AND record locally!</div>
                  <div className="guide-tip">💡 You can also enable only Record — perfect for making a video to upload later without going live.</div>

                  <p>Click <strong>Start</strong> to begin. Click <strong>Cancel</strong> to go back.</p>
                </div>
              </div>

              {/* ── WHILE LIVE ─────────────────── */}
              <div className="guide-section">
                <h3>While You&apos;re Live</h3>
                <div className="guide-step">
                  <p>The setup bar hides and a <strong>live info bar</strong> appears showing:</p>
                  <ul>
                    <li><strong>Red dot + timer</strong> — how long you've been live (HH:MM:SS)</li>
                    <li><strong>TWITCH / REC badges</strong> — which destinations are active</li>
                    <li><strong>CHAT: AUTO/OFF</strong> — toggle this to auto-post the current song in Twitch chat</li>
                    <li><strong>Current track</strong> — shows what's playing right now</li>
                  </ul>

                  <h4>CHAT: AUTO</h4>
                  <p>When ON, every time a new song starts playing, a message is posted in your Twitch chat:<br/><code>🎵 Now Playing: Artist — Title</code><br/>Your viewers always know what's playing!</p>

                  <h4>Twitch Chat</h4>
                  <p>Messages from your viewers appear in the sidebar. Type in the input box at the bottom and click <strong>Chat</strong> to reply — no need to switch to the Twitch website!</p>

                  <h4>END STREAM</h4>
                  <p>Click the red <strong>END STREAM</strong> button to stop everything. If you were recording, the file downloads automatically.</p>
                </div>
              </div>

              {/* ── COUNTDOWN ─────────────────── */}
              <div className="guide-section">
                <h3>Countdown Intro</h3>
                <div className="guide-step">
                  <p>When you go live, a <strong>countdown video</strong> plays first — this gives your viewers a "starting soon" moment before the music kicks in.</p>
                  <p>During the last <strong>2 seconds</strong> of the countdown, it smoothly crossfades into your first track.</p>

                  <h4>Using different countdowns</h4>
                  <p>Go to <strong>Settings → Stream</strong> to upload custom countdown videos (holiday themes, special events, etc.). In the <strong>Schedule</strong> sidebar, pick which countdown to use with the <strong>INTRO</strong> dropdown.</p>
                </div>
              </div>

              {/* ── SCHEDULE ─────────────────── */}
              <div className="guide-section">
                <h3>Schedule</h3>
                <div className="guide-step">
                  <p>In the right sidebar under <strong>SCHEDULE</strong>:</p>
                  <ol>
                    <li>Type a stream title (e.g. "Friday Night Mix")</li>
                    <li>Pick a date and time</li>
                    <li>Choose a duration (1hr — 8hr)</li>
                    <li>Select your countdown intro</li>
                    <li>Click <strong>+ Add to Schedule</strong></li>
                  </ol>
                  <p>Scheduled streams are saved locally and appear in the list. Click the <strong>×</strong> to remove one.</p>
                </div>
              </div>

              {/* ── NOW PLAYING OVERLAY ─────────────────── */}
              <div className="guide-section">
                <h3>Now Playing Overlay</h3>
                <div className="guide-step">
                  <p>Viewers see a small bar at the bottom-left of the stream showing:</p>
                  <ul>
                    <li>Your DJ logo (upload one in <strong>Settings → Stream</strong>)</li>
                    <li>Song title, artist name, and release year</li>
                  </ul>
                  <p>It updates automatically every time a new track starts.</p>
                </div>
              </div>

              {/* ── FIRST TIME SETUP ─────────────────── */}
              <div className="guide-section">
                <h3>First Time Setup (Twitch)</h3>
                <div className="guide-step">
                  <h4>1. Install FFmpeg</h4>
                  <p>Open Terminal and run: <code>brew install ffmpeg</code></p>
                  <p>This is the tool that sends your video to Twitch. You only need to do this once.</p>

                  <h4>2. Create a Twitch App</h4>
                  <ol>
                    <li>Go to <strong>dev.twitch.tv/console/apps</strong></li>
                    <li>Click <strong>"Register Your Application"</strong></li>
                    <li>Name: <code>videoDJ.Studio</code></li>
                    <li>OAuth Redirect URL: <code>{`${process.env.NEXT_PUBLIC_BASE_URL || 'https://app.videodj.studio'}/api/twitch`}</code></li>
                    <li>Category: <strong>Application Integration</strong></li>
                    <li>Click <strong>"Create"</strong>, then click <strong>"Manage"</strong></li>
                    <li>Copy the <strong>Client ID</strong> and generate a <strong>Client Secret</strong></li>
                  </ol>

                  <h4>3. Connect in Settings</h4>
                  <ol>
                    <li>Open <strong>Settings</strong> → <strong>Twitch</strong> tab</li>
                    <li>Paste your <strong>Client ID</strong> and <strong>Client Secret</strong></li>
                    <li>Click <strong>"Connect with Twitch"</strong></li>
                    <li>Authorize the app on the Twitch page that opens</li>
                    <li>You'll see your Twitch username in green — you're connected!</li>
                  </ol>

                  <h4>4. Get your Stream Key</h4>
                  <p>Go to <strong>Twitch Dashboard → Settings → Stream</strong> and copy your <strong>Stream Key</strong>. Paste it in the <strong>STREAM KEY</strong> field in the stream setup bar (only shows if not auto-detected).</p>
                </div>
              </div>

              {/* ── TROUBLESHOOTING ─────────────────── */}
              <div className="guide-section">
                <h3>Something Not Working?</h3>
                <div className="guide-step">
                  <h4>Twitch says I'm offline but the app says I'm live?</h4>
                  <p>Make sure the stream server is running. Check your terminal for <code>[Stream]</code> messages. Try stopping and going live again.</p>

                  <h4>Can't connect to Twitch?</h4>
                  <p>Double-check your Client ID and Client Secret in Settings. The redirect URL must match your domain exactly (e.g. <code>https://app.videodj.studio/api/twitch</code>)</p>

                  <h4>No sound on stream?</h4>
                  <p>Make sure a track is playing on one of the decks before going live. The stream captures audio from both decks.</p>

                  <h4>Chat messages not showing?</h4>
                  <p>Disconnect and reconnect Twitch in Settings to refresh your token.</p>

                  <h4>CHAT: AUTO not posting?</h4>
                  <p>You must be live AND have CHAT set to AUTO. Also make sure a track is actually playing — it only posts when a <em>new</em> track starts.</p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Helper: draw video covering canvas (cover fit)
// ---------------------------------------------------------------------------

function drawVideoCover(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, canvasW: number, canvasH: number) {
  const vw = video.videoWidth || canvasW
  const vh = video.videoHeight || canvasH
  const videoAspect = vw / vh
  const canvasAspect = canvasW / canvasH

  let sx = 0, sy = 0, sw = vw, sh = vh
  if (videoAspect > canvasAspect) {
    sw = vh * canvasAspect
    sx = (vw - sw) / 2
  } else {
    sh = vw / canvasAspect
    sy = (vh - sh) / 2
  }

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvasW, canvasH)
}
