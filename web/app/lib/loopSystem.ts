/**
 * Loop System — set loop in/out points, auto-loop by bars.
 *
 * Loops are managed per deck. When active, the video/audio
 * automatically seeks back to the loop-in point when reaching loop-out.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoopState {
  active: boolean
  inPoint: number   // seconds
  outPoint: number  // seconds
  barLength: number // auto-loop bars (1, 2, 4, 8, 16)
}

export const DEFAULT_LOOP: LoopState = {
  active: false,
  inPoint: 0,
  outPoint: 0,
  barLength: 4,
}

// ---------------------------------------------------------------------------
// Loop controller per deck
// ---------------------------------------------------------------------------

export class LoopController {
  private state: LoopState = { ...DEFAULT_LOOP }
  private videoElement: HTMLVideoElement | null = null
  private checkInterval: ReturnType<typeof setInterval> | null = null

  /** Attach to a video element */
  attach(video: HTMLVideoElement) {
    this.videoElement = video
  }

  /** Detach and stop loop */
  detach() {
    this.stop()
    this.videoElement = null
  }

  /** Set loop-in point (current time) */
  setIn(time: number) {
    this.state.inPoint = time
    // If out is before in, reset out
    if (this.state.outPoint <= this.state.inPoint) {
      this.state.outPoint = 0
    }
  }

  /** Set loop-out point (current time) and activate */
  setOut(time: number) {
    if (time <= this.state.inPoint) return
    this.state.outPoint = time
    this.activate()
  }

  /** Set auto-loop from current position by bar count */
  autoLoop(currentTime: number, bpm: number, bars: number) {
    if (bpm <= 0) return
    const beatsPerBar = 4
    const beatDuration = 60 / bpm
    const loopDuration = bars * beatsPerBar * beatDuration

    this.state.inPoint = currentTime
    this.state.outPoint = currentTime + loopDuration
    this.state.barLength = bars
    this.activate()
  }

  /** Activate loop — starts monitoring playback position */
  activate() {
    if (this.state.inPoint >= this.state.outPoint) return
    this.state.active = true
    this.startMonitoring()
  }

  /** Deactivate loop — playback continues past loop-out */
  deactivate() {
    this.state.active = false
    this.stopMonitoring()
  }

  /** Toggle loop on/off */
  toggle() {
    if (this.state.active) this.deactivate()
    else if (this.state.inPoint < this.state.outPoint) this.activate()
  }

  /** Stop and reset */
  stop() {
    this.state = { ...DEFAULT_LOOP }
    this.stopMonitoring()
  }

  /** Get current state */
  getState(): LoopState { return { ...this.state } }

  /** Check if a time is within the loop */
  isInLoop(time: number): boolean {
    return this.state.active && time >= this.state.inPoint && time <= this.state.outPoint
  }

  // Monitor playback and loop back when reaching out-point
  private startMonitoring() {
    this.stopMonitoring()
    this.checkInterval = setInterval(() => {
      if (!this.state.active || !this.videoElement) return
      if (this.videoElement.currentTime >= this.state.outPoint) {
        this.videoElement.currentTime = this.state.inPoint
      }
    }, 20) // check every 20ms for tight loop
  }

  private stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }
}
