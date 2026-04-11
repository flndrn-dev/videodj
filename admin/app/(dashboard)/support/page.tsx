'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Headset, Plus, X, Send, Circle, Clock, CheckCircle, AlertCircle, Eye } from 'lucide-react'

interface Ticket {
  id: string; subject: string; status: string; priority: string;
  customer_email: string; customer_name: string; assigned_to: string | null;
  created_at: string; updated_at: string;
}
interface TicketMessage {
  id: string; ticket_id: string; sender: string; text: string;
  attachments: Record<string, unknown> | unknown[] | null; created_at: string;
}

interface AdminUser {
  id: string; email: string; name: string; role: string;
}

const statusConfig: Record<string, { icon: typeof Circle; color: string; bg: string }> = {
  open: { icon: AlertCircle, color: 'var(--status-red)', bg: 'var(--deck-red-dim)' },
  in_progress: { icon: Clock, color: 'var(--status-amber)', bg: 'rgba(245,158,11,0.15)' },
  resolved: { icon: CheckCircle, color: 'var(--status-green)', bg: 'rgba(34,197,94,0.15)' },
  closed: { icon: Circle, color: 'var(--text-tertiary)', bg: 'var(--bg-elevated)' },
}

const priorityColors: Record<string, string> = {
  low: 'var(--text-tertiary)',
  medium: 'var(--status-amber)',
  high: '#f97316',
  urgent: 'var(--status-red)',
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<TicketMessage[]>([])
  const [showNew, setShowNew] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [newPriority, setNewPriority] = useState('medium')
  const [replyText, setReplyText] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [filter, setFilter] = useState('all')
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])

  useEffect(() => {
    fetch('/api/tickets').then(r => r.json()).then(data => {
      if (data.tickets) setTickets(data.tickets)
    }).catch(() => {})
    fetch('/api/users').then(r => r.json()).then(data => {
      if (data.users) setAdminUsers(data.users.filter((u: AdminUser) => u.role === 'admin' || u.role === 'support'))
    }).catch(() => {})
  }, [])

  const handleSelectTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket)
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`)
      const data = await res.json()
      if (data.messages) setMessages(data.messages)
      if (data.ticket) setSelectedTicket(data.ticket)
    } catch { setMessages([]) }
  }

  const handleCreate = async () => {
    if (!newSubject || !newEmail) return
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: newSubject,
          status: 'open',
          priority: newPriority,
          customer_email: newEmail,
          customer_name: newEmail.split('@')[0],
          message: newMessage || undefined,
        }),
      })
      const data = await res.json()
      if (data.ticket) setTickets(prev => [data.ticket, ...prev])
    } catch { /* ignore */ }
    setNewSubject('')
    setNewEmail('')
    setNewMessage('')
    setShowNew(false)
  }

  const handleReply = async () => {
    if (!replyText || !selectedTicket) return
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: 'support@videodj.studio', text: replyText, isInternal }),
      })
      const data = await res.json()
      if (data.message) setMessages(prev => [...prev, data.message])
    } catch { /* ignore */ }
    setReplyText('')
    setIsInternal(false)
  }

  const handleAssign = async (ticketId: string, assignedTo: string | null) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: assignedTo || null }),
      })
      const data = await res.json()
      if (data.ticket) {
        setTickets(prev => prev.map(t => t.id === ticketId ? data.ticket : t))
        if (selectedTicket?.id === ticketId) setSelectedTicket(data.ticket)
      }
    } catch { /* ignore */ }
  }

  // Calculate first response time for a ticket
  const getFirstResponseInfo = (ticket: Ticket): { text: string; color: string } => {
    const ticketMessages = messages // only available for selected ticket
    if (selectedTicket?.id !== ticket.id || ticketMessages.length <= 1) {
      return { text: 'Awaiting', color: 'var(--status-amber)' }
    }
    const firstSupportReply = ticketMessages.find(m => m.sender.includes('videodj') || m.sender.includes('support') || m.sender.includes('admin'))
    if (!firstSupportReply) return { text: 'Awaiting', color: 'var(--status-amber)' }
    const created = new Date(ticket.created_at).getTime()
    const replied = new Date(firstSupportReply.created_at).getTime()
    const diffMs = replied - created
    const hours = Math.floor(diffMs / 3600000)
    const mins = Math.floor((diffMs % 3600000) / 60000)
    if (hours > 24) return { text: `${Math.floor(hours / 24)}d ${hours % 24}h`, color: 'var(--status-red)' }
    if (hours > 4) return { text: `${hours}h ${mins}m`, color: 'var(--status-amber)' }
    return { text: `${hours}h ${mins}m`, color: 'var(--status-green)' }
  }

  const handleStatusChange = async (ticketId: string, status: string) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (data.ticket) {
        setTickets(prev => prev.map(t => t.id === ticketId ? data.ticket : t))
        if (selectedTicket?.id === ticketId) setSelectedTicket(data.ticket)
      }
    } catch { /* ignore */ }
  }

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold glow-yellow" style={{ color: 'var(--brand-yellow)' }}>Support</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {tickets.filter(t => t.status === 'open').length} open tickets
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
          style={{ background: 'var(--brand-yellow)', color: 'var(--bg-primary)' }}>
          <Plus size={16} /> New Ticket
        </button>
      </motion.div>

      {/* Status filters */}
      <div className="flex gap-2">
        {['all', 'open', 'in_progress', 'resolved', 'closed'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: filter === s ? 'var(--brand-yellow-dim)' : 'var(--bg-card)',
              color: filter === s ? 'var(--brand-yellow)' : 'var(--text-tertiary)',
              border: `1px solid ${filter === s ? 'rgba(255,255,0,0.2)' : 'var(--border-primary)'}`,
            }}>
            {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        {/* Ticket list */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass-card glass-card--yellow overflow-hidden">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-16 gap-3" style={{ color: 'var(--text-tertiary)' }}>
              <Headset size={20} style={{ opacity: 0.4 }} />
              <span className="text-sm">No tickets yet</span>
            </div>
          ) : (
            filtered.map((ticket, i) => {
              const StatusIcon = statusConfig[ticket.status]?.icon || Circle
              return (
                <motion.div key={ticket.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                  onClick={() => handleSelectTicket(ticket)}
                  className="flex items-center gap-4 px-6 py-4 cursor-pointer transition-colors"
                  style={{
                    borderBottom: '1px solid var(--border-primary)',
                    background: selectedTicket?.id === ticket.id ? 'var(--bg-tertiary)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (selectedTicket?.id !== ticket.id) e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                  onMouseLeave={e => { if (selectedTicket?.id !== ticket.id) e.currentTarget.style.background = 'transparent' }}>
                  <StatusIcon size={14} style={{ color: statusConfig[ticket.status]?.color, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{ticket.subject}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{ticket.customer_email}</p>
                    </div>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold"
                    style={{ color: priorityColors[ticket.priority] }}>{ticket.priority}</span>
                  {ticket.status === 'open' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                      style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--status-amber)', border: '1px solid rgba(245,158,11,0.2)' }}>
                      Awaiting
                    </span>
                  )}
                  <span className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </span>
                </motion.div>
              )
            })
          )}
        </motion.div>

        {/* Ticket detail */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="glass-card p-6">
          {selectedTicket ? (() => {
            // Extract ticket metadata from first message attachments
            const firstMsg = messages[0]
            const meta = (firstMsg?.attachments as { category?: string; ticketNumber?: string; meta?: { ip?: string; country?: string; timezone?: string; os?: string } }) || {}
            const categoryColors: Record<string, string> = { 'General Support': '#3b82f6', 'Finance Support': '#22c55e', 'Recover Support': '#f97316' }
            return (
            <>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedTicket.subject}</h3>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {selectedTicket.customer_name && selectedTicket.customer_name !== selectedTicket.customer_email?.split('@')[0]
                      ? `${selectedTicket.customer_name} · ` : ''}{selectedTicket.customer_email}
                  </p>
                  {/* Ticket number + category */}
                  <div className="flex items-center gap-2 mt-1.5">
                    {meta.ticketNumber && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--brand-yellow)', border: '1px solid rgba(255,255,0,0.15)' }}>
                        {meta.ticketNumber}
                      </span>
                    )}
                    {meta.category && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: `${categoryColors[meta.category] || '#888'}20`, color: categoryColors[meta.category] || '#888' }}>
                        {meta.category}
                      </span>
                    )}
                  </div>
                  {/* Hidden metadata */}
                  {meta.meta && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2">
                      {meta.meta.country && <span className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{meta.meta.country}</span>}
                      {meta.meta.ip && <span className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{meta.meta.ip}</span>}
                      {meta.meta.os && <span className="text-[9px] font-mono truncate max-w-32" title={meta.meta.os} style={{ color: 'var(--text-tertiary)' }}>{meta.meta.os}</span>}
                      {meta.meta.timezone && <span className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{meta.meta.timezone}</span>}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 items-end shrink-0">
                  <select value={selectedTicket.status} onChange={e => handleStatusChange(selectedTicket.id, e.target.value)}
                    className="text-xs px-2 py-1 rounded-lg outline-none cursor-pointer"
                    style={{ background: statusConfig[selectedTicket.status]?.bg, color: statusConfig[selectedTicket.status]?.color, border: 'none' }}>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                  <select value={selectedTicket.assigned_to || ''} onChange={e => handleAssign(selectedTicket.id, e.target.value || null)}
                    className="text-[10px] px-2 py-1 rounded-lg outline-none cursor-pointer"
                    style={{ background: 'var(--bg-tertiary)', color: selectedTicket.assigned_to ? 'var(--text-secondary)' : 'var(--text-tertiary)', border: '1px solid var(--border-primary)' }}>
                    <option value="">Unassigned</option>
                    {adminUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name || u.email}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* SLA first response indicator */}
              {(() => {
                const sla = getFirstResponseInfo(selectedTicket)
                return (
                  <div className="flex items-center gap-2 mb-3 px-2 py-1.5 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
                    <Clock size={11} style={{ color: sla.color }} />
                    <span className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>First response:</span>
                    <span className="text-[10px] font-mono font-semibold" style={{ color: sla.color }}>{sla.text}</span>
                  </div>
                )
              })()}

              {/* Messages */}
              <div className="space-y-3 max-h-[400px] overflow-y-auto mb-4 pr-1">
                {messages.map((msg) => {
                  const isNote = (msg.attachments as Record<string, unknown>)?.isInternal === true
                  const isSupportSender = msg.sender.includes('videodj') || msg.sender.includes('support') || msg.sender.includes('admin')
                  return (
                  <div key={msg.id} className={`flex ${isSupportSender ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[85%] px-3 py-2 rounded-xl text-sm"
                      style={{
                        background: isNote ? 'rgba(245,158,11,0.1)' : isSupportSender ? 'var(--brand-yellow-dim)' : 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                        border: isNote ? '1px solid rgba(245,158,11,0.25)' : 'none',
                      }}>
                      {isNote && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <Eye size={10} style={{ color: 'var(--status-amber)' }} />
                          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--status-amber)' }}>Internal Note</span>
                        </div>
                      )}
                      <p>{msg.text}</p>
                      <p className="text-[9px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  )
                })}
              </div>

              {/* Reply */}
              <div className="flex gap-2">
                <button onClick={() => setIsInternal(!isInternal)}
                  className="px-3 py-2.5 rounded-xl text-[10px] font-medium shrink-0"
                  style={{
                    background: isInternal ? 'rgba(245,158,11,0.15)' : 'var(--bg-tertiary)',
                    color: isInternal ? 'var(--status-amber)' : 'var(--text-tertiary)',
                    border: `1px solid ${isInternal ? 'rgba(245,158,11,0.3)' : 'var(--border-primary)'}`,
                  }}>
                  {isInternal ? 'Internal' : 'Reply'}
                </button>
                <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleReply()}
                  placeholder={isInternal ? 'Add internal note...' : 'Type reply...'}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }} />
                <button onClick={handleReply} className="p-2.5 rounded-xl"
                  style={{ background: replyText ? (isInternal ? 'rgba(245,158,11,0.3)' : 'var(--brand-yellow)') : 'var(--bg-elevated)', color: replyText ? (isInternal ? 'var(--status-amber)' : 'var(--bg-primary)') : 'var(--text-tertiary)' }}>
                  <Send size={16} />
                </button>
              </div>
            </>
            )
          })() : (
            <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ color: 'var(--text-tertiary)' }}>
              <Headset size={32} style={{ opacity: 0.3 }} />
              <span className="text-sm">Select a ticket to view</span>
            </div>
          )}
        </motion.div>
      </div>

      {/* New ticket modal */}
      <AnimatePresence>
        {showNew && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowNew(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--brand-yellow)' }}>New Ticket</h3>
                <button onClick={() => setShowNew(false)} style={{ color: 'var(--text-tertiary)' }}><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <input type="text" value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Subject"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }} />
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Customer email"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }} />
                <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Initial message (optional)" rows={3}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }} />
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>Priority</label>
                  <div className="flex gap-2">
                    {(['low', 'medium', 'high', 'urgent'] as const).map(p => (
                      <button key={p} onClick={() => setNewPriority(p)}
                        className="flex-1 px-3 py-2 rounded-xl text-xs font-medium capitalize transition-all"
                        style={{
                          background: newPriority === p ? `${priorityColors[p]}20` : 'var(--bg-tertiary)',
                          color: newPriority === p ? priorityColors[p] : 'var(--text-tertiary)',
                          border: `1px solid ${newPriority === p ? `${priorityColors[p]}40` : 'var(--border-primary)'}`,
                        }}>{p}</button>
                    ))}
                  </div>
                </div>
                <button onClick={handleCreate} disabled={!newSubject || !newEmail}
                  className="w-full px-4 py-3 rounded-xl text-sm font-medium"
                  style={{
                    background: newSubject && newEmail ? 'var(--brand-yellow)' : 'var(--bg-elevated)',
                    color: newSubject && newEmail ? 'var(--bg-primary)' : 'var(--text-tertiary)',
                  }}>Create Ticket</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
