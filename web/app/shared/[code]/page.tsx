'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Track {
  id: string
  title: string
  artist: string
  album: string
  genre: string
  bpm: number
  key: string
  duration: number
}

interface PlaylistInfo {
  name: string
  trackCount: number
  totalDuration: number
  createdAt: string
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function SharedPlaylistPage() {
  const params = useParams()
  const code = params.code as string

  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!code) return
    fetch(`/api/playlists/shared?code=${encodeURIComponent(code)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found')
        return res.json()
      })
      .then((data) => {
        setPlaylist(data.playlist)
        setTracks(data.tracks)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [code])

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={styles.message}>Loading...</p>
      </div>
    )
  }

  if (error || !playlist) {
    return (
      <div style={styles.container}>
        <p style={styles.message}>Playlist not found</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>{playlist.name}</h1>
        <div style={styles.meta}>
          <span>{playlist.trackCount} tracks</span>
          <span style={styles.dot}>&middot;</span>
          <span>{formatDuration(playlist.totalDuration)}</span>
        </div>

        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, width: 40 }}>#</th>
                <th style={styles.th}>Title</th>
                <th style={styles.th}>Artist</th>
                <th style={{ ...styles.th, width: 80, textAlign: 'center' }}>BPM</th>
                <th style={{ ...styles.th, width: 60, textAlign: 'center' }}>Key</th>
                <th style={{ ...styles.th, width: 70, textAlign: 'right' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track, i) => (
                <tr key={track.id} style={styles.row}>
                  <td style={{ ...styles.td, color: '#888', width: 40 }}>{i + 1}</td>
                  <td style={styles.td}>{track.title}</td>
                  <td style={{ ...styles.td, color: '#a0a0c0' }}>{track.artist}</td>
                  <td style={{ ...styles.td, textAlign: 'center', color: '#a0a0c0' }}>
                    {track.bpm > 0 ? Math.round(track.bpm) : '—'}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'center', color: '#a0a0c0' }}>
                    {track.key || '—'}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right', color: '#a0a0c0' }}>
                    {formatDuration(track.duration)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={styles.footer}>
          <span style={styles.brand}>videoDJ.Studio</span>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#0b0b14',
    color: '#e0e0f0',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '40px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: 800,
    backgroundColor: '#12121e',
    borderRadius: 12,
    padding: '32px',
    border: '1px solid #1e1e30',
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    margin: 0,
    color: '#ffff00',
  },
  meta: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
    marginBottom: 24,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    color: '#444',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#666',
    borderBottom: '1px solid #1e1e30',
  },
  row: {
    borderBottom: '1px solid #1a1a28',
  },
  td: {
    padding: '10px 12px',
    fontSize: 14,
  },
  message: {
    color: '#888',
    fontSize: 16,
    marginTop: 80,
  },
  footer: {
    marginTop: 24,
    paddingTop: 16,
    borderTop: '1px solid #1e1e30',
    textAlign: 'center',
  },
  brand: {
    fontSize: 12,
    color: '#555',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
}
