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

// ---------------------------------------------------------------------------
// Frequency band colors (like rekordbox / Serato)
// ---------------------------------------------------------------------------
const COLOR_LOW  = '#ef4444' // red — bass
const COLOR_MID  = '#4ade80' // green — mids
const COLOR_HIGH = '#60a5fa' // blue — highs

/**
 * Full-track waveform overview with colored frequency bands.
 *
 * Decodes the entire audio file, splits into frequency bands (bass/mid/high),
 * and renders a static overview showing the full track structure.
 * Playhead shows current position. Click to seek.
 */
export function Waveform({ videoUrl, currentTime, duration, playing, accent, onSeek }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const rafRef = useRef<number>(0)

  // Frequency band peaks: each bar has { low, mid, high } energy values
  const bandsRef = useRef<{ low: number; mid: number; high: number }[]>([])
  const [bandsReady, setBandsReady] = useState(false)

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

  // Extract frequency-banded waveform from audio
  useEffect(() => {
    if (!videoUrl || width === 0) return
    let cancelled = false
    setBandsReady(false)
    const numBars = Math.floor(width / 3) // 2px bar + 1px gap

    async function extract() {
      try {
        const response = await fetch(videoUrl!, { mode: 'cors' })
        const arrayBuffer = await response.arrayBuffer()
        const ctx = new AudioContext()
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

        const sampleRate = audioBuffer.sampleRate
        const channelData = audioBuffer.getChannelData(0)

        // FFT analysis per segment to get frequency bands
        const fftSize = 2048
        const bands: { low: number; mid: number; high: number }[] = []
        const samplesPerBar = Math.floor(channelData.length / numBars)

        // Frequency bin boundaries
        const binHz = sampleRate / fftSize
        const lowEnd = Math.floor(300 / binHz)     // 0-300 Hz = bass
        const midEnd = Math.floor(4000 / binHz)     // 300-4000 Hz = mids
        // 4000+ Hz = highs

        for (let i = 0; i < numBars; i++) {
          const start = i * samplesPerBar
          const segLen = Math.min(fftSize, samplesPerBar, channelData.length - start)

          if (segLen < 64) {
            bands.push({ low: 0, mid: 0, high: 0 })
            continue
          }

          // Extract segment and apply Hanning window
          const segment = new Float32Array(fftSize)
          for (let j = 0; j < segLen; j++) {
            const window = 0.5 * (1 - Math.cos(2 * Math.PI * j / segLen))
            segment[j] = channelData[start + j] * window
          }

          // Simple DFT for frequency analysis (use AnalyserNode-like approach)
          // For performance, use a basic magnitude calculation
          let lowEnergy = 0
          let midEnergy = 0
          let highEnergy = 0

          // Real DFT on the segment
          const halfSize = fftSize / 2
          for (let k = 1; k < halfSize; k++) {
            let re = 0, im = 0
            // Downsample the DFT computation for speed — check every 4th bin
            if (k > halfSize / 4 && k % 2 !== 0) continue
            for (let n = 0; n < segLen; n++) {
              const angle = (2 * Math.PI * k * n) / fftSize
              re += segment[n] * Math.cos(angle)
              im -= segment[n] * Math.sin(angle)
            }
            const magnitude = Math.sqrt(re * re + im * im) / segLen

            if (k <= lowEnd) lowEnergy += magnitude
            else if (k <= midEnd) midEnergy += magnitude
            else highEnergy += magnitude
          }

          bands.push({ low: lowEnergy, mid: midEnergy, high: highEnergy })
        }

        // Normalize each band independently for best visual contrast
        const maxLow = Math.max(...bands.map(b => b.low), 0.001)
        const maxMid = Math.max(...bands.map(b => b.mid), 0.001)
        const maxHigh = Math.max(...bands.map(b => b.high), 0.001)

        if (!cancelled) {
          bandsRef.current = bands.map(b => ({
            low: b.low / maxLow,
            mid: b.mid / maxMid,
            high: b.high / maxHigh,
          }))
          setBandsReady(true)
        }
        ctx.close()
      } catch (err) {
        console.error('[Waveform] Failed to extract audio data:', err, 'URL:', videoUrl)
        if (!cancelled) {
          bandsRef.current = [] // flat line — honest indicator that extraction failed
        }
      }
    }

    extract()
    return () => { cancelled = true }
  }, [videoUrl, width])

  // Draw waveform
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const bands = bandsRef.current
    if (!canvas || bands.length === 0 || width === 0 || height === 0) return

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
    const numBars = bands.length
    const progress = duration > 0 ? currentTime / duration : 0
    const progressBarIndex = Math.floor(progress * numBars)
    const centerY = height / 2

    for (let i = 0; i < numBars; i++) {
      const x = i * step
      const { low, mid, high } = bands[i]
      const isPast = i <= progressBarIndex
      const alphaMultiplier = isPast ? 1 : 0.25

      // Total bar height based on combined energy
      const totalEnergy = Math.max(low, mid, high)
      const totalHeight = Math.max(3, totalEnergy * (height - 4))

      // Split the bar into 3 colored sections stacked from center
      // Bass at the outside (top+bottom), mids in the middle, highs at center
      const lowH = low * totalHeight * 0.4
      const midH = mid * totalHeight * 0.35
      const highH = high * totalHeight * 0.25

      // Draw mirrored (top half + bottom half from center)
      const halfLow = lowH / 2
      const halfMid = midH / 2
      const halfHigh = highH / 2

      // Low (bass) — outermost
      ctx.fillStyle = COLOR_LOW
      ctx.globalAlpha = (0.5 + 0.5 * low) * alphaMultiplier
      ctx.fillRect(x, centerY - halfLow - halfMid - halfHigh, barWidth, halfLow)
      ctx.fillRect(x, centerY + halfMid + halfHigh, barWidth, halfLow)

      // Mid — middle layer
      ctx.fillStyle = COLOR_MID
      ctx.globalAlpha = (0.5 + 0.5 * mid) * alphaMultiplier
      ctx.fillRect(x, centerY - halfMid - halfHigh, barWidth, halfMid)
      ctx.fillRect(x, centerY + halfHigh, barWidth, halfMid)

      // High — innermost (center)
      ctx.fillStyle = COLOR_HIGH
      ctx.globalAlpha = (0.4 + 0.4 * high) * alphaMultiplier
      ctx.fillRect(x, centerY - halfHigh, barWidth, halfHigh)
      ctx.fillRect(x, centerY, barWidth, halfHigh)
    }

    // Playhead line
    const playheadX = progress * width
    ctx.globalAlpha = 1
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(playheadX - 0.5, 0, 1.5, height)

    // Playhead glow
    const glow = ctx.createLinearGradient(playheadX - 8, 0, playheadX + 8, 0)
    glow.addColorStop(0, 'transparent')
    glow.addColorStop(0.5, `${accent}44`)
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.fillRect(playheadX - 8, 0, 16, height)

    ctx.globalAlpha = 1
  }, [currentTime, duration, width, height, accent])

  // Animation loop — redraw on every frame when playing for smooth playhead
  // Also redraw when bandsReady changes (extraction just finished)
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
  }, [playing, draw, bandsReady])

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
