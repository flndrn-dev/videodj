// ---------------------------------------------------------------------------
// Shared format utilities for videoDJ.Studio
// ---------------------------------------------------------------------------

/**
 * Format seconds into M:SS display string.
 * @example formatDuration(210) → "3:30"
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = String(Math.floor(seconds % 60)).padStart(2, '0')
  return `${m}:${s}`
}

/**
 * Format BPM value, rounding to nearest integer.
 * @example formatBpm(120.4) → "120 BPM"
 */
export function formatBpm(bpm: number): string {
  if (!bpm) return '-- BPM'
  return `${Math.round(bpm)} BPM`
}

/**
 * Format track count.
 * @example formatTrackCount(1) → "1 track"
 */
export function formatTrackCount(count: number): string {
  return count === 1 ? '1 track' : `${count} tracks`
}

/**
 * Truncate a string with ellipsis if over maxLen.
 */
export function truncate(str: string, maxLen: number): string {
  if (!str) return ''
  return str.length > maxLen ? `${str.slice(0, maxLen - 1)}…` : str
}

/**
 * Detect likely language from a track title/artist.
 * Very lightweight — no dict lookup, just heuristics.
 */
export function detectLanguageLabel(language: string | undefined): string {
  switch (language?.toLowerCase()) {
    case 'nl': return '🇧🇪 NL'
    case 'en': return '🇬🇧 EN'
    case 'fr': return '🇫🇷 FR'
    case 'de': return '🇩🇪 DE'
    case 'es': return '🇪🇸 ES'
    default: return language?.toUpperCase() ?? ''
  }
}

/**
 * Format file size in human-readable form.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
