'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Headset, Plus, X, Send, Circle, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { getTickets, addTicket, updateTicket, type Ticket } from '@/lib/store'

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
  const [showNew, setShowNew] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [newPriority, setNewPriority] = useState<Ticket['priority']>('medium')
  const [replyText, setReplyText] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => { setTickets(getTickets()) }, [])

  const handleCreate = () => {
    if (!newSubject || !newEmail) return
    const ticket = addTicket({
      subject: newSubject,
      status: 'open',
      priority: newPriority,
      customerEmail: newEmail,
      customerName: newEmail.split('@')[0],
      assignedTo: null,
      messages: newMessage ? [{ sender: newEmail, text: newMessage, timestamp: new Date().toISOString() }] : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    setTickets(prev => [ticket, ...prev])
    setNewSubject('')
    setNewEmail('')
    setNewMessage('')
    setShowNew(false)
  }

  const handleReply = () => {
    if (!replyText || !selectedTicket) return
    const msg = { sender: 'support@videodj.studio', text: replyText, timestamp: new Date().toISOString() }
    const updated = { ...selectedTicket, messages: [...selectedTicket.messages, msg], updatedAt: new Date().toISOString() }
    updateTicket(selectedTicket.id, { messages: updated.messages, updatedAt: updated.updatedAt })
    setSelectedTicket(updated)
    setTickets(prev => prev.map(t => t.id === updated.id ? updated : t))
    setReplyText('')
  }

  const handleStatusChange = (ticketId: string, status: Ticket['status']) => {
    updateTicket(ticketId, { status, updatedAt: new Date().toISOString() })
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status } : t))
    if (selectedTicket?.id === ticketId) setSelectedTicket(prev => prev ? { ...prev, status } : null)
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
                  onClick={() => setSelectedTicket(ticket)}
                  className="flex items-center gap-4 px-6 py-4 cursor-pointer transition-colors"
                  style={{
                    borderBottom: '1px solid var(--border-primary)',
                    background: selectedTicket?.id === ticket.id ? 'var(--bg-tertiary)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (selectedTicket?.id !== ticket.id) e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                  onMouseLeave={e => { if (selectedTicket?.id !== ticket.id) e.currentTarget.style.background = 'transparent' }}>
                  <StatusIcon size={14} style={{ color: statusConfig[ticket.status]?.color, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{ticket.subject}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{ticket.customerEmail}</p>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold"
                    style={{ color: priorityColors[ticket.priority] }}>{ticket.priority}</span>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                    {ticket.messages.length} msg
                  </span>
                </motion.div>
              )
            })
          )}
        </motion.div>

        {/* Ticket detail */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="glass-card p-6">
          {selectedTicket ? (
            <>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedTicket.subject}</h3>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{selectedTicket.customerEmail}</p>
                </div>
                <select value={selectedTicket.status} onChange={e => handleStatusChange(selectedTicket.id, e.target.value as Ticket['status'])}
                  className="text-xs px-2 py-1 rounded-lg outline-none cursor-pointer"
                  style={{ background: statusConfig[selectedTicket.status]?.bg, color: statusConfig[selectedTicket.status]?.color, border: 'none' }}>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              {/* Messages */}
              <div className="space-y-3 max-h-[400px] overflow-y-auto mb-4 pr-1">
                {selectedTicket.messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.sender.includes('videodj') ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[85%] px-3 py-2 rounded-xl text-sm"
                      style={{
                        background: msg.sender.includes('videodj') ? 'var(--brand-yellow-dim)' : 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                      }}>
                      <p>{msg.text}</p>
                      <p className="text-[9px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply */}
              <div className="flex gap-2">
                <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleReply()}
                  placeholder="Type reply..."
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }} />
                <button onClick={handleReply} className="p-2.5 rounded-xl"
                  style={{ background: replyText ? 'var(--brand-yellow)' : 'var(--bg-elevated)', color: replyText ? 'var(--bg-primary)' : 'var(--text-tertiary)' }}>
                  <Send size={16} />
                </button>
              </div>
            </>
          ) : (
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
