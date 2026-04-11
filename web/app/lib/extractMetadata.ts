/**
 * Extract metadata from a video/audio File.
 *
 * 1. Uses music-metadata-browser to read ID3/Vorbis tags (BPM, artist, genre, key, etc.)
 * 2. Uses a hidden <video> element for duration + thumbnail capture
 * 3. Falls back to Web Audio API beat detection if no BPM in tags
 */

import { parseBlob } from 'music-metadata-browser'

export interface VideoMeta {
  duration: number
  thumbnail: string
  bpm: number
  key: string
  artist: string
  album: string
  genre: string
  language: string | null
  /** RMS loudness (0-1) for auto-gain matching */
  loudness?: number
  /** Timestamp (seconds) where music effectively ends (before silence/credits) */
  effectiveEndTime?: number
  /** Timestamp (seconds) where music effectively starts (after silence/intro) */
  effectiveStartTime?: number
}

// ---------------------------------------------------------------------------
// Tag-based metadata extraction
// ---------------------------------------------------------------------------

async function extractTags(file: File): Promise<Partial<VideoMeta>> {
  try {
    const metadata = await parseBlob(file, { duration: true })
    const { common, format } = metadata

    // BPM can be in common.bpm or in TBPM tag
    const bpm = common.bpm ? Math.round(common.bpm) : 0

    // Musical key (e.g. "Am", "Cmaj") — stored in common.key or initialkey
    const key = common.key || ''

    // Artist
    const artist = common.artist || ''

    // Album
    const album = common.album || ''

    // Genre — join array
    const genre = common.genre?.join(', ') || ''

    // Language
    const language = common.language || null

    return {
      bpm,
      key,
      artist,
      album,
      genre,
      language,
      duration: format.duration ? Math.round(format.duration) : 0,
    }
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Video element: duration + thumbnail
// ---------------------------------------------------------------------------

function extractFromVideoElement(file: File): Promise<{ duration: number; thumbnail: string }> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true

    const url = URL.createObjectURL(file)
    video.src = url

    let resolved = false
    function done(duration: number, thumbnail: string) {
      if (resolved) return
      resolved = true
      URL.revokeObjectURL(url)
      video.remove()
      resolve({ duration, thumbnail })
    }

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, video.duration * 0.1)
    }

    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 120
      canvas.height = 68
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      done(Math.round(video.duration), canvas.toDataURL('image/jpeg', 0.6))
    }

    video.onerror = () => done(0, '')
    setTimeout(() => done(Math.round(video.duration || 0), ''), 5000)
  })
}

// ---------------------------------------------------------------------------
// Web Audio API BPM detection (peak interval analysis)
// ---------------------------------------------------------------------------

export async function detectBPM(file: File): Promise<number> {
  try {
    const audioContext = new AudioContext()
    const arrayBuffer = await file.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

    // Get mono channel data
    const channelData = audioBuffer.getChannelData(0)
    const sampleRate = audioBuffer.sampleRate

    // Use only first 30 seconds for speed
    const samples = Math.min(channelData.length, sampleRate * 30)

    // Low-pass filter simulation: average over small windows
    const windowSize = Math.floor(sampleRate / 20) // ~50ms windows
    const energies: number[] = []
    for (let i = 0; i < samples - windowSize; i += windowSize) {
      let sum = 0
      for (let j = 0; j < windowSize; j++) {
        sum += channelData[i + j] * channelData[i + j]
      }
      energies.push(sum / windowSize)
    }

    // Find peaks (energy above 1.3x local average)
    const peaks: number[] = []
    const localWindow = 8
    for (let i = localWindow; i < energies.length - localWindow; i++) {
      let localSum = 0
      for (let j = -localWindow; j <= localWindow; j++) {
        localSum += energies[i + j]
      }
      const localAvg = localSum / (localWindow * 2 + 1)

      if (energies[i] > localAvg * 1.3 && energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) {
        peaks.push(i)
      }
    }

    if (peaks.length < 2) {
      audioContext.close()
      return 0
    }

    // Calculate intervals between peaks
    const intervals: number[] = []
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i] - peaks[i - 1])
    }

    // Find most common interval (histogram approach)
    const histogram = new Map<number, number>()
    for (const interval of intervals) {
      // Group similar intervals (±1)
      const rounded = Math.round(interval)
      histogram.set(rounded, (histogram.get(rounded) || 0) + 1)
    }

    // Get the most frequent interval
    let bestInterval = 0
    let bestCount = 0
    for (const [interval, count] of histogram) {
      if (count > bestCount) {
        bestCount = count
        bestInterval = interval
      }
    }

    if (bestInterval === 0) {
      audioContext.close()
      return 0
    }

    // Convert interval (in windowSize units) to BPM
    const secondsPerBeat = (bestInterval * windowSize) / sampleRate
    let bpm = Math.round(60 / secondsPerBeat)

    // Normalize to reasonable range (60-200 BPM)
    while (bpm > 200) bpm = Math.round(bpm / 2)
    while (bpm < 60) bpm = Math.round(bpm * 2)

    audioContext.close()
    return bpm
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Musical key detection (Krumhansl-Schmuckler algorithm)
// Analyzes pitch class distribution and matches against key profiles.
// Returns Camelot notation (1A–12B) like Beatport/Rekordbox.
// ---------------------------------------------------------------------------

// Krumhansl-Kessler key profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

// Pitch class names → Camelot wheel mapping
// Major keys: C=8B, Db=3B, D=10B, Eb=5B, E=12B, F=7B, F#=2B, G=9B, Ab=4B, A=11B, Bb=6B, B=1B
// Minor keys: C=5A, C#=12A, D=7A, Eb=2A, E=9A, F=4A, F#=11A, G=6A, Ab=1A, A=8A, Bb=3A, B=10A
const CAMELOT_MAJOR = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B']
const CAMELOT_MINOR = ['5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A']

function correlate(chromagram: number[], profile: number[]): number {
  const n = profile.length
  let sumXY = 0, sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0
  for (let i = 0; i < n; i++) {
    sumXY += chromagram[i] * profile[i]
    sumX += chromagram[i]
    sumY += profile[i]
    sumX2 += chromagram[i] * chromagram[i]
    sumY2 += profile[i] * profile[i]
  }
  const num = n * sumXY - sumX * sumY
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))
  return den === 0 ? 0 : num / den
}

export async function detectKey(file: File): Promise<string> {
  try {
    const audioContext = new AudioContext()
    const arrayBuffer = await file.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

    const channelData = audioBuffer.getChannelData(0)
    const sampleRate = audioBuffer.sampleRate

    // Use 30 seconds from the middle of the track (more melodic content)
    const startSample = Math.floor(Math.max(0, (channelData.length - sampleRate * 30) / 2))
    const numSamples = Math.min(channelData.length - startSample, sampleRate * 30)

    // Compute FFT using OfflineAudioContext for precise analysis
    const offlineCtx = new OfflineAudioContext(1, numSamples, sampleRate)
    const buffer = offlineCtx.createBuffer(1, numSamples, sampleRate)
    const bufferData = buffer.getChannelData(0)
    for (let i = 0; i < numSamples; i++) {
      bufferData[i] = channelData[startSample + i]
    }

    const source = offlineCtx.createBufferSource()
    source.buffer = buffer

    const analyser = offlineCtx.createAnalyser()
    analyser.fftSize = 8192
    source.connect(analyser)
    analyser.connect(offlineCtx.destination)
    source.start(0)

    await offlineCtx.startRendering()

    // Get frequency data
    const freqData = new Float32Array(analyser.frequencyBinCount)
    analyser.getFloatFrequencyData(freqData)

    // Build chromagram: sum energy for each pitch class (C, C#, D, ... B)
    const chromagram = new Array(12).fill(0)
    const binFreqStep = sampleRate / analyser.fftSize

    for (let bin = 1; bin < freqData.length; bin++) {
      const freq = bin * binFreqStep
      if (freq < 60 || freq > 2000) continue // musical range

      const magnitude = Math.pow(10, freqData[bin] / 20) // dB to linear
      if (magnitude <= 0) continue

      // Convert frequency to pitch class (0=C, 1=C#, ..., 11=B)
      const midiNote = 12 * Math.log2(freq / 440) + 69
      const pitchClass = Math.round(midiNote) % 12

      chromagram[pitchClass] += magnitude * magnitude
    }

    // Correlate chromagram against all 24 key profiles (12 major + 12 minor)
    let bestKey = ''
    let bestCorr = -Infinity

    for (let shift = 0; shift < 12; shift++) {
      // Rotate chromagram
      const rotated = [...chromagram.slice(shift), ...chromagram.slice(0, shift)]

      const majorCorr = correlate(rotated, MAJOR_PROFILE)
      if (majorCorr > bestCorr) {
        bestCorr = majorCorr
        bestKey = CAMELOT_MAJOR[shift]
      }

      const minorCorr = correlate(rotated, MINOR_PROFILE)
      if (minorCorr > bestCorr) {
        bestCorr = minorCorr
        bestKey = CAMELOT_MINOR[shift]
      }
    }

    audioContext.close()
    return bestKey
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Loudness analysis — RMS for auto-gain matching
// ---------------------------------------------------------------------------

async function measureLoudness(file: File): Promise<number> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const ctx = new AudioContext()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    const channelData = audioBuffer.getChannelData(0)

    // Calculate RMS of the entire track
    let sumSquares = 0
    for (let i = 0; i < channelData.length; i++) {
      sumSquares += channelData[i] * channelData[i]
    }
    const rms = Math.sqrt(sumSquares / channelData.length)
    ctx.close()
    return rms
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Effective start detection — find where music actually begins
// ---------------------------------------------------------------------------

async function detectEffectiveStart(file: File): Promise<number | null> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const ctx = new AudioContext()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    const channelData = audioBuffer.getChannelData(0)
    const sampleRate = audioBuffer.sampleRate

    // Analyze first 30 seconds in 0.5-second windows, walking forward
    const windowSamples = Math.floor(sampleRate * 0.5) // 0.5 seconds
    const maxSample = Math.min(channelData.length, sampleRate * 30) // first 30s
    const MUSIC_THRESHOLD = 0.01 // above this RMS = music has started

    let effectiveStart = 0

    for (let i = 0; i < maxSample; i += windowSamples) {
      let sum = 0
      const end = Math.min(i + windowSamples, channelData.length)
      for (let j = i; j < end; j++) {
        sum += channelData[j] * channelData[j]
      }
      const rms = Math.sqrt(sum / (end - i))
      if (rms > MUSIC_THRESHOLD) {
        // Found the first window with music — back up slightly for a clean start
        effectiveStart = Math.max(0, i / sampleRate - 0.2)
        break
      }
    }

    ctx.close()
    // Only return if we're trimming more than 1 second of silence
    return effectiveStart > 1 ? Math.round(effectiveStart * 10) / 10 : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Effective end detection — find where music actually stops
// ---------------------------------------------------------------------------

async function detectEffectiveEnd(file: File): Promise<number | null> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const ctx = new AudioContext()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    const channelData = audioBuffer.getChannelData(0)
    const sampleRate = audioBuffer.sampleRate
    const duration = audioBuffer.duration

    // Analyze last 60 seconds in 1-second windows, walking backwards
    const windowSamples = sampleRate // 1 second
    const startSec = Math.max(0, duration - 60)
    const startSample = Math.floor(startSec * sampleRate)
    const SILENCE_THRESHOLD = 0.005 // very quiet

    let effectiveEnd = duration

    for (let i = channelData.length - windowSamples; i >= startSample; i -= windowSamples) {
      let sum = 0
      const end = Math.min(i + windowSamples, channelData.length)
      for (let j = i; j < end; j++) {
        sum += channelData[j] * channelData[j]
      }
      const rms = Math.sqrt(sum / (end - i))
      if (rms > SILENCE_THRESHOLD) {
        effectiveEnd = (i + windowSamples) / sampleRate
        break
      }
    }

    ctx.close()
    // Only return if we trimmed more than 3 seconds of silence
    return (duration - effectiveEnd) > 3 ? Math.round(effectiveEnd) : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Fast extraction — tags + video element only. No audio decode.
// ---------------------------------------------------------------------------

/** Fast extraction — reads ID3/Vorbis tags + video element for duration/thumbnail.
 *  No audio decode. Returns in < 1 second per file. */
export async function extractFastMetadata(file: File): Promise<VideoMeta> {
  const [tags, videoInfo] = await Promise.all([
    extractTags(file),
    extractFromVideoElement(file),
  ])

  return {
    duration: tags.duration || videoInfo.duration,
    thumbnail: videoInfo.thumbnail,
    bpm: tags.bpm || 0,
    key: tags.key || '',
    artist: tags.artist || '',
    album: tags.album || '',
    genre: tags.genre || '',
    language: tags.language?.toUpperCase() || null,
  }
}

// ---------------------------------------------------------------------------
// Heavy extraction — full audio analysis. Call on-demand, NOT during scan.
// ---------------------------------------------------------------------------

/** Heavy extraction — full audio decode for BPM, key, loudness, effective start/end.
 *  Call on-demand (e.g. /fix bpm, /fix keys), NOT during folder scan. */
export async function extractHeavyMetadata(file: File): Promise<{
  bpm: number; key: string; loudness: number;
  effectiveStartTime?: number; effectiveEndTime?: number;
}> {
  const [bpm, key, loudness, effectiveEnd, effectiveStart] = await Promise.all([
    detectBPM(file),
    detectKey(file),
    measureLoudness(file),
    detectEffectiveEnd(file),
    detectEffectiveStart(file),
  ])

  return {
    bpm,
    key,
    loudness,
    effectiveStartTime: effectiveStart || undefined,
    effectiveEndTime: effectiveEnd || undefined,
  }
}

// ---------------------------------------------------------------------------
// Legacy compat — now just calls fast extraction
// ---------------------------------------------------------------------------

/** @deprecated Use extractFastMetadata instead */
export async function extractVideoMetadata(file: File): Promise<VideoMeta> {
  return extractFastMetadata(file)
}
