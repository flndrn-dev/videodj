'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
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
  deckARef: React.RefObject<DeckPanelHandle | null>
  deckBRef: React.RefObject<DeckPanelHandle | null>
  crossfader: number
  nowPlaying: { title: string; artist: string } | null
  twitchMessages?: { username: string; message: string; color: string }[]
}

// ---------------------------------------------------------------------------
// Stream Preview
// ---------------------------------------------------------------------------

export function StreamPreview({ onClose, deckARef, deckBRef, crossfader, nowPlaying, twitchMessages = [] }: StreamPreviewProps) {
  const [cameras, setCameras] = useState<CameraFeed[]>([])
  const [draggingCam, setDraggingCam] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [poppedOut, setPoppedOut] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cameraVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const rafRef = useRef(0)
  const popupRef = useRef<Window | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunks = useRef<Blob[]>([])

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

    // Draw the active deck's video (crossfade blend)
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

    // Draw Now Playing bar at bottom
    if (nowPlaying) {
      const barH = 44
      const barY = h - barH

      // Background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
      ctx.fillRect(0, barY, w, barH)

      // Yellow accent line
      ctx.fillStyle = '#ffff00'
      ctx.fillRect(0, barY, w, 2)

      // Logo text
      ctx.fillStyle = '#ffff00'
      ctx.font = `bold ${Math.round(h / 60)}px system-ui, sans-serif`
      ctx.textBaseline = 'middle'
      ctx.fillText('videoDJ.Studio', 12, barY + barH / 2)

      // Title + Artist
      ctx.fillStyle = '#ffffff'
      ctx.font = `bold ${Math.round(h / 50)}px system-ui, sans-serif`
      const titleX = 160
      ctx.fillText(nowPlaying.title, titleX, barY + barH / 2 - 8)

      ctx.fillStyle = '#aaaaaa'
      ctx.font = `${Math.round(h / 60)}px system-ui, sans-serif`
      ctx.fillText(nowPlaying.artist || '', titleX, barY + barH / 2 + 10)
    }

    // Draw Twitch chat overlay (last 5 messages, right side)
    if (twitchMessages.length > 0) {
      const chatX = w - 320
      const chatW = 300
      const msgH = 22
      const recent = twitchMessages.slice(-5)
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
  }, [crossfader, deckARef, deckBRef, nowPlaying, cameras, twitchMessages])

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
  // Pop out to new window
  // ---------------------------------------------------------------------------
  const popOut = useCallback(() => {
    if (poppedOut || !canvasRef.current) return
    const popup = window.open('', 'StreamPreview', 'width=1920,height=1080,menubar=no,toolbar=no')
    if (!popup) return
    popupRef.current = popup

    popup.document.title = 'videoDJ.Studio — Stream Preview'
    popup.document.body.style.cssText = 'margin:0;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center;height:100vh'

    // Move canvas to popup
    const canvas = canvasRef.current
    popup.document.body.appendChild(canvas)
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.objectFit = 'contain'

    setPoppedOut(true)

    popup.onbeforeunload = () => {
      // Move canvas back
      if (previewRef.current && canvas) {
        previewRef.current.prepend(canvas)
        canvas.style.width = '100%'
        canvas.style.height = '100%'
      }
      setPoppedOut(false)
      popupRef.current = null
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
          width: '95vw', maxWidth: 1400, maxHeight: '92vh', overflow: 'hidden',
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
            {/* Add Camera */}
            <button
              onClick={addCamera}
              disabled={cameras.length >= 3}
              style={{
                fontSize: 10, fontWeight: 700, padding: '5px 12px', borderRadius: 6,
                background: cameras.length >= 3 ? '#1a1a2e' : 'rgba(255,255,0,0.1)',
                color: cameras.length >= 3 ? '#444' : '#ffff00',
                border: `1px solid ${cameras.length >= 3 ? '#1a1a2e' : 'rgba(255,255,0,0.3)'}`,
                cursor: cameras.length >= 3 ? 'not-allowed' : 'pointer',
              }}
            >
              + Camera ({cameras.length}/3)
            </button>
            {/* Record */}
            <button
              onClick={toggleRecording}
              style={{
                fontSize: 10, fontWeight: 700, padding: '5px 12px', borderRadius: 6,
                background: isRecording ? 'rgba(239,68,68,0.15)' : 'transparent',
                color: isRecording ? '#ef4444' : '#888',
                border: `1px solid ${isRecording ? 'rgba(239,68,68,0.3)' : '#2a2a3e'}`,
                cursor: 'pointer',
              }}
            >
              {isRecording ? 'Stop Rec' : 'Record'}
            </button>
            {/* Pop Out */}
            <button
              onClick={popOut}
              disabled={poppedOut}
              style={{
                fontSize: 10, fontWeight: 700, padding: '5px 12px', borderRadius: 6,
                background: poppedOut ? '#1a1a2e' : 'transparent',
                color: poppedOut ? '#444' : '#888',
                border: '1px solid #2a2a3e', cursor: poppedOut ? 'not-allowed' : 'pointer',
              }}
            >
              {poppedOut ? 'Popped Out' : 'Pop Out'}
            </button>
            {/* Close */}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555570', padding: 4 }}>
              <X size={18} />
            </button>
          </div>
        </div>

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
              fontSize: 10, fontWeight: 700, color: '#9146FF',
              fontFamily: 'var(--font-mono)', letterSpacing: 1,
            }}>
              TWITCH CHAT
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {twitchMessages.length === 0 ? (
                <span style={{ color: '#333', fontSize: 11 }}>No chat messages yet...</span>
              ) : (
                twitchMessages.map((msg, i) => (
                  <div key={i} style={{ fontSize: 11, lineHeight: 1.4 }}>
                    <span style={{ color: msg.color || '#9146FF', fontWeight: 700 }}>{msg.username}</span>
                    <span style={{ color: '#888' }}>: {msg.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </motion.div>
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
