import { query, queryOne, queryMany } from './client.js'

export interface UserPlaylistRow {
  id: string
  user_id: string
  name: string
  created_by: string
  track_ids: string[]
  total_duration: number
  created_at: string
  updated_at: string
}

export async function savePlaylist(data: {
  user_id: string
  name: string
  created_by?: string
  track_ids: string[]
  total_duration?: number
}): Promise<UserPlaylistRow> {
  const result = await queryOne<UserPlaylistRow>(
    `INSERT INTO user_playlists (user_id, name, created_by, track_ids, total_duration)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET name = $2, track_ids = $4, total_duration = $5, updated_at = NOW()
     RETURNING *`,
    [data.user_id, data.name, data.created_by || 'user', data.track_ids, data.total_duration || 0]
  )
  return result!
}

export async function getPlaylists(userId: string): Promise<UserPlaylistRow[]> {
  return queryMany<UserPlaylistRow>(
    'SELECT * FROM user_playlists WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  )
}

export async function deletePlaylist(id: string): Promise<void> {
  await query('DELETE FROM user_playlists WHERE id = $1', [id])
}
