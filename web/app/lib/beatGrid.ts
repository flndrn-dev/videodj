/**
 * Beat Grid Detection
 *
 * Analyzes audio to find the exact timing of every beat in a track.
 * Used for beat-synced transitions in automix.
 *
 * Approach:
 * 1. Decode audio buffer
 * 2. Onset detection via energy flux in low-frequency band
 * 3. Find the first downbeat and spacing
 * 4. Build a grid of beat timestamps
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BeatGrid {
  /** BPM detected from the grid */
  bpm: number
  /** Time of the first beat (seconds) */
  firstBeat: number
  /** Interval between beats (seconds) */
  beatInterval: number
  /** Array of beat timestamps (seconds) */
  beats: number[]
  /** Number of bars (4 beats per bar) */
  barCount: number
}

export interface TrackSection {
  type: 'intro' | 'verse' | 'chorus' | 'breakdown' | 'buildup' | 'drop' | 'outro'
  startTime: number
  endTime: number
  startBeat: number
  endBeat: number
  energy: number // 0-1 average energy
}

// ---------------------------------------------------------------------------
// Beat detection via onset energy flux
// ---------------------------------------------------------------------------

/**
 * Detect beat positions in an audio buffer.
 * Returns a BeatGrid with exact beat timestamps.
 */
export async function detectBeatGrid(file: File | Blob, knownBpm?: number): Promise<BeatGrid | null> {
  try {
    const audioCtx = new OfflineAudioContext(1, 1, 44100) // dummy for decoding
    const arrayBuffer = await file.arrayBuffer()

    // Use a real AudioContext to decode (OfflineAudioContext.decodeAudioData not always available)
    const decodeCtx = new AudioContext()
    const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer)
    decodeCtx.close()

    const channelData = audioBuffer.getChannelData(0)
    const sampleRate = audioBuffer.sampleRate
    const duration = audioBuffer.duration

    // --- Step 1: Compute onset detection function ---
    // Use energy in low-frequency band (kick drum detection)
    const hopSize = Math.floor(sampleRate / 100) // 10ms hops
    const windowSize = Math.floor(sampleRate / 20) // 50ms windows
    const energies: number[] = []

    for (let i = 0; i < channelData.length - windowSize; i += hopSize) {
      let energy = 0
      for (let j = 0; j < windowSize; j++) {
        energy += channelData[i + j] * channelData[i + j]
      }
      energies.push(energy / windowSize)
    }

    // --- Step 2: Spectral flux (energy difference) ---
    const flux: number[] = [0]
    for (let i = 1; i < energies.length; i++) {
      const diff = energies[i] - energies[i - 1]
      flux.push(diff > 0 ? diff : 0) // half-wave rectify
    }

    // --- Step 3: Peak picking with adaptive threshold ---
    const peakWindow = 8 // ~80ms
    const onsets: number[] = []

    for (let i = peakWindow; i < flux.length - peakWindow; i++) {
      // Local mean + threshold
      let localSum = 0
      for (let j = -peakWindow; j <= peakWindow; j++) {
        localSum += flux[i + j]
      }
      const localMean = localSum / (peakWindow * 2 + 1)
      const threshold = localMean * 1.5

      // Is this a peak?
      if (flux[i] > threshold && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1]) {
        const time = (i * hopSize) / sampleRate
        // Minimum inter-onset interval: 200ms (300 BPM max)
        if (onsets.length === 0 || time - onsets[onsets.length - 1] > 0.2) {
          onsets.push(time)
        }
      }
    }

    if (onsets.length < 4) {
      audioCtx.oncomplete = null
      return null
    }

    // --- Step 4: Find the dominant interval (BPM) ---
    const intervals: number[] = []
    for (let i = 1; i < onsets.length; i++) {
      intervals.push(onsets[i] - onsets[i - 1])
    }

    // Histogram of intervals (quantized to 5ms bins)
    const histogram = new Map<number, number>()
    for (const interval of intervals) {
      const bin = Math.round(interval * 200) / 200 // 5ms bins
      histogram.set(bin, (histogram.get(bin) || 0) + 1)
    }

    // Find the most common interval
    let bestInterval = 0
    let bestCount = 0
    for (const [interval, count] of histogram) {
      if (count > bestCount && interval > 0.25 && interval < 1.5) { // 40-240 BPM range
        bestCount = count
        bestInterval = interval
      }
    }

    if (bestInterval === 0) return null

    let bpm = Math.round(60 / bestInterval)

    // Use known BPM if provided (more reliable than detection)
    if (knownBpm && knownBpm > 0) {
      bpm = knownBpm
      bestInterval = 60 / bpm
    }

    // Normalize BPM to 60-200 range
    while (bpm > 200) { bpm = Math.round(bpm / 2); bestInterval *= 2 }
    while (bpm < 60) { bpm = Math.round(bpm * 2); bestInterval /= 2 }

    // --- Step 5: Find the first downbeat ---
    // Find the onset closest to a grid line
    let bestOffset = 0
    let bestScore = -Infinity

    // Try different phase offsets
    for (let offset = 0; offset < bestInterval; offset += bestInterval / 20) {
      let score = 0
      for (const onset of onsets) {
        const nearestBeat = Math.round((onset - offset) / bestInterval) * bestInterval + offset
        const dist = Math.abs(onset - nearestBeat)
        if (dist < bestInterval * 0.15) {
          score += 1
        }
      }
      if (score > bestScore) {
        bestScore = score
        bestOffset = offset
      }
    }

    // --- Step 6: Build the beat grid ---
    const beats: number[] = []
    let t = bestOffset
    while (t < duration) {
      beats.push(t)
      t += bestInterval
    }

    return {
      bpm,
      firstBeat: bestOffset,
      beatInterval: bestInterval,
      beats,
      barCount: Math.floor(beats.length / 4),
    }
  } catch (e) {
    console.warn('[BeatGrid] Detection failed:', e)
    return null
  }
}

// ---------------------------------------------------------------------------
// Section detection (energy-based)
// ---------------------------------------------------------------------------

/**
 * Detect structural sections of a track based on energy changes.
 * Uses the beat grid for timing alignment.
 */
export function detectSections(
  beatGrid: BeatGrid,
  energyProfile: number[], // energy per beat
): TrackSection[] {
  if (!beatGrid || energyProfile.length < 8) return []

  const sections: TrackSection[] = []
  const beatsPerBar = 4
  const barsPerPhrase = 8 // typical phrase = 8 bars = 32 beats

  // Compute energy per phrase (8 bars)
  const phraseEnergies: number[] = []
  const phraseLength = beatsPerBar * barsPerPhrase
  for (let i = 0; i < energyProfile.length; i += phraseLength) {
    const slice = energyProfile.slice(i, i + phraseLength)
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length
    phraseEnergies.push(avg)
  }

  if (phraseEnergies.length === 0) return []

  // Normalize energies to 0-1
  const maxEnergy = Math.max(...phraseEnergies)
  const normalizedEnergies = phraseEnergies.map(e => maxEnergy > 0 ? e / maxEnergy : 0)

  // Classify sections based on energy level and position
  const totalPhrases = normalizedEnergies.length

  for (let i = 0; i < totalPhrases; i++) {
    const energy = normalizedEnergies[i]
    const position = i / totalPhrases // 0-1 position in track
    const startBeat = i * phraseLength
    const endBeat = Math.min(startBeat + phraseLength, beatGrid.beats.length - 1)

    let type: TrackSection['type']

    if (position < 0.1) {
      type = 'intro'
    } else if (position > 0.9) {
      type = 'outro'
    } else if (energy > 0.75) {
      // Check if previous was low energy → this is a drop
      if (i > 0 && normalizedEnergies[i - 1] < 0.5) {
        type = 'drop'
      } else {
        type = 'chorus'
      }
    } else if (energy < 0.35) {
      type = 'breakdown'
    } else if (i > 0 && normalizedEnergies[i - 1] < energy && energy < 0.75) {
      type = 'buildup'
    } else {
      type = 'verse'
    }

    sections.push({
      type,
      startTime: beatGrid.beats[startBeat] || 0,
      endTime: beatGrid.beats[endBeat] || beatGrid.beats[beatGrid.beats.length - 1],
      startBeat,
      endBeat,
      energy,
    })
  }

  // Merge adjacent sections of the same type
  const merged: TrackSection[] = []
  for (const section of sections) {
    if (merged.length > 0 && merged[merged.length - 1].type === section.type) {
      merged[merged.length - 1].endTime = section.endTime
      merged[merged.length - 1].endBeat = section.endBeat
      merged[merged.length - 1].energy = (merged[merged.length - 1].energy + section.energy) / 2
    } else {
      merged.push({ ...section })
    }
  }

  return merged
}

/**
 * Compute energy per beat from audio data.
 * Returns an array where each element is the RMS energy at that beat.
 */
export async function computeEnergyPerBeat(file: File | Blob, beatGrid: BeatGrid): Promise<number[]> {
  try {
    const decodeCtx = new AudioContext()
    const arrayBuffer = await file.arrayBuffer()
    const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer)
    decodeCtx.close()

    const channelData = audioBuffer.getChannelData(0)
    const sampleRate = audioBuffer.sampleRate

    const energies: number[] = []
    const halfBeat = beatGrid.beatInterval / 2

    for (const beatTime of beatGrid.beats) {
      const startSample = Math.floor(Math.max(0, (beatTime - halfBeat)) * sampleRate)
      const endSample = Math.floor(Math.min(channelData.length, (beatTime + halfBeat) * sampleRate))

      let sum = 0
      for (let i = startSample; i < endSample; i++) {
        sum += channelData[i] * channelData[i]
      }
      energies.push(Math.sqrt(sum / (endSample - startSample || 1)))
    }

    return energies
  } catch {
    return []
  }
}

/**
 * Find the best mix-out point for a track (where to start fading out).
 * Prefers the start of the last chorus/outro or a breakdown.
 */
export function findMixOutPoint(sections: TrackSection[], beatGrid: BeatGrid): number {
  // Look for outro
  const outro = sections.find(s => s.type === 'outro')
  if (outro) return outro.startTime

  // Look for last breakdown (good transition point)
  const breakdowns = sections.filter(s => s.type === 'breakdown')
  if (breakdowns.length > 0) {
    const last = breakdowns[breakdowns.length - 1]
    // Only use if it's in the last 30% of the track
    const duration = beatGrid.beats[beatGrid.beats.length - 1]
    if (last.startTime > duration * 0.7) return last.startTime
  }

  // Fallback: last 16 beats (4 bars) before end
  const fallbackBeat = Math.max(0, beatGrid.beats.length - 16)
  return beatGrid.beats[fallbackBeat] || 0
}

/**
 * Find the best mix-in point for a track (where to start bringing it in).
 * Prefers after the intro or at the start of the first verse.
 */
export function findMixInPoint(sections: TrackSection[]): number {
  // Look for intro end
  const intro = sections.find(s => s.type === 'intro')
  if (intro) return intro.startTime // mix in FROM the intro

  // Fallback: start of track
  return 0
}
