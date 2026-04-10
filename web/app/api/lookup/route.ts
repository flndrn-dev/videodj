import { NextRequest, NextResponse } from 'next/server'
import { loadEnv } from '@/app/lib/loadEnv'

/**
 * Server-side metadata lookup via MusicBrainz + Discogs + YouTube.
 * Proxied through the API route to avoid CORS issues in the browser.
 */

const USER_AGENT = 'videoDJ.Studio/1.0 (https://github.com/flndrn-dev/videodj)'
const MB_BASE = 'https://musicbrainz.org/ws/2'
const DISCOGS_BASE = 'https://api.discogs.com'

// Rate limiting
let lastMB = 0
let lastDiscogs = 0

async function mbWait() {
  const wait = Math.max(0, 1100 - (Date.now() - lastMB))
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastMB = Date.now()
}

async function discogsWait() {
  const wait = Math.max(0, 1100 - (Date.now() - lastDiscogs))
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastDiscogs = Date.now()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { tracks } = body as { tracks: { id: string; title: string; artist: string }[] }

    if (!tracks || !Array.isArray(tracks)) {
      return NextResponse.json({ error: 'tracks array required' }, { status: 400 })
    }

    const results: { id: string; changes: Record<string, string | number> }[] = []

    for (const track of tracks) {
      const changes: Record<string, string | number> = {}

      // Try MusicBrainz
      await mbWait()
      const mbResult = await searchMB(track.title, track.artist)
      if (mbResult) {
        if (mbResult.album) changes.album = mbResult.album
        if (mbResult.released) changes.released = mbResult.released
        if (mbResult.genre) changes.genre = mbResult.genre
        if (mbResult.artist && !track.artist) changes.artist = mbResult.artist
      }

      // Try Discogs for missing genre
      if (!changes.genre) {
        await discogsWait()
        const dcResult = await searchDC(track.title, track.artist)
        if (dcResult) {
          if (dcResult.genre && !changes.genre) changes.genre = dcResult.genre
          if (dcResult.released && !changes.released) changes.released = dcResult.released
          if (dcResult.album && !changes.album) changes.album = dcResult.album
        }
      }

      if (Object.keys(changes).length > 0) {
        results.push({ id: track.id, changes })
      }
    }

    return NextResponse.json({ results })
  } catch (e) {
    console.error('[lookup] Error:', e)
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// MusicBrainz search
// ---------------------------------------------------------------------------

async function searchMB(title: string, artist?: string) {
  const query = artist
    ? `recording:"${title}" AND artist:"${artist}"`
    : `recording:"${title}"`

  try {
    const res = await fetch(
      `${MB_BASE}/recording?query=${encodeURIComponent(query)}&limit=3&fmt=json`,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }
    )
    if (!res.ok) return null

    const data = await res.json()
    const recordings = data.recordings || []
    if (recordings.length === 0) return null

    const match = recordings[0]
    const result: Record<string, string> = {}

    if (match['artist-credit']?.[0]?.name) {
      result.artist = match['artist-credit'][0].name
    }

    if (match.releases?.[0]) {
      result.album = match.releases[0].title
      if (match.releases[0].date) {
        result.released = match.releases[0].date.slice(0, 4)
      }
    }

    if (match.tags?.length) {
      const sorted = [...match.tags].sort((a: { count: number }, b: { count: number }) => b.count - a.count)
      result.genre = sorted[0].name
        .split(' ')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    }

    return result
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// YouTube search (for /suggest and /lookup commands)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'youtube-search') {
    const query = searchParams.get('q')
    if (!query) return NextResponse.json({ error: 'q parameter required' }, { status: 400 })

    const env = loadEnv()
    const apiKey = env.YOUTUBE_API_KEY || ''
    if (!apiKey) {
      return NextResponse.json({ error: 'No YouTube API key. Add one in Settings → General.' }, { status: 400 })
    }

    const results = await searchYouTube(query, apiKey, parseInt(searchParams.get('limit') || '5'))
    return NextResponse.json({ results })
  }

  if (action === 'youtube-artist') {
    const artist = searchParams.get('artist')
    if (!artist) return NextResponse.json({ error: 'artist parameter required' }, { status: 400 })

    const env = loadEnv()
    const apiKey = env.YOUTUBE_API_KEY || ''
    if (!apiKey) {
      return NextResponse.json({ error: 'No YouTube API key. Add one in Settings → General.' }, { status: 400 })
    }

    // Search for official music videos by this artist
    const results = await searchYouTube(`${artist} official music video`, apiKey, 10)
    return NextResponse.json({ artist, results })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

interface YouTubeResult {
  videoId: string
  title: string
  channel: string
  thumbnail: string
  url: string
  duration?: string
}

async function searchYouTube(query: string, apiKey: string, maxResults = 5): Promise<YouTubeResult[]> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?` +
      `part=snippet&type=video&videoCategoryId=10&maxResults=${maxResults}` +
      `&q=${encodeURIComponent(query)}` +
      `&key=${apiKey}`,
      { headers: { Accept: 'application/json' } }
    )
    if (!res.ok) {
      console.error('[YouTube] Search failed:', res.status, await res.text().catch(() => ''))
      return []
    }

    const data = await res.json()
    const items = data.items || []

    return items.map((item: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails: { default: { url: string } } } }) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.default.url,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    }))
  } catch (e) {
    console.error('[YouTube] Error:', e)
    return []
  }
}

// ---------------------------------------------------------------------------
// Discogs search
// ---------------------------------------------------------------------------

async function searchDC(title: string, artist?: string) {
  const query = artist ? `${artist} ${title}` : title

  try {
    const res = await fetch(
      `${DISCOGS_BASE}/database/search?q=${encodeURIComponent(query)}&type=release&per_page=3`,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }
    )
    if (!res.ok) return null

    const data = await res.json()
    const results = data.results || []
    if (results.length === 0) return null

    const match = results[0]
    const result: Record<string, string> = {}

    if (match.style?.length) result.genre = match.style[0]
    else if (match.genre?.length) result.genre = match.genre[0]
    if (match.year) result.released = String(match.year)

    // Extract album from title if possible
    if (match.title?.includes(' - ')) {
      const parts = match.title.split(' - ')
      if (parts.length >= 2) result.album = parts.slice(1).join(' - ').trim()
    }

    return result
  } catch {
    return null
  }
}
