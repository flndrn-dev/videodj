/**
 * Audio Engine — Per-deck audio processing chain.
 *
 * Routes a video/audio element through Web Audio API:
 * Bypass mode (default): MediaElementSource → Gain → Destination
 * EQ mode (when any band != 0): MediaElementSource → EQ Low → EQ Mid → EQ High → Gain → Destination
 *
 * Bypass mode = zero additional latency beyond the gain node.
 * EQ only activates when you move a slider or hit KILL.
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
  private eqActive = false // false = bypass, true = EQ chain active
  private element: HTMLMediaElement | null = null

  private eq: EQState = { ...DEFAULT_EQ }
  private volume = 1
  private trim = 1 // gain trim (0.5 = -6dB, 1 = 0dB, 2 = +6dB)
  private monitorMuted = false
  private monitorGain: GainNode | null = null // sits between gainNode and destination for local mute

  /**
   * Connect a video/audio element. Starts in BYPASS mode (source → gain → destination).
   *
   * If the element was already connected (e.g., track change on same <video>),
   * we reuse the existing AudioContext + MediaElementSource since
   * createMediaElementSource can only be called once per element.
   */
  connect(element: HTMLMediaElement): boolean {
    if (this.connected && this.element === element) return true
    if (!element) return false

    // Reuse existing connection if this is the same element (track changed, same <video>)
    const existingEngine = (element as HTMLMediaElement & { _audioEngine?: AudioEngine })._audioEngine
    if (existingEngine && existingEngine !== this) {
      // Another AudioEngine instance owns this element — steal its nodes
      this.audioCtx = existingEngine.audioCtx
      this.source = existingEngine.source
      this.gainNode = existingEngine.gainNode
      this.eqLow = existingEngine.eqLow
      this.eqMid = existingEngine.eqMid
      this.eqHigh = existingEngine.eqHigh
      this.eqActive = existingEngine.eqActive
      this.connected = true
      this.element = element
      ;(element as HTMLMediaElement & { _audioEngine?: AudioEngine })._audioEngine = this
      // Nullify the old engine so it doesn't close our context
      existingEngine.audioCtx = null
      existingEngine.source = null
      existingEngine.gainNode = null
      existingEngine.connected = false
      this.applyGain()
      return true
    }

    if (existingEngine === this && this.audioCtx && this.source && this.gainNode) {
      // Same engine, same element — already connected, just resume
      this.connected = true
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume()
      this.applyGain()
      return true
    }

    try {
      this.audioCtx = new AudioContext({ latencyHint: 'interactive' })
      this.element = element

      this.source = this.audioCtx.createMediaElementSource(element)

      // Mark element with owning engine reference
      ;(element as HTMLMediaElement & { _audioEngine?: AudioEngine })._audioEngine = this

      // Gain node for volume control (always in chain)
      this.gainNode = this.audioCtx.createGain()
      this.gainNode.gain.value = this.volume

      // Monitor gain node — sits between gainNode and speakers
      // Stream connects to gainNode directly (before monitorGain),
      // so muting monitorGain only silences local speakers, not the stream.
      this.monitorGain = this.audioCtx.createGain()
      this.monitorGain.gain.value = this.monitorMuted ? 0 : 1

      // Create EQ nodes (but don't connect them yet — bypass mode)
      this.eqLow = this.audioCtx.createBiquadFilter()
      this.eqLow.type = 'lowshelf'
      this.eqLow.frequency.value = 320
      this.eqLow.gain.value = 0

      this.eqMid = this.audioCtx.createBiquadFilter()
      this.eqMid.type = 'peaking'
      this.eqMid.frequency.value = 1000
      this.eqMid.Q.value = 0.5
      this.eqMid.gain.value = 0

      this.eqHigh = this.audioCtx.createBiquadFilter()
      this.eqHigh.type = 'highshelf'
      this.eqHigh.frequency.value = 3200
      this.eqHigh.gain.value = 0

      // BYPASS: source → gain → monitorGain → destination (no EQ processing)
      this.source.connect(this.gainNode)
      this.gainNode.connect(this.monitorGain)
      this.monitorGain.connect(this.audioCtx.destination)
      this.eqActive = false

      this.connected = true
      // IMPORTANT: set element volume to 1 — all volume control goes through Web Audio gain
      element.volume = 1

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume()
      }

      this.gainNode.gain.value = this.volume
      return true
    } catch (e) {
      console.error('[AudioEngine] Failed to connect:', e, {
        src: element.src, readyState: element.readyState,
        crossOrigin: element.crossOrigin, networkState: element.networkState,
      })
      if (this.audioCtx) {
        this.audioCtx.close()
        this.audioCtx = null
      }
      this.source = null
      this.gainNode = null
      this.connected = false
      return false
    }
  }

  isConnected(): boolean { return this.connected }

  /** Switch to EQ mode: source → eqLow → eqMid → eqHigh → gain → monitorGain → destination */
  private activateEQ() {
    if (this.eqActive || !this.source || !this.gainNode || !this.eqLow || !this.eqMid || !this.eqHigh || !this.audioCtx || !this.monitorGain) return

    // Disconnect bypass path (but keep monitorGain → destination)
    this.source.disconnect()
    this.gainNode.disconnect()

    // Connect EQ chain: source → EQ → gain → monitorGain → destination
    this.source.connect(this.eqLow)
    this.eqLow.connect(this.eqMid)
    this.eqMid.connect(this.eqHigh)
    this.eqHigh.connect(this.gainNode)
    this.gainNode.connect(this.monitorGain)
    this.monitorGain.connect(this.audioCtx.destination)

    this.eqActive = true
  }

  /** Switch back to bypass: source → gain → monitorGain → destination (no EQ) */
  private deactivateEQ() {
    if (!this.eqActive || !this.source || !this.gainNode || !this.eqLow || !this.eqMid || !this.eqHigh || !this.audioCtx || !this.monitorGain) return

    // Disconnect EQ chain
    this.source.disconnect()
    this.eqLow.disconnect()
    this.eqMid.disconnect()
    this.eqHigh.disconnect()
    this.gainNode.disconnect()

    // Connect bypass: source → gain → monitorGain → destination
    this.source.connect(this.gainNode)
    this.gainNode.connect(this.monitorGain)
    this.monitorGain.connect(this.audioCtx.destination)

    this.eqActive = false
  }

  /** Check if any EQ band is non-zero */
  private isEQNeeded(): boolean {
    return this.eq.high !== 0 || this.eq.mid !== 0 || this.eq.low !== 0 ||
           this.eq.highKill || this.eq.midKill || this.eq.lowKill
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol))
    this.applyGain()
  }

  /** Set trim/gain (-6dB to +6dB mapped as 0.5 to 2.0) */
  setTrim(trim: number) {
    this.trim = Math.max(0.25, Math.min(2, trim))
    this.applyGain()
  }

  getTrim(): number { return this.trim }

  private applyGain() {
    const gain = this.volume * this.trim
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setTargetAtTime(gain, this.audioCtx.currentTime, 0.02)
      // Keep native volume at 1 — all control through Web Audio gain node
      if (this.element) this.element.volume = 1
    } else if (this.element) {
      // No Web Audio — fallback to native volume (shouldn't happen normally)
      this.element.volume = Math.max(0, Math.min(1, gain))
    }
  }

  setEQ(band: 'high' | 'mid' | 'low', db: number) {
    this.eq[band] = db

    // Activate EQ chain if needed
    if (this.isEQNeeded() && !this.eqActive) this.activateEQ()
    if (!this.isEQNeeded() && this.eqActive) this.deactivateEQ()

    this.applyEQ(band)
  }

  setKill(band: 'high' | 'mid' | 'low', kill: boolean) {
    const key = `${band}Kill` as 'highKill' | 'midKill' | 'lowKill'
    this.eq[key] = kill

    if (this.isEQNeeded() && !this.eqActive) this.activateEQ()
    if (!this.isEQNeeded() && this.eqActive) this.deactivateEQ()

    this.applyEQ(band)
  }

  toggleKill(band: 'high' | 'mid' | 'low') {
    const key = `${band}Kill` as 'highKill' | 'midKill' | 'lowKill'
    this.eq[key] = !this.eq[key]

    if (this.isEQNeeded() && !this.eqActive) this.activateEQ()
    if (!this.isEQNeeded() && this.eqActive) this.deactivateEQ()

    this.applyEQ(band)
  }

  getEQ(): EQState { return { ...this.eq } }

  private applyEQ(band: 'high' | 'mid' | 'low') {
    if (!this.audioCtx || !this.eqActive) return

    const killKey = `${band}Kill` as 'highKill' | 'midKill' | 'lowKill'
    const isKilled = this.eq[killKey]
    const db = isKilled ? KILL_DB : this.eq[band]

    const node = band === 'high' ? this.eqHigh : band === 'mid' ? this.eqMid : this.eqLow
    if (node) {
      node.gain.setTargetAtTime(db, this.audioCtx.currentTime, 0.02)
    }
  }

  /** Mute/unmute local monitor output. Stream audio is unaffected. */
  setMonitorMute(muted: boolean) {
    this.monitorMuted = muted
    if (this.monitorGain && this.audioCtx) {
      this.monitorGain.gain.setTargetAtTime(muted ? 0 : 1, this.audioCtx.currentTime, 0.02)
    }
  }

  isMonitorMuted(): boolean { return this.monitorMuted }

  getAudioContext(): AudioContext | null { return this.audioCtx }
  getGainNode(): GainNode | null { return this.gainNode }
  getMonitorGainNode(): GainNode | null { return this.monitorGain }

  async resume() {
    if (this.audioCtx?.state === 'suspended') {
      await this.audioCtx.resume()
    }
  }

  disconnect() {
    if (this.source) this.source.disconnect()
    if (this.eqLow) this.eqLow.disconnect()
    if (this.eqMid) this.eqMid.disconnect()
    if (this.eqHigh) this.eqHigh.disconnect()
    if (this.gainNode) this.gainNode.disconnect()
    if (this.monitorGain) this.monitorGain.disconnect()
    if (this.audioCtx) this.audioCtx.close()

    this.source = null
    this.eqLow = null
    this.eqMid = null
    this.eqHigh = null
    this.gainNode = null
    this.monitorGain = null
    this.audioCtx = null
    this.connected = false
    this.eqActive = false
    this.element = null
  }
}
