'use client'
import { useRef, useEffect, useState, useCallback } from 'react'

interface WaveformProps {
  videoUrl?: string
  currentTime: number
  duration: number
  playing: boolean
  accent: string
  onSeek: (time: number) => void
}

/**
 * Waveform visualization — shows static peaks extracted from audio data,
 * with a live bounce effect simulated from playback progress.
 * Does NOT connect to the video element's audio (avoids MediaElementSource issues).
 */
export function Waveform({ videoUrl, currentTime, duration, playing, accent, onSeek }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const rafRef = useRef<number>(0)
  const staticPeaksRef = useRef<number[]>([])
  const bounceRef = useRef(0) // animated bounce value

  // Measure container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width))
      setHeight(Math.floor(entry.contentRect.height))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Extract static waveform peaks from audio
  useEffect(() => {
    if (!videoUrl || width === 0) return
    let cancelled = false
    const numBars = Math.floor(width / 3)

    async function extract() {
      try {
        const response = await fetch(videoUrl!)
        const arrayBuffer = await response.arrayBuffer()
        const ctx = new AudioContext()
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
        const channelData = audioBuffer.getChannelData(0)
        const samplesPerBar = Math.floor(channelData.length / numBars)
        const peaks: number[] = []

        for (let i = 0; i < numBars; i++) {
          const start = i * samplesPerBar
          const end = Math.min(start + samplesPerBar, channelData.length)
          let max = 0
          for (let j = start; j < end; j++) {
            const abs = Math.abs(channelData[j])
            if (abs > max) max = abs
          }
          peaks.push(max)
        }

        const peakMax = Math.max(...peaks, 0.01)
        if (!cancelled) staticPeaksRef.current = peaks.map(p => p / peakMax)
        ctx.close()
      } catch {
        if (!cancelled) {
          staticPeaksRef.current = Array.from({ length: numBars }, () => 0.1 + Math.random() * 0.9)
        }
      }
    }

    extract()
    return () => { cancelled = true }
  }, [videoUrl, width])

  // Draw waveform
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const peaks = staticPeaksRef.current
    if (!canvas || peaks.length === 0 || width === 0 || height === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)
    }

    ctx.clearRect(0, 0, width, height)

    const barWidth = 2
    const gap = 1
    const step = barWidth + gap
    const numBars = peaks.length
    const progress = duration > 0 ? currentTime / duration : 0
    const progressBarIndex = Math.floor(progress * numBars)

    // Animate bounce value for a live feel when playing
    if (playing) {
      bounceRef.current = Math.sin(Date.now() / 120) * 0.15 + Math.sin(Date.now() / 80) * 0.1
    } else {
      bounceRef.current *= 0.9 // decay when paused
    }

    for (let i = 0; i < numBars; i++) {
      const x = i * step
      let peakVal = peaks[i]

      // Add bounce to bars near the playhead for a live effect
      if (playing) {
        const distFromPlayhead = Math.abs(i - progressBarIndex)
        if (distFromPlayhead < 8) {
          const proximity = 1 - distFromPlayhead / 8
          peakVal = Math.min(1, peakVal + bounceRef.current * proximity)
          peakVal = Math.max(0.05, peakVal)
        }
      }

      const barHeight = Math.max(2, peakVal * (height - 4))
      const y = (height - barHeight) / 2

      const isPast = i <= progressBarIndex

      if (isPast) {
        ctx.fillStyle = accent
        ctx.globalAlpha = 0.6 + 0.4 * peakVal
      } else {
        ctx.fillStyle = accent
        ctx.globalAlpha = 0.12 + 0.08 * peakVal
      }

      ctx.beginPath()
      ctx.roundRect(x, y, barWidth, barHeight, 1)
      ctx.fill()
    }

    // Playhead
    const playheadX = progress * width
    ctx.globalAlpha = 0.9
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(playheadX - 0.5, 0, 1.5, height)

    // Playhead glow
    const glow = ctx.createLinearGradient(playheadX - 6, 0, playheadX + 6, 0)
    glow.addColorStop(0, 'transparent')
    glow.addColorStop(0.5, `${accent}33`)
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.globalAlpha = 1
    ctx.fillRect(playheadX - 6, 0, 12, height)

    ctx.globalAlpha = 1
  }, [currentTime, duration, width, height, accent, playing])

  // Animation loop
  useEffect(() => {
    function loop() {
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    if (playing) {
      rafRef.current = requestAnimationFrame(loop)
    } else {
      draw()
    }
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, draw])

  // Click to seek
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (duration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const ratio = x / rect.width
    onSeek(Math.max(0, Math.min(duration, ratio * duration)))
  }, [duration, onSeek])

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{
        width: '100%', height: '100%',
        cursor: duration > 0 ? 'pointer' : 'default',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  )
}
