/**
 * Temporary local store for admin dashboard data.
 * Will be replaced by Convex when connected.
 * Uses localStorage for persistence across page reloads.
 */

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'support_agent' | 'beta_tester' | 'subscriber'
  status: 'active' | 'invited' | 'disabled'
  invitedAt: string
  lastActive: string | null
  invitedBy: string
  sessions: number
}

export interface Ticket {
  id: string
  subject: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  customerEmail: string
  customerName: string
  assignedTo: string | null
  messages: { sender: string; text: string; timestamp: string }[]
  createdAt: string
  updatedAt: string
}

export interface DevCard {
  id: string
  title: string
  description: string
  column: 'ideas' | 'todo' | 'in_progress' | 'testing' | 'done'
  priority: 'low' | 'medium' | 'high'
  tags: string[]
  createdAt: string
  createdBy: string
}

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const data = localStorage.getItem(`admin_${key}`)
    return data ? JSON.parse(data) : fallback
  } catch {
    return fallback
  }
}

function save<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`admin_${key}`, JSON.stringify(data))
}

// ---- Users ----

const defaultUsers: User[] = [
  {
    id: '1',
    email: 'dj@videodj.studio',
    name: 'DJ Bodhi',
    role: 'admin',
    status: 'active',
    invitedAt: '2026-04-01T00:00:00Z',
    lastActive: new Date().toISOString(),
    invitedBy: 'system',
    sessions: 142,
  },
]

export function getUsers(): User[] {
  return load('users', defaultUsers)
}

export function saveUsers(users: User[]): void {
  save('users', users)
}

export function addUser(user: Omit<User, 'id'>): User {
  const users = getUsers()
  const newUser = { ...user, id: crypto.randomUUID() }
  users.push(newUser)
  saveUsers(users)
  return newUser
}

export function updateUser(id: string, updates: Partial<User>): void {
  const users = getUsers()
  const idx = users.findIndex(u => u.id === id)
  if (idx !== -1) {
    users[idx] = { ...users[idx], ...updates }
    saveUsers(users)
  }
}

export function deleteUser(id: string): void {
  saveUsers(getUsers().filter(u => u.id !== id))
}

// ---- Tickets ----

export function getTickets(): Ticket[] {
  return load('tickets', [])
}

export function saveTickets(tickets: Ticket[]): void {
  save('tickets', tickets)
}

export function addTicket(ticket: Omit<Ticket, 'id'>): Ticket {
  const tickets = getTickets()
  const newTicket = { ...ticket, id: crypto.randomUUID() }
  tickets.push(newTicket)
  saveTickets(tickets)
  return newTicket
}

export function updateTicket(id: string, updates: Partial<Ticket>): void {
  const tickets = getTickets()
  const idx = tickets.findIndex(t => t.id === id)
  if (idx !== -1) {
    tickets[idx] = { ...tickets[idx], ...updates }
    saveTickets(tickets)
  }
}

// ---- Dev Zone ----

export function getDevCards(): DevCard[] {
  return load('devCards', [])
}

export function saveDevCards(cards: DevCard[]): void {
  save('devCards', cards)
}

export function addDevCard(card: Omit<DevCard, 'id'>): DevCard {
  const cards = getDevCards()
  const newCard = { ...card, id: crypto.randomUUID() }
  cards.push(newCard)
  saveDevCards(cards)
  return newCard
}

export function updateDevCard(id: string, updates: Partial<DevCard>): void {
  const cards = getDevCards()
  const idx = cards.findIndex(c => c.id === id)
  if (idx !== -1) {
    cards[idx] = { ...cards[idx], ...updates }
    saveDevCards(cards)
  }
}

export function deleteDevCard(id: string): void {
  saveDevCards(getDevCards().filter(c => c.id !== id))
}
