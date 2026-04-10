import { queryOne, queryMany } from './client.js'

export interface LinusConversation {
  id: string
  user_id: string
  summary: string
  topics: string[]
  actions: string[]
  message_count: number
  created_at: string
}

export async function saveConversation(data: {
  user_id: string
  summary: string
  topics: string[]
  actions: string[]
  message_count: number
}): Promise<LinusConversation> {
  const result = await queryOne<LinusConversation>(
    `INSERT INTO linus_conversations (user_id, summary, topics, actions, message_count)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.user_id, data.summary, data.topics, data.actions, data.message_count]
  )
  return result!
}

export async function getConversations(userId: string, limit = 20): Promise<LinusConversation[]> {
  return queryMany<LinusConversation>(
    'SELECT * FROM linus_conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit]
  )
}

export async function getRecentConversations(limit = 50): Promise<LinusConversation[]> {
  return queryMany<LinusConversation>(
    `SELECT c.*, u.email, u.name as user_name
     FROM linus_conversations c
     JOIN users u ON c.user_id = u.id
     ORDER BY c.created_at DESC LIMIT $1`,
    [limit]
  )
}
