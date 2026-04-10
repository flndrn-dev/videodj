import { query, queryOne, queryMany } from './client.js'

export interface Track {
  id: string
  user_id: string
  title: string
  artist: string
  album: string
  remixer: string
  genre: string
  language: string | null
  bpm: number
  key: string
  released: string
  duration: number
  times_played: number
  loudness: number | null
  thumbnail_url: string | null
  file_url: string | null
  file_name: string | null
  file_size: number
  minio_key: string | null
  bad_file: boolean
  bad_reason: string | null
  waveform_peaks: number[] | null
  created_at: string
  updated_at: string
}

export async function getTracksByUser(userId: string): Promise<Track[]> {
  return queryMany<Track>('SELECT * FROM tracks WHERE user_id = $1 ORDER BY title ASC', [userId])
}

export async function getTrackById(id: string): Promise<Track | null> {
  return queryOne<Track>('SELECT * FROM tracks WHERE id = $1', [id])
}

export async function createTrack(data: {
  user_id: string; title: string; artist?: string; album?: string; remixer?: string;
  genre?: string; language?: string; bpm?: number; key?: string; released?: string;
  duration?: number; file_name?: string; file_size?: number; minio_key?: string;
  thumbnail_url?: string; file_url?: string; loudness?: number; waveform_peaks?: number[];
}): Promise<Track> {
  const result = await queryOne<Track>(
    `INSERT INTO tracks (user_id, title, artist, album, remixer, genre, language, bpm, key, released, duration, file_name, file_size, minio_key, thumbnail_url, file_url, loudness, waveform_peaks)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [data.user_id, data.title, data.artist || '', data.album || '', data.remixer || '',
     data.genre || '', data.language || null, data.bpm || 0, data.key || '', data.released || '',
     data.duration || 0, data.file_name || null, data.file_size || 0, data.minio_key || null,
     data.thumbnail_url || null, data.file_url || null, data.loudness || null,
     data.waveform_peaks ? JSON.stringify(data.waveform_peaks) : null]
  )
  return result!
}

export async function updateTrack(id: string, updates: Partial<Omit<Track, 'id' | 'user_id' | 'created_at'>>): Promise<void> {
  const fields: string[] = []
  const values: unknown[] = []
  let idx = 1

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`"${key}" = $${idx}`)
      values.push(key === 'waveform_peaks' ? JSON.stringify(value) : value)
      idx++
    }
  }

  if (fields.length === 0) return
  fields.push('updated_at = NOW()')
  values.push(id)

  await query(`UPDATE tracks SET ${fields.join(', ')} WHERE id = $${idx}`, values)
}

export async function deleteTrack(id: string): Promise<void> {
  await query('DELETE FROM tracks WHERE id = $1', [id])
}

export async function incrementPlays(id: string): Promise<void> {
  await query('UPDATE tracks SET times_played = times_played + 1 WHERE id = $1', [id])
}

export async function searchTracks(userId: string, searchQuery: string): Promise<Track[]> {
  return queryMany<Track>(
    `SELECT * FROM tracks WHERE user_id = $1 AND (
      title ILIKE $2 OR artist ILIKE $2 OR album ILIKE $2 OR genre ILIKE $2 OR remixer ILIKE $2
    ) ORDER BY title ASC`,
    [userId, `%${searchQuery}%`]
  )
}
