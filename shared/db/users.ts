import { query, queryOne, queryMany } from './client.js'

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'support_agent' | 'beta_tester' | 'subscriber'
  status: 'active' | 'invited' | 'disabled'
  avatar_url: string | null
  invited_by: string | null
  invited_at: string
  last_active: string | null
  sessions_count: number
  created_at: string
  updated_at: string
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return queryOne<User>('SELECT * FROM users WHERE email = $1', [email])
}

export async function getUserById(id: string): Promise<User | null> {
  return queryOne<User>('SELECT * FROM users WHERE id = $1', [id])
}

export async function getAllUsers(): Promise<User[]> {
  return queryMany<User>('SELECT * FROM users ORDER BY created_at DESC')
}

export async function createUser(data: {
  email: string; name: string; role: User['role']; status?: User['status']; invited_by?: string
}): Promise<User> {
  const result = await queryOne<User>(
    `INSERT INTO users (email, name, role, status, invited_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.email, data.name, data.role, data.status || 'invited', data.invited_by || null]
  )
  return result!
}

export async function updateUser(id: string, updates: Partial<Pick<User, 'name' | 'role' | 'status' | 'last_active' | 'avatar_url'>>): Promise<void> {
  const fields: string[] = []
  const values: unknown[] = []
  let idx = 1

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx}`)
      values.push(value)
      idx++
    }
  }

  if (fields.length === 0) return
  fields.push(`updated_at = NOW()`)
  values.push(id)

  await query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, values)
}

export async function deleteUserById(id: string): Promise<void> {
  await query('DELETE FROM users WHERE id = $1', [id])
}

export async function touchUserActivity(id: string): Promise<void> {
  await query('UPDATE users SET last_active = NOW(), sessions_count = sessions_count + 1 WHERE id = $1', [id])
}
