/**
 * Audio Engine — Per-deck audio processing chain.
 *
 * Routes a video/audio element through Web Audio API:
 * MediaElementSource → EQ (high/mid/low) → Gain → Destination
 *
 * Each deck gets one AudioEngine instance that lives for the lifetime of the app.
 * The MediaElementSource is created ONCE and never recreated.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EQState {
  high: number   // -40 to 6 dB (0 = flat)
  mid: number    // -40 to 6 dB
  low: number    // -40 to 6 dB
  highKill: boolean
  midKill: boolean
  lowKill: boolean
}

export const DEFAULT_EQ: EQState = {
  high: 0,
  mid: 0,
  low: 0,
  highKill: false,
  midKill: false,
  lowKill: false,
}

// Kill = -40dB (effectively silent)
const KILL_DB = -40

// ---------------------------------------------------------------------------
// Audio Engine
// ---------------------------------------------------------------------------

export class AudioEngine {
  private audioCtx: AudioContext | null = null
  private source: MediaElementAudioSourceNode | null = null
  private eqLow: BiquadFilterNode | null = null
  private eqMid: BiquadFilterNode | null = null
  private eqHigh: BiquadFilterNode | null = null
  private gainNode: GainNode | null = null
  private connected = false
  private element: HTMLMediaElement | null = null

  // Current state
  private eq: EQState = { ...DEFAULT_EQ }
  private volume = 1

  /**
   * Connect a video/audio element to the audio processing chain.
   * Can only be called ONCE per element — subsequent calls are ignored.
   */
  connect(element: HTMLMediaElement): boolean {
    if (this.connected) return true
    if (!element) return false

    try {
      this.audioCtx = new AudioContext()
      this.element = element

      // Create source from media element (ONE-TIME operation)
      this.source = this.audioCtx.createMediaElementSource(element)

      // Create 3-band EQ
      // Low: lowshelf at 320Hz
      this.eqLow = this.audioCtx.createBiquadFilter()
      this.eqLow.type = 'lowshelf'
      this.eqLow.frequency.value = 320
      this.eqLow.gain.value = 0

      // Mid: peaking at 1000Hz, Q=0.5 for wide band
      this.eqMid = this.audioCtx.createBiquadFilter()
      this.eqMid.type = 'peaking'
      this.eqMid.frequency.value = 1000
      this.eqMid.Q.value = 0.5
      this.eqMid.gain.value = 0

      // High: highshelf at 3200Hz
      this.eqHigh = this.audioCtx.createBiquadFilter()
      this.eqHigh.type = 'highshelf'
      this.eqHigh.frequency.value = 3200
      this.eqHigh.gain.value = 0

      // Gain node for volume control
      this.gainNode = this.audioCtx.createGain()
      this.gainNode.gain.value = this.volume

      // Chain: source → low → mid → high → gain → destination
      this.source.connect(this.eqLow)
      this.eqLow.connect(this.eqMid)
      this.eqMid.connect(this.eqHigh)
      this.eqHigh.connect(this.gainNode)
      this.gainNode.connect(this.audioCtx.destination)

      this.connected = true

      // Ensure native volume is at max (we control volume via gain node)
      element.volume = 1

      // Resume context if suspended (common after page load)
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume()
      }

      // Apply current volume
      this.gainNode.gain.value = this.volume

      return true
    } catch (e) {
      console.warn('[AudioEngine] Failed to connect:', e)
      // If createMediaElementSource fails (already connected),
      // fall back to native volume control
      this.connected = false
      return false
    }
  }

  /** Check if the engine is connected */
  isConnected(): boolean {
    return this.connected
  }

  /** Set volume (0-1) */
  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol))
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setTargetAtTime(this.volume, this.audioCtx.currentTime, 0.02)
    } else if (this.element) {
      // Fallback: use native volume
      this.element.volume = this.volume
    }
  }

  /** Set EQ band value in dB (-40 to +6) */
  setEQ(band: 'high' | 'mid' | 'low', db: number) {
    this.eq[band] = db
    this.applyEQ(band)
  }

  /** Toggle kill switch for a band */
  setKill(band: 'high' | 'mid' | 'low', kill: boolean) {
    const key = `${band}Kill` as 'highKill' | 'midKill' | 'lowKill'
    this.eq[key] = kill
    this.applyEQ(band)
  }

  /** Toggle kill switch */
  toggleKill(band: 'high' | 'mid' | 'low') {
    const key = `${band}Kill` as 'highKill' | 'midKill' | 'lowKill'
    this.eq[key] = !this.eq[key]
    this.applyEQ(band)
  }

  /** Get current EQ state */
  getEQ(): EQState {
    return { ...this.eq }
  }

  /** Apply EQ value to the filter node */
  private applyEQ(band: 'high' | 'mid' | 'low') {
    if (!this.audioCtx) return

    const killKey = `${band}Kill` as 'highKill' | 'midKill' | 'lowKill'
    const isKilled = this.eq[killKey]
    const db = isKilled ? KILL_DB : this.eq[band]

    const node = band === 'high' ? this.eqHigh : band === 'mid' ? this.eqMid : this.eqLow
    if (node) {
      node.gain.setTargetAtTime(db, this.audioCtx.currentTime, 0.02)
    }
  }

  /** Get the audio context (for stream capture) */
  getAudioContext(): AudioContext | null {
    return this.audioCtx
  }

  /** Get the gain node (for stream capture routing) */
  getGainNode(): GainNode | null {
    return this.gainNode
  }

  /** Resume audio context (needed after user interaction) */
  async resume() {
    if (this.audioCtx?.state === 'suspended') {
      await this.audioCtx.resume()
    }
  }

  /** Disconnect and clean up */
  disconnect() {
    if (this.source) this.source.disconnect()
    if (this.eqLow) this.eqLow.disconnect()
    if (this.eqMid) this.eqMid.disconnect()
    if (this.eqHigh) this.eqHigh.disconnect()
    if (this.gainNode) this.gainNode.disconnect()
    if (this.audioCtx) this.audioCtx.close()

    this.source = null
    this.eqLow = null
    this.eqMid = null
    this.eqHigh = null
    this.gainNode = null
    this.audioCtx = null
    this.connected = false
    this.element = null
  }
}
