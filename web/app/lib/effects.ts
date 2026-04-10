/**
 * DJ Effects — per-deck audio effects chain.
 *
 * Each effect is a Web Audio API node that can be toggled on/off.
 * When off, audio bypasses the effect (zero latency).
 * When on, the effect is inserted into the audio chain.
 *
 * Effects:
 * - Filter (low-pass / high-pass sweep)
 * - Delay (echo)
 * - Reverb (convolution-based)
 * - Flanger (modulated delay)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EffectState {
  filter: { active: boolean; type: 'lowpass' | 'highpass'; frequency: number } // 20-20000 Hz
  delay: { active: boolean; time: number; feedback: number } // time 0-1s, feedback 0-0.9
  reverb: { active: boolean; mix: number } // mix 0-1 (dry/wet)
  flanger: { active: boolean; depth: number; rate: number } // depth 0-10ms, rate 0-5 Hz
}

export const DEFAULT_EFFECTS: EffectState = {
  filter: { active: false, type: 'lowpass', frequency: 20000 },
  delay: { active: false, time: 0.35, feedback: 0.4 },
  reverb: { active: false, mix: 0.3 },
  flanger: { active: false, depth: 3, rate: 0.5 },
}

// ---------------------------------------------------------------------------
// Effects Chain
// ---------------------------------------------------------------------------

export class EffectsChain {
  private audioCtx: AudioContext | null = null
  private state: EffectState = { ...DEFAULT_EFFECTS }

  // Nodes
  private filterNode: BiquadFilterNode | null = null
  private delayNode: DelayNode | null = null
  private delayFeedback: GainNode | null = null
  private delayDry: GainNode | null = null
  private delayWet: GainNode | null = null
  private reverbConvolver: ConvolverNode | null = null
  private reverbDry: GainNode | null = null
  private reverbWet: GainNode | null = null
  private flangerDelay: DelayNode | null = null
  private flangerLFO: OscillatorNode | null = null
  private flangerDepth: GainNode | null = null

  // Connection points
  private input: GainNode | null = null
  private output: GainNode | null = null
  private initialized = false

  /**
   * Initialize the effects chain with an AudioContext.
   * Call this after the AudioEngine is connected.
   */
  init(audioCtx: AudioContext) {
    if (this.initialized) return
    this.audioCtx = audioCtx

    // Create input/output nodes
    this.input = audioCtx.createGain()
    this.output = audioCtx.createGain()

    // --- Filter ---
    this.filterNode = audioCtx.createBiquadFilter()
    this.filterNode.type = 'lowpass'
    this.filterNode.frequency.value = 20000
    this.filterNode.Q.value = 1

    // --- Delay (with feedback loop) ---
    this.delayNode = audioCtx.createDelay(2)
    this.delayNode.delayTime.value = 0.35
    this.delayFeedback = audioCtx.createGain()
    this.delayFeedback.gain.value = 0.4
    this.delayDry = audioCtx.createGain()
    this.delayDry.gain.value = 1
    this.delayWet = audioCtx.createGain()
    this.delayWet.gain.value = 0

    // Delay feedback loop
    this.delayNode.connect(this.delayFeedback)
    this.delayFeedback.connect(this.delayNode)
    this.delayNode.connect(this.delayWet)

    // --- Reverb (impulse response) ---
    this.reverbConvolver = audioCtx.createConvolver()
    this.reverbDry = audioCtx.createGain()
    this.reverbDry.gain.value = 1
    this.reverbWet = audioCtx.createGain()
    this.reverbWet.gain.value = 0

    // Generate a simple reverb impulse response
    this.reverbConvolver.buffer = this.createReverbImpulse(audioCtx, 2, 2)

    // --- Flanger (modulated delay) ---
    this.flangerDelay = audioCtx.createDelay(0.02)
    this.flangerDelay.delayTime.value = 0.003
    this.flangerDepth = audioCtx.createGain()
    this.flangerDepth.gain.value = 0.003
    this.flangerLFO = audioCtx.createOscillator()
    this.flangerLFO.type = 'sine'
    this.flangerLFO.frequency.value = 0.5
    this.flangerLFO.connect(this.flangerDepth)
    this.flangerDepth.connect(this.flangerDelay.delayTime)
    this.flangerLFO.start()

    // Default: bypass everything (input → output direct)
    this.input.connect(this.output)

    this.initialized = true
  }

  /** Get the input node to connect audio source to */
  getInput(): GainNode | null { return this.input }

  /** Get the output node to connect to destination */
  getOutput(): GainNode | null { return this.output }

  /** Get current effect state */
  getState(): EffectState { return JSON.parse(JSON.stringify(this.state)) }

  // ---------------------------------------------------------------------------
  // Filter
  // ---------------------------------------------------------------------------

  setFilterActive(active: boolean) {
    this.state.filter.active = active
    this.rebuildChain()
  }

  setFilterType(type: 'lowpass' | 'highpass') {
    this.state.filter.type = type
    if (this.filterNode) this.filterNode.type = type
  }

  setFilterFrequency(freq: number) {
    this.state.filter.frequency = freq
    if (this.filterNode && this.audioCtx) {
      this.filterNode.frequency.setTargetAtTime(freq, this.audioCtx.currentTime, 0.02)
    }
  }

  // ---------------------------------------------------------------------------
  // Delay
  // ---------------------------------------------------------------------------

  setDelayActive(active: boolean) {
    this.state.delay.active = active
    if (this.delayWet && this.delayDry && this.audioCtx) {
      this.delayWet.gain.setTargetAtTime(active ? 0.5 : 0, this.audioCtx.currentTime, 0.02)
    }
    this.rebuildChain()
  }

  setDelayTime(time: number) {
    this.state.delay.time = time
    if (this.delayNode && this.audioCtx) {
      this.delayNode.delayTime.setTargetAtTime(time, this.audioCtx.currentTime, 0.02)
    }
  }

  setDelayFeedback(feedback: number) {
    this.state.delay.feedback = Math.min(0.9, feedback) // cap at 0.9 to prevent runaway
    if (this.delayFeedback && this.audioCtx) {
      this.delayFeedback.gain.setTargetAtTime(this.state.delay.feedback, this.audioCtx.currentTime, 0.02)
    }
  }

  // ---------------------------------------------------------------------------
  // Reverb
  // ---------------------------------------------------------------------------

  setReverbActive(active: boolean) {
    this.state.reverb.active = active
    if (this.reverbWet && this.reverbDry && this.audioCtx) {
      this.reverbWet.gain.setTargetAtTime(active ? this.state.reverb.mix : 0, this.audioCtx.currentTime, 0.02)
      this.reverbDry.gain.setTargetAtTime(active ? 1 - this.state.reverb.mix : 1, this.audioCtx.currentTime, 0.02)
    }
    this.rebuildChain()
  }

  setReverbMix(mix: number) {
    this.state.reverb.mix = mix
    if (this.state.reverb.active && this.reverbWet && this.reverbDry && this.audioCtx) {
      this.reverbWet.gain.setTargetAtTime(mix, this.audioCtx.currentTime, 0.02)
      this.reverbDry.gain.setTargetAtTime(1 - mix, this.audioCtx.currentTime, 0.02)
    }
  }

  // ---------------------------------------------------------------------------
  // Flanger
  // ---------------------------------------------------------------------------

  setFlangerActive(active: boolean) {
    this.state.flanger.active = active
    this.rebuildChain()
  }

  setFlangerDepth(depth: number) {
    this.state.flanger.depth = depth
    if (this.flangerDepth && this.audioCtx) {
      this.flangerDepth.gain.setTargetAtTime(depth / 1000, this.audioCtx.currentTime, 0.02)
    }
  }

  setFlangerRate(rate: number) {
    this.state.flanger.rate = rate
    if (this.flangerLFO && this.audioCtx) {
      this.flangerLFO.frequency.setTargetAtTime(rate, this.audioCtx.currentTime, 0.02)
    }
  }

  // ---------------------------------------------------------------------------
  // Chain rebuild — connect only active effects
  // ---------------------------------------------------------------------------

  private rebuildChain() {
    if (!this.input || !this.output || !this.audioCtx) return

    // Disconnect everything from input
    this.input.disconnect()

    let current: AudioNode = this.input

    // Filter
    if (this.state.filter.active && this.filterNode) {
      current.connect(this.filterNode)
      current = this.filterNode
    }

    // Flanger
    if (this.state.flanger.active && this.flangerDelay) {
      current.connect(this.flangerDelay)
      // Mix flanger with dry signal
      current.connect(this.output) // dry
      this.flangerDelay.connect(this.output) // wet
      return // early return — flanger is parallel
    }

    // Delay
    if (this.state.delay.active && this.delayNode && this.delayDry && this.delayWet) {
      current.connect(this.delayNode)
      current.connect(this.delayDry)
      this.delayDry.connect(this.output)
      this.delayWet.connect(this.output)
      return
    }

    // Reverb
    if (this.state.reverb.active && this.reverbConvolver && this.reverbDry && this.reverbWet) {
      current.connect(this.reverbConvolver)
      this.reverbConvolver.connect(this.reverbWet)
      current.connect(this.reverbDry)
      this.reverbDry.connect(this.output)
      this.reverbWet.connect(this.output)
      return
    }

    // No effects active — straight through
    current.connect(this.output)
  }

  // ---------------------------------------------------------------------------
  // Reverb impulse response generator
  // ---------------------------------------------------------------------------

  private createReverbImpulse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
    const sampleRate = ctx.sampleRate
    const length = sampleRate * duration
    const buffer = ctx.createBuffer(2, length, sampleRate)

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel)
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
      }
    }

    return buffer
  }

  disconnect() {
    this.flangerLFO?.stop()
    this.input?.disconnect()
    this.output?.disconnect()
    this.filterNode?.disconnect()
    this.delayNode?.disconnect()
    this.delayFeedback?.disconnect()
    this.reverbConvolver?.disconnect()
    this.flangerDelay?.disconnect()
    this.initialized = false
  }
}
