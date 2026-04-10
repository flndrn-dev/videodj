/**
 * MusicBrainz + Discogs metadata lookup.
 *
 * Searches MusicBrainz for track metadata (artist, album, release year, genre).
 * Falls back to Discogs for genre/style when MusicBrainz lacks it.
 *
 * Both APIs are free, no API key required for MusicBrainz.
 * Discogs requires a user-agent but no key for search.
 */

const USER_AGENT = 'videoDJ.Studio/1.0 (https://github.com/flndrn-dev/videodj)'
const MB_BASE = 'https://musicbrainz.org/ws/2'
const DISCOGS_BASE = 'https://api.discogs.com'

// Rate limiting: MusicBrainz allows 1 req/sec, Discogs 60/min
let lastMBRequest = 0
let lastDiscogsRequest = 0

async function rateLimitMB() {
  const now = Date.now()
  const wait = Math.max(0, 1100 - (now - lastMBRequest))
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastMBRequest = Date.now()
}

async function rateLimitDiscogs() {
  const now = Date.now()
  const wait = Math.max(0, 1100 - (now - lastDiscogsRequest))
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastDiscogsRequest = Date.now()
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LookupResult {
  title?: string
  artist?: string
  album?: string
  released?: string
  genre?: string
  language?: string
  source: 'musicbrainz' | 'discogs' | 'combined'
}

// ---------------------------------------------------------------------------
// MusicBrainz lookup
// ---------------------------------------------------------------------------

interface MBRecording {
  id: string
  title: string
  'artist-credit'?: { name: string; artist: { name: string } }[]
  releases?: {
    id: string
    title: string
    date?: string
    'release-group'?: {
      'primary-type'?: string
    }
    country?: string
  }[]
  tags?: { name: string; count: number }[]
}

export async function searchMusicBrainz(title: string, artist?: string): Promise<LookupResult | null> {
  await rateLimitMB()

  const query = artist
    ? `recording:"${encodeURIComponent(title)}" AND artist:"${encodeURIComponent(artist)}"`
    : `recording:"${encodeURIComponent(title)}"`

  try {
    const res = await fetch(
      `${MB_BASE}/recording?query=${query}&limit=5&fmt=json`,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }
    )
    if (!res.ok) return null

    const data = await res.json()
    const recordings: MBRecording[] = data.recordings || []
    if (recordings.length === 0) return null

    // Pick best match — prefer exact title match
    const titleLower = title.toLowerCase()
    const match = recordings.find(r => r.title.toLowerCase() === titleLower) || recordings[0]

    const result: LookupResult = { source: 'musicbrainz' }

    result.title = match.title
    if (match['artist-credit']?.[0]) {
      result.artist = match['artist-credit'][0].name
    }

    // Get album + release year from first release
    if (match.releases?.[0]) {
      const release = match.releases[0]
      result.album = release.title
      if (release.date) {
        result.released = release.date.slice(0, 4) // YYYY
      }
    }

    // Tags → genre (MusicBrainz tags are crowd-sourced, pick highest count)
    if (match.tags && match.tags.length > 0) {
      const sorted = [...match.tags].sort((a, b) => b.count - a.count)
      result.genre = sorted[0].name
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    }

    return result
  } catch (e) {
    console.warn('[MusicBrainz] Search failed:', e)
    return null
  }
}

// ---------------------------------------------------------------------------
// Discogs lookup (for genre/style enrichment)
// ---------------------------------------------------------------------------

interface DiscogsResult {
  title: string
  year?: string
  genre?: string[]
  style?: string[]
  country?: string
}

export async function searchDiscogs(title: string, artist?: string): Promise<LookupResult | null> {
  await rateLimitDiscogs()

  const query = artist ? `${artist} ${title}` : title

  try {
    const res = await fetch(
      `${DISCOGS_BASE}/database/search?q=${encodeURIComponent(query)}&type=release&per_page=5`,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }
    )
    if (!res.ok) return null

    const data = await res.json()
    const results: DiscogsResult[] = data.results || []
    if (results.length === 0) return null

    const match = results[0]
    const result: LookupResult = { source: 'discogs' }

    // Discogs title is "Artist - Title"
    if (match.title?.includes(' - ')) {
      const [discArtist, discTitle] = match.title.split(' - ', 2)
      result.artist = discArtist.trim()
      result.title = discTitle.trim()
    }

    if (match.year) result.released = String(match.year)

    // Discogs has both genre and style — style is more specific
    if (match.style?.length) {
      result.genre = match.style[0]
    } else if (match.genre?.length) {
      result.genre = match.genre[0]
    }

    if (match.country) {
      // Map common countries to language codes
      const countryToLang: Record<string, string> = {
        'US': 'EN', 'UK': 'EN', 'Netherlands': 'NL', 'Germany': 'DE',
        'France': 'FR', 'Spain': 'ES', 'Italy': 'IT', 'Brazil': 'PT',
        'Japan': 'JA', 'South Korea': 'KO', 'Sweden': 'SV',
      }
      result.language = countryToLang[match.country] || undefined
    }

    return result
  } catch (e) {
    console.warn('[Discogs] Search failed:', e)
    return null
  }
}

// ---------------------------------------------------------------------------
// Combined lookup — MusicBrainz first, enrich with Discogs
// ---------------------------------------------------------------------------

export async function lookupMetadata(title: string, artist?: string): Promise<LookupResult | null> {
  // Try MusicBrainz first (more structured data)
  const mbResult = await searchMusicBrainz(title, artist)

  // If we got a good result with genre, return it
  if (mbResult?.genre && mbResult?.album && mbResult?.released) {
    return mbResult
  }

  // Try Discogs for missing fields
  const dcResult = await searchDiscogs(title, artist)

  if (!mbResult && !dcResult) return null
  if (!mbResult) return dcResult
  if (!dcResult) return mbResult

  // Merge: MusicBrainz as base, Discogs fills gaps
  return {
    title: mbResult.title || dcResult.title,
    artist: mbResult.artist || dcResult.artist,
    album: mbResult.album || dcResult.album,
    released: mbResult.released || dcResult.released,
    genre: mbResult.genre || dcResult.genre,
    language: mbResult.language || dcResult.language,
    source: 'combined',
  }
}

// ---------------------------------------------------------------------------
// Batch lookup for library
// ---------------------------------------------------------------------------

export interface BatchLookupProgress {
  current: number
  total: number
  trackTitle: string
}

export async function batchLookup(
  tracks: { id: string; title: string; artist: string }[],
  onProgress?: (p: BatchLookupProgress) => void,
): Promise<{ id: string; result: LookupResult }[]> {
  const results: { id: string; result: LookupResult }[] = []

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]
    onProgress?.({ current: i + 1, total: tracks.length, trackTitle: track.title })

    const result = await lookupMetadata(track.title, track.artist)
    if (result) {
      results.push({ id: track.id, result })
    }
  }

  return results
}
