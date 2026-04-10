import { query, queryOne, queryMany } from './client.js'

export interface DevCard {
  id: string
  title: string
  description: string
  column: 'ideas' | 'todo' | 'in_progress' | 'testing' | 'done'
  priority: 'low' | 'medium' | 'high'
  tags: string[]
  sort_order: number
  created_by: string
  created_at: string
  updated_at: string
}

export async function getAllCards(): Promise<DevCard[]> {
  return queryMany<DevCard>('SELECT * FROM devzone_cards ORDER BY sort_order ASC, created_at DESC')
}

export async function createCard(data: {
  title: string; description?: string; column?: DevCard['column']; priority?: DevCard['priority']; tags?: string[]; created_by?: string
}): Promise<DevCard> {
  return (await queryOne<DevCard>(
    `INSERT INTO devzone_cards (title, description, "column", priority, tags, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [data.title, data.description || '', data.column || 'ideas', data.priority || 'medium', data.tags || [], data.created_by || '']
  ))!
}

export async function updateCard(id: string, updates: Partial<Pick<DevCard, 'title' | 'description' | 'column' | 'priority' | 'tags' | 'sort_order'>>): Promise<void> {
  const fields: string[] = []
  const values: unknown[] = []
  let idx = 1

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`"${key}" = $${idx}`)
      values.push(value)
      idx++
    }
  }

  if (fields.length === 0) return
  fields.push('updated_at = NOW()')
  values.push(id)
  await query(`UPDATE devzone_cards SET ${fields.join(', ')} WHERE id = $${idx}`, values)
}

export async function deleteCard(id: string): Promise<void> {
  await query('DELETE FROM devzone_cards WHERE id = $1', [id])
}
