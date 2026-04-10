/**
 * Mix Recorder — records the DJ mix (audio + optional video) to a file.
 *
 * Can record:
 * - Audio only (WebM/Opus) — lightweight, captures the mixed audio output
 * - Audio + Video (WebM/VP9) — captures a canvas composite of both decks
 *
 * Uses MediaRecorder API with MediaStream from:
 * - AudioContext.createMediaStreamDestination() for audio
 * - Canvas.captureStream() for video (if enabled)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecorderOptions {
  includeVideo: boolean
  audioBitrate?: number     // default 192000
  videoBitrate?: number     // default 6000000
  canvas?: HTMLCanvasElement // required if includeVideo
}

export interface RecorderState {
  recording: boolean
  duration: number        // seconds
  fileSize: number        // bytes (approximate)
}

export type RecorderCallback = (state: RecorderState) => void

// ---------------------------------------------------------------------------
// Mix Recorder
// ---------------------------------------------------------------------------

export class MixRecorder {
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private startTime = 0
  private timerInterval: ReturnType<typeof setInterval> | null = null
  private audioDestination: MediaStreamAudioDestinationNode | null = null
  private onStateChange: RecorderCallback | null = null
  private totalSize = 0

  /** Set state change callback */
  onUpdate(cb: RecorderCallback) {
    this.onStateChange = cb
  }

  /**
   * Start recording. Pass AudioContext + optional canvas.
   * Connect your audio nodes to the returned MediaStreamAudioDestinationNode.
   */
  start(audioContext: AudioContext, options: RecorderOptions = { includeVideo: false }): MediaStreamAudioDestinationNode | null {
    if (this.recorder?.state === 'recording') return this.audioDestination

    // Create audio destination for capturing
    this.audioDestination = audioContext.createMediaStreamDestination()

    let stream: MediaStream

    if (options.includeVideo && options.canvas) {
      // Combine canvas video + audio
      const videoStream = options.canvas.captureStream(30)
      const audioStream = this.audioDestination.stream

      stream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioStream.getAudioTracks(),
      ])
    } else {
      // Audio only
      stream = this.audioDestination.stream
    }

    // Pick best codec
    const mimeType = options.includeVideo
      ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm')
      : (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm')

    this.chunks = []
    this.totalSize = 0

    this.recorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: options.audioBitrate || 192000,
      videoBitsPerSecond: options.includeVideo ? (options.videoBitrate || 6000000) : undefined,
    })

    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data)
        this.totalSize += e.data.size
      }
    }

    this.recorder.onstop = () => {
      this.stopTimer()
    }

    this.recorder.start(1000) // 1-second chunks
    this.startTime = Date.now()
    this.startTimer()

    return this.audioDestination
  }

  /** Stop recording and return the recorded blob */
  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.recorder || this.recorder.state !== 'recording') {
        resolve(new Blob())
        return
      }

      this.recorder.onstop = () => {
        this.stopTimer()
        const mimeType = this.recorder?.mimeType || 'audio/webm'
        const blob = new Blob(this.chunks, { type: mimeType })
        this.recorder = null
        this.audioDestination = null
        resolve(blob)
      }

      this.recorder.stop()
    })
  }

  /** Get current state */
  getState(): RecorderState {
    return {
      recording: this.recorder?.state === 'recording',
      duration: this.recorder?.state === 'recording' ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
      fileSize: this.totalSize,
    }
  }

  /** Check if recording */
  isRecording(): boolean {
    return this.recorder?.state === 'recording'
  }

  /** Download the recorded blob as a file */
  static download(blob: Blob, filename?: string) {
    const ext = blob.type.includes('video') ? 'webm' : 'webm'
    const name = filename || `dj-mix-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${ext}`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  /** Format file size for display */
  static formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  private startTimer() {
    this.timerInterval = setInterval(() => {
      this.onStateChange?.(this.getState())
    }, 1000)
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }
    this.onStateChange?.(this.getState())
  }
}

// Singleton
export const mixRecorder = new MixRecorder()
