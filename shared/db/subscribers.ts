import { query, queryOne, queryMany } from './client.js'

export interface PreSubscriber {
  id: string
  email: string
  status: 'pending' | 'invited' | 'converted'
  source: string
  subscribed_at: string
}

export async function addSubscriber(email: string, source = 'website'): Promise<PreSubscriber> {
  return (await queryOne<PreSubscriber>(
    `INSERT INTO pre_subscribers (email, source) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET source = $2
     RETURNING *`,
    [email, source]
  ))!
}

export async function getAllSubscribers(): Promise<PreSubscriber[]> {
  return queryMany<PreSubscriber>('SELECT * FROM pre_subscribers ORDER BY subscribed_at DESC')
}

export async function getSubscriberCount(): Promise<number> {
  const result = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM pre_subscribers')
  return parseInt(result?.count || '0', 10)
}
