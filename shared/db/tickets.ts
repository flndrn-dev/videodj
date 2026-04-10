import { query, queryOne, queryMany } from './client.js'

export interface Ticket {
  id: string
  subject: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  customer_email: string
  customer_name: string
  assigned_to: string | null
  created_at: string
  updated_at: string
}

export interface TicketMessage {
  id: string
  ticket_id: string
  sender: string
  text: string
  attachments: unknown[]
  created_at: string
}

export async function getAllTickets(filter?: { status?: string }): Promise<Ticket[]> {
  if (filter?.status) {
    return queryMany<Ticket>('SELECT * FROM tickets WHERE status = $1 ORDER BY created_at DESC', [filter.status])
  }
  return queryMany<Ticket>('SELECT * FROM tickets ORDER BY created_at DESC')
}

export async function getTicketById(id: string): Promise<Ticket | null> {
  return queryOne<Ticket>('SELECT * FROM tickets WHERE id = $1', [id])
}

export async function getTicketMessages(ticketId: string): Promise<TicketMessage[]> {
  return queryMany<TicketMessage>('SELECT * FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC', [ticketId])
}

export async function createTicket(data: {
  subject: string; priority: Ticket['priority']; customer_email: string; customer_name?: string
}): Promise<Ticket> {
  return (await queryOne<Ticket>(
    `INSERT INTO tickets (subject, priority, customer_email, customer_name) VALUES ($1,$2,$3,$4) RETURNING *`,
    [data.subject, data.priority, data.customer_email, data.customer_name || '']
  ))!
}

export async function addTicketMessage(ticketId: string, sender: string, text: string): Promise<TicketMessage> {
  await query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [ticketId])
  return (await queryOne<TicketMessage>(
    `INSERT INTO ticket_messages (ticket_id, sender, text) VALUES ($1,$2,$3) RETURNING *`,
    [ticketId, sender, text]
  ))!
}

export async function updateTicketStatus(id: string, status: Ticket['status']): Promise<void> {
  await query('UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2', [status, id])
}

export async function assignTicket(id: string, agentId: string): Promise<void> {
  await query('UPDATE tickets SET assigned_to = $1, updated_at = NOW() WHERE id = $2', [agentId, id])
}
