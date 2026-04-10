/**
 * Tempo Sync — pitch fader and BPM sync between decks.
 *
 * Pitch fader: adjusts playbackRate (±8% range by default).
 * Sync: matches one deck's BPM to the other by adjusting playbackRate.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TempoState {
  /** Pitch adjustment in percentage (-8 to +8) */
  pitch: number
  /** Original BPM of the track */
  originalBpm: number
  /** Effective BPM after pitch adjustment */
  effectiveBpm: number
  /** Whether sync is locked to the other deck */
  synced: boolean
}

export const DEFAULT_TEMPO: TempoState = {
  pitch: 0,
  originalBpm: 0,
  effectiveBpm: 0,
  synced: false,
}

// ---------------------------------------------------------------------------
// Tempo Controller
// ---------------------------------------------------------------------------

export class TempoController {
  private state: TempoState = { ...DEFAULT_TEMPO }
  private onRateChange: ((rate: number) => void) | null = null

  /** Set callback for when playback rate changes */
  setOnRateChange(cb: (rate: number) => void) {
    this.onRateChange = cb
  }

  /** Set the original BPM of the loaded track */
  setOriginalBpm(bpm: number) {
    this.state.originalBpm = bpm
    this.state.effectiveBpm = this.calcEffectiveBpm()
  }

  /** Set pitch fader value (-8 to +8 percent) */
  setPitch(percent: number) {
    this.state.pitch = Math.max(-8, Math.min(8, percent))
    this.state.effectiveBpm = this.calcEffectiveBpm()
    this.state.synced = false // manual pitch breaks sync
    this.applyRate()
  }

  /** Reset pitch to 0 */
  resetPitch() {
    this.state.pitch = 0
    this.state.effectiveBpm = this.state.originalBpm
    this.state.synced = false
    this.applyRate()
  }

  /** Sync this deck to a target BPM */
  syncTo(targetBpm: number) {
    if (this.state.originalBpm <= 0 || targetBpm <= 0) return

    const ratio = targetBpm / this.state.originalBpm
    const pitchPercent = (ratio - 1) * 100

    // Clamp to ±8%
    if (Math.abs(pitchPercent) > 8) return // too far apart to sync

    this.state.pitch = pitchPercent
    this.state.effectiveBpm = targetBpm
    this.state.synced = true
    this.applyRate()
  }

  /** Get current state */
  getState(): TempoState { return { ...this.state } }

  /** Get the playback rate for the current pitch */
  getRate(): number {
    return 1 + (this.state.pitch / 100)
  }

  /** Reset everything */
  reset() {
    this.state = { ...DEFAULT_TEMPO }
    this.applyRate()
  }

  private calcEffectiveBpm(): number {
    if (this.state.originalBpm <= 0) return 0
    return Math.round(this.state.originalBpm * (1 + this.state.pitch / 100) * 10) / 10
  }

  private applyRate() {
    this.onRateChange?.(this.getRate())
  }
}
