import { query, queryOne } from './client.js'
import { randomBytes } from 'crypto'

export interface MagicLink {
  id: string
  email: string
  token: string
  expires_at: string
  used: boolean
}

export interface Session {
  id: string
  user_id: string
  token: string
  expires_at: string
}

export async function createMagicLink(email: string, expiresInMinutes = 15): Promise<MagicLink> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString()

  const result = await queryOne<MagicLink>(
    `INSERT INTO magic_links (email, token, expires_at) VALUES ($1, $2, $3) RETURNING *`,
    [email, token, expiresAt]
  )
  return result!
}

export async function verifyMagicLink(token: string): Promise<string | null> {
  const link = await queryOne<MagicLink>(
    `SELECT * FROM magic_links WHERE token = $1 AND used = FALSE AND expires_at > NOW()`,
    [token]
  )
  if (!link) return null

  await query('UPDATE magic_links SET used = TRUE WHERE id = $1', [link.id])
  return link.email
}

export async function createSession(userId: string, expiresInDays = 30): Promise<Session> {
  const token = randomBytes(48).toString('hex')
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  const result = await queryOne<Session>(
    `INSERT INTO auth_sessions (user_id, token, expires_at) VALUES ($1, $2, $3) RETURNING *`,
    [userId, token, expiresAt]
  )
  return result!
}

export async function getSessionByToken(token: string): Promise<Session | null> {
  return queryOne<Session>(
    'SELECT * FROM auth_sessions WHERE token = $1 AND expires_at > NOW()',
    [token]
  )
}

export async function deleteSession(token: string): Promise<void> {
  await query('DELETE FROM auth_sessions WHERE token = $1', [token])
}

export async function cleanExpiredSessions(): Promise<void> {
  await query('DELETE FROM auth_sessions WHERE expires_at < NOW()')
  await query('DELETE FROM magic_links WHERE expires_at < NOW()')
}
