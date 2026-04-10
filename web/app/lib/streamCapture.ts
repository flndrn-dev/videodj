/**
 * Stream Capture Pipeline
 *
 * Composites video from both decks into a single canvas output,
 * mixes audio through Web Audio API, and produces a combined MediaStream
 * ready for recording or RTMP streaming.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamConfig {
  width: number
  height: number
  fps: number
  videoBitrate: number // kbps
  audioBitrate: number // kbps
  overlayEnabled: boolean
  overlayPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}

export interface NowPlayingInfo {
  title: string
  artist: string
  bpm: number
  key: string
}

export const DEFAULT_STREAM_CONFIG: StreamConfig = {
  width: 1280,
  height: 720,
  fps: 30,
  videoBitrate: 4500,
  audioBitrate: 192,
  overlayEnabled: true,
  overlayPosition: 'bottom-left',
}

// Preset resolutions
export const RESOLUTION_PRESETS = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
} as const

// ---------------------------------------------------------------------------
// Canvas Compositor
// ---------------------------------------------------------------------------

export class StreamCompositor {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private config: StreamConfig
  private videoA: HTMLVideoElement | null = null
  private videoB: HTMLVideoElement | null = null
  private crossfader = 50 // 0=A, 100=B
  private nowPlaying: NowPlayingInfo | null = null
  private rafId = 0
  private running = false

  // Audio mixing
  private audioCtx: AudioContext | null = null
  private sourceA: MediaElementAudioSourceNode | null = null
  private sourceB: MediaElementAudioSourceNode | null = null
  private gainA: GainNode | null = null
  private gainB: GainNode | null = null
  private audioDestination: MediaStreamAudioDestinationNode | null = null

  // Combined stream
  private combinedStream: MediaStream | null = null

  constructor(config: StreamConfig = DEFAULT_STREAM_CONFIG) {
    this.config = config
    this.canvas = document.createElement('canvas')
    this.canvas.width = config.width
    this.canvas.height = config.height
    this.ctx = this.canvas.getContext('2d')!
  }

  /** Set the video elements to composite */
  setVideoSources(videoA: HTMLVideoElement | null, videoB: HTMLVideoElement | null) {
    this.videoA = videoA
    this.videoB = videoB
  }

  /** Update crossfader position (0-100) */
  setCrossfader(value: number) {
    this.crossfader = value
    // Update audio gains
    if (this.gainA && this.gainB) {
      const volA = value <= 50 ? 1 : Math.max(0, (100 - value) / 50)
      const volB = value >= 50 ? 1 : Math.max(0, value / 50)
      this.gainA.gain.setValueAtTime(volA, this.audioCtx?.currentTime || 0)
      this.gainB.gain.setValueAtTime(volB, this.audioCtx?.currentTime || 0)
    }
  }

  /** Update the now playing overlay info */
  setNowPlaying(info: NowPlayingInfo | null) {
    this.nowPlaying = info
  }

  /** Update stream config (resolution, etc.) */
  updateConfig(config: Partial<StreamConfig>) {
    this.config = { ...this.config, ...config }
    this.canvas.width = this.config.width
    this.canvas.height = this.config.height
  }

  /** Initialize audio routing for stream capture */
  initAudio() {
    if (this.audioCtx) return // already initialized

    this.audioCtx = new AudioContext()
    this.gainA = this.audioCtx.createGain()
    this.gainB = this.audioCtx.createGain()
    this.audioDestination = this.audioCtx.createMediaStreamDestination()

    this.gainA.connect(this.audioDestination)
    this.gainB.connect(this.audioDestination)

    // Connect video elements as audio sources
    if (this.videoA) {
      try {
        this.sourceA = this.audioCtx.createMediaElementSource(this.videoA)
        this.sourceA.connect(this.gainA)
        // Also connect to speakers so the DJ can hear
        this.sourceA.connect(this.audioCtx.destination)
      } catch {
        // Element may already be connected to another context
      }
    }
    if (this.videoB) {
      try {
        this.sourceB = this.audioCtx.createMediaElementSource(this.videoB)
        this.sourceB.connect(this.gainB)
        this.sourceB.connect(this.audioCtx.destination)
      } catch {
        // Element may already be connected to another context
      }
    }
  }

  /** Start compositing frames to canvas */
  start(): MediaStream {
    if (this.running) return this.combinedStream!

    this.running = true

    // Initialize audio routing (creates AudioContext + gain nodes + destination)
    this.initAudio()

    // Create video stream from canvas
    const canvasStream = this.canvas.captureStream(this.config.fps)

    // Combine canvas video + mixed audio
    this.combinedStream = new MediaStream()

    // Add video tracks from canvas
    for (const track of canvasStream.getVideoTracks()) {
      this.combinedStream.addTrack(track)
    }

    // Add audio tracks from mixer
    if (this.audioDestination) {
      for (const track of this.audioDestination.stream.getAudioTracks()) {
        this.combinedStream.addTrack(track)
      }
    }

    // Start render loop
    this.renderFrame()

    return this.combinedStream
  }

  /** Stop compositing */
  stop() {
    this.running = false
    if (this.rafId) cancelAnimationFrame(this.rafId)

    if (this.combinedStream) {
      for (const track of this.combinedStream.getTracks()) {
        track.stop()
      }
      this.combinedStream = null
    }

    if (this.audioCtx) {
      this.sourceA?.disconnect()
      this.sourceB?.disconnect()
      this.gainA?.disconnect()
      this.gainB?.disconnect()
      this.audioDestination?.disconnect()
      this.audioCtx.close()
      this.audioCtx = null
      this.sourceA = null
      this.sourceB = null
      this.gainA = null
      this.gainB = null
      this.audioDestination = null
    }
  }

  /** Get the canvas element for preview */
  getCanvas(): HTMLCanvasElement {
    return this.canvas
  }

  /** Get the combined MediaStream */
  getStream(): MediaStream | null {
    return this.combinedStream
  }

  // ---------------------------------------------------------------------------
  // Private: render one frame
  // ---------------------------------------------------------------------------

  private renderFrame = () => {
    if (!this.running) return

    const { width, height } = this.config
    const ctx = this.ctx

    // Clear
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)

    // Determine which video to show based on crossfader
    const showA = this.crossfader < 90 && this.videoA && this.videoA.readyState >= 2
    const showB = this.crossfader > 10 && this.videoB && this.videoB.readyState >= 2

    if (showA && showB) {
      // Both active: crossfade blend
      // Draw A first
      ctx.globalAlpha = this.crossfader <= 50 ? 1 : Math.max(0, (100 - this.crossfader) / 50)
      this.drawVideoFit(this.videoA!, width, height)

      // Draw B on top
      ctx.globalAlpha = this.crossfader >= 50 ? 1 : Math.max(0, this.crossfader / 50)
      this.drawVideoFit(this.videoB!, width, height)

      ctx.globalAlpha = 1
    } else if (showA) {
      ctx.globalAlpha = 1
      this.drawVideoFit(this.videoA!, width, height)
    } else if (showB) {
      ctx.globalAlpha = 1
      this.drawVideoFit(this.videoB!, width, height)
    }

    // Draw Now Playing overlay
    if (this.config.overlayEnabled && this.nowPlaying) {
      this.drawOverlay()
    }

    this.rafId = requestAnimationFrame(this.renderFrame)
  }

  /** Draw video covering the full canvas (cover fit) */
  private drawVideoFit(video: HTMLVideoElement, canvasW: number, canvasH: number) {
    const vw = video.videoWidth || canvasW
    const vh = video.videoHeight || canvasH
    const videoAspect = vw / vh
    const canvasAspect = canvasW / canvasH

    let sx = 0, sy = 0, sw = vw, sh = vh

    if (videoAspect > canvasAspect) {
      // Video is wider — crop sides
      sw = vh * canvasAspect
      sx = (vw - sw) / 2
    } else {
      // Video is taller — crop top/bottom
      sh = vw / canvasAspect
      sy = (vh - sh) / 2
    }

    this.ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvasW, canvasH)
  }

  /** Draw the Now Playing overlay */
  private drawOverlay() {
    if (!this.nowPlaying) return

    const { width, height } = this.config
    const padding = 20
    const boxW = 360
    const boxH = 56

    // Position
    let x = padding
    let y = height - boxH - padding
    if (this.config.overlayPosition === 'top-left') { x = padding; y = padding }
    else if (this.config.overlayPosition === 'top-right') { x = width - boxW - padding; y = padding }
    else if (this.config.overlayPosition === 'bottom-right') { x = width - boxW - padding; y = height - boxH - padding }

    // Background
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    this.ctx.beginPath()
    this.ctx.roundRect(x, y, boxW, boxH, 8)
    this.ctx.fill()

    // Yellow accent bar
    this.ctx.fillStyle = '#ffff00'
    this.ctx.fillRect(x, y, 4, boxH)

    // Title
    this.ctx.fillStyle = '#ffffff'
    this.ctx.font = `bold ${Math.round(height / 45)}px system-ui, sans-serif`
    this.ctx.textBaseline = 'top'
    const title = this.nowPlaying.title.length > 35 ? this.nowPlaying.title.slice(0, 35) + '...' : this.nowPlaying.title
    this.ctx.fillText(title, x + 14, y + 10)

    // Artist + BPM + Key
    this.ctx.fillStyle = '#aaaaaa'
    this.ctx.font = `${Math.round(height / 55)}px system-ui, sans-serif`
    const info = `${this.nowPlaying.artist || 'Unknown'}  ·  ${this.nowPlaying.bpm || '?'} BPM  ·  ${this.nowPlaying.key || '?'}`
    this.ctx.fillText(info, x + 14, y + 34)
  }
}

