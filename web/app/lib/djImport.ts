/**
 * DJ Software Import — parse Rekordbox and Serato library exports.
 *
 * Rekordbox: exports XML (rekordbox.xml) with collection + playlists.
 * Serato: exports crates as .crate files (binary) or M3U playlists.
 *
 * We parse the metadata and match tracks against our library by filename or title+artist.
 */

import type { Track } from '@/app/hooks/usePlayerStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportedTrack {
  title: string
  artist: string
  album: string
  genre: string
  bpm: number
  key: string
  rating: number
  duration: number
  filePath: string
  comments?: string
  label?: string
  year?: string
  color?: string
}

export interface ImportedPlaylist {
  name: string
  trackPaths: string[] // file paths referencing tracks in the collection
}

export interface ImportResult {
  source: 'rekordbox' | 'serato' | 'm3u'
  tracks: ImportedTrack[]
  playlists: ImportedPlaylist[]
  errors: string[]
}

// ---------------------------------------------------------------------------
// Rekordbox XML parser
// ---------------------------------------------------------------------------

export function parseRekordboxXML(xmlText: string): ImportResult {
  const result: ImportResult = { source: 'rekordbox', tracks: [], playlists: [], errors: [] }

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlText, 'text/xml')

    // Check for parse errors
    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      result.errors.push('Invalid XML: ' + parseError.textContent?.slice(0, 200))
      return result
    }

    // Parse collection tracks
    const trackNodes = doc.querySelectorAll('COLLECTION TRACK')
    for (const node of trackNodes) {
      const track: ImportedTrack = {
        title: node.getAttribute('Name') || '',
        artist: node.getAttribute('Artist') || '',
        album: node.getAttribute('Album') || '',
        genre: node.getAttribute('Genre') || '',
        bpm: parseFloat(node.getAttribute('AverageBpm') || '0') || 0,
        key: convertRekordboxKey(node.getAttribute('Tonality') || ''),
        rating: parseInt(node.getAttribute('Rating') || '0') || 0,
        duration: parseInt(node.getAttribute('TotalTime') || '0') || 0,
        filePath: decodeURIComponent(node.getAttribute('Location') || '').replace('file://localhost', ''),
        comments: node.getAttribute('Comments') || undefined,
        label: node.getAttribute('Label') || undefined,
        year: node.getAttribute('Year') || undefined,
        color: node.getAttribute('Colour') || undefined,
      }

      if (track.title || track.filePath) {
        result.tracks.push(track)
      }
    }

    // Parse playlists
    const playlistNodes = doc.querySelectorAll('PLAYLISTS NODE[Type="1"]') // Type 1 = playlist (not folder)
    for (const node of playlistNodes) {
      const name = node.getAttribute('Name') || 'Unnamed'
      const trackPaths: string[] = []

      const entries = node.querySelectorAll('TRACK')
      for (const entry of entries) {
        const key = entry.getAttribute('Key')
        if (key) {
          // Key references TrackID in collection — find the track
          const collTrack = doc.querySelector(`COLLECTION TRACK[TrackID="${key}"]`)
          if (collTrack) {
            const loc = decodeURIComponent(collTrack.getAttribute('Location') || '').replace('file://localhost', '')
            if (loc) trackPaths.push(loc)
          }
        }
      }

      if (trackPaths.length > 0) {
        result.playlists.push({ name, trackPaths })
      }
    }

  } catch (e) {
    result.errors.push(`Parse error: ${e instanceof Error ? e.message : String(e)}`)
  }

  return result
}

// ---------------------------------------------------------------------------
// Serato crate parser (.crate binary format)
// ---------------------------------------------------------------------------

export function parseSeratoCrate(buffer: ArrayBuffer, crateName: string): ImportResult {
  const result: ImportResult = { source: 'serato', tracks: [], playlists: [], errors: [] }

  try {
    const view = new DataView(buffer)
    const decoder = new TextDecoder('utf-16be')
    const trackPaths: string[] = []
    let offset = 0

    // Serato crate format: series of TLV (tag-length-value) chunks
    // 'vrsn' = version header, 'otrk' = track entry, 'ptrk' = path
    while (offset < buffer.byteLength - 8) {
      // Read 4-byte tag
      const tag = String.fromCharCode(
        view.getUint8(offset), view.getUint8(offset + 1),
        view.getUint8(offset + 2), view.getUint8(offset + 3)
      )
      offset += 4

      // Read 4-byte length (big-endian)
      const len = view.getUint32(offset)
      offset += 4

      if (offset + len > buffer.byteLength) break

      if (tag === 'ptrk') {
        // Track path encoded as UTF-16BE
        const pathBytes = new Uint8Array(buffer, offset, len)
        const path = decoder.decode(pathBytes).replace(/\0/g, '')
        if (path) trackPaths.push(path)
      } else if (tag === 'otrk') {
        // otrk contains nested ptrk — parse recursively by continuing
        // The ptrk is inside otrk, so we don't skip — let the loop find it
        continue
      }

      offset += len
    }

    // Build playlist from paths
    if (trackPaths.length > 0) {
      result.playlists.push({ name: crateName, trackPaths })
    }

    // We don't have track metadata in crate files — just paths
    // Tracks will be matched against existing library

  } catch (e) {
    result.errors.push(`Serato crate parse error: ${e instanceof Error ? e.message : String(e)}`)
  }

  return result
}

// ---------------------------------------------------------------------------
// M3U/M3U8 playlist parser
// ---------------------------------------------------------------------------

export function parseM3U(text: string, playlistName: string): ImportResult {
  const result: ImportResult = { source: 'm3u', tracks: [], playlists: [], errors: [] }

  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  const trackPaths = lines.filter(l => {
    const ext = l.split('.').pop()?.toLowerCase()
    return ext && ['mp4', 'webm', 'mkv', 'avi', 'mov', 'mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)
  })

  if (trackPaths.length > 0) {
    result.playlists.push({ name: playlistName, trackPaths })
  }

  return result
}

// ---------------------------------------------------------------------------
// Match imported tracks to existing library
// ---------------------------------------------------------------------------

export function matchImportedTracks(
  imported: ImportedTrack[],
  library: Track[],
): { matched: { imported: ImportedTrack; libraryTrack: Track }[]; unmatched: ImportedTrack[] } {
  const matched: { imported: ImportedTrack; libraryTrack: Track }[] = []
  const unmatched: ImportedTrack[] = []

  // Build lookup maps for fast matching
  const byFilename = new Map<string, Track>()
  const byTitleArtist = new Map<string, Track>()

  for (const t of library) {
    // Match by filename (extract from file path or title)
    if (t.file) {
      const filename = t.file.split('/').pop()?.split('\\').pop()?.toLowerCase() || ''
      byFilename.set(filename, t)
    }
    // Match by title+artist (normalized)
    const key = `${t.title.toLowerCase().trim()}|${t.artist.toLowerCase().trim()}`
    byTitleArtist.set(key, t)
  }

  for (const imp of imported) {
    // Try filename match first
    const filename = imp.filePath.split('/').pop()?.split('\\').pop()?.toLowerCase() || ''
    let match = byFilename.get(filename)

    // Try title+artist match
    if (!match) {
      const key = `${imp.title.toLowerCase().trim()}|${imp.artist.toLowerCase().trim()}`
      match = byTitleArtist.get(key)
    }

    if (match) {
      matched.push({ imported: imp, libraryTrack: match })
    } else {
      unmatched.push(imp)
    }
  }

  return { matched, unmatched }
}

// ---------------------------------------------------------------------------
// Build metadata updates from imported data
// ---------------------------------------------------------------------------

export function buildImportUpdates(
  matched: { imported: ImportedTrack; libraryTrack: Track }[],
): { id: string; changes: Partial<Track> }[] {
  const updates: { id: string; changes: Partial<Track> }[] = []

  for (const { imported, libraryTrack } of matched) {
    const changes: Partial<Track> = {}

    // Only fill in missing fields — don't overwrite existing data
    if (!libraryTrack.artist && imported.artist) changes.artist = imported.artist
    if (!libraryTrack.album && imported.album) changes.album = imported.album
    if (!libraryTrack.genre && imported.genre) changes.genre = imported.genre
    if (!libraryTrack.bpm && imported.bpm) changes.bpm = Math.round(imported.bpm)
    if (!libraryTrack.key && imported.key) changes.key = imported.key
    if (!libraryTrack.released && imported.year) changes.released = imported.year

    if (Object.keys(changes).length > 0) {
      updates.push({ id: libraryTrack.id, changes })
    }
  }

  return updates
}

// ---------------------------------------------------------------------------
// Parse any import file (auto-detect format)
// ---------------------------------------------------------------------------

export async function parseImportFile(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase()

  if (name.endsWith('.xml')) {
    const text = await file.text()
    return parseRekordboxXML(text)
  }

  if (name.endsWith('.crate')) {
    const buffer = await file.arrayBuffer()
    const crateName = file.name.replace(/\.crate$/i, '')
    return parseSeratoCrate(buffer, crateName)
  }

  if (name.endsWith('.m3u') || name.endsWith('.m3u8')) {
    const text = await file.text()
    const playlistName = file.name.replace(/\.(m3u8?|M3U8?)$/, '')
    return parseM3U(text, playlistName)
  }

  return {
    source: 'rekordbox',
    tracks: [],
    playlists: [],
    errors: [`Unsupported file format: ${file.name}. Supported: .xml (Rekordbox), .crate (Serato), .m3u/.m3u8`],
  }
}

// ---------------------------------------------------------------------------
// Key conversion helpers
// ---------------------------------------------------------------------------

/** Convert Rekordbox key notation to Camelot notation */
function convertRekordboxKey(key: string): string {
  if (!key) return ''
  // Already Camelot?
  if (/^\d{1,2}[AB]$/.test(key)) return key

  const camelotMap: Record<string, string> = {
    // Major keys
    'C': '8B', 'Cmaj': '8B',
    'Db': '3B', 'Dbmaj': '3B', 'C#': '3B',
    'D': '10B', 'Dmaj': '10B',
    'Eb': '5B', 'Ebmaj': '5B', 'D#': '5B',
    'E': '12B', 'Emaj': '12B',
    'F': '7B', 'Fmaj': '7B',
    'F#': '2B', 'Gbmaj': '2B', 'Gb': '2B',
    'G': '9B', 'Gmaj': '9B',
    'Ab': '4B', 'Abmaj': '4B', 'G#': '4B',
    'A': '11B', 'Amaj': '11B',
    'Bb': '6B', 'Bbmaj': '6B', 'A#': '6B',
    'B': '1B', 'Bmaj': '1B',
    // Minor keys
    'Cm': '5A', 'Cmin': '5A',
    'C#m': '12A', 'Dbm': '12A',
    'Dm': '7A', 'Dmin': '7A',
    'D#m': '2A', 'Ebm': '2A',
    'Em': '9A', 'Emin': '9A',
    'Fm': '4A', 'Fmin': '4A',
    'F#m': '11A', 'Gbm': '11A',
    'Gm': '6A', 'Gmin': '6A',
    'G#m': '1A', 'Abm': '1A',
    'Am': '8A', 'Amin': '8A',
    'A#m': '3A', 'Bbm': '3A',
    'Bm': '10A', 'Bmin': '10A',
  }

  return camelotMap[key] || key
}
