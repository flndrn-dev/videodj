'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, UserPlus, Send, Calendar, Trash2, Gift, Clock, CheckCircle, X } from 'lucide-react'

interface Subscriber {
  id: string
  email: string
  status: string
  source: string
  subscribed_at: string
}

const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  pending:   { color: 'var(--status-amber)', bg: 'rgba(245,158,11,0.15)', label: 'Pending' },
  invited:   { color: 'var(--system-blue)',   bg: 'rgba(59,130,246,0.15)', label: 'Invited' },
  converted: { color: 'var(--status-green)',  bg: 'rgba(34,197,94,0.15)',  label: 'Converted' },
}

export default function SubscribersPage() {
  const [tab, setTab] = useState<'early' | 'newsletter'>('early')
  const [early, setEarly] = useState<Subscriber[]>([])
  const [newsletter, setNewsletter] = useState<Subscriber[]>([])
  const [totalEarly, setTotalEarly] = useState(0)
  const [totalNewsletter, setTotalNewsletter] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Add subscriber modal
  const [showAdd, setShowAdd] = useState(false)
  const [newEmail, setNewEmail] = useState('')

  // Newsletter draft (Phase B placeholder)
  const [nlSubject, setNlSubject] = useState('')
  const [nlBody, setNlBody] = useState('')

  const fetchData = async () => {
    try {
      const res = await fetch('/api/subscribers')
      const data = await res.json()
      setEarly(data.early || [])
      setNewsletter(data.newsletter || [])
      setTotalEarly(data.totalEarly || 0)
      setTotalNewsletter(data.totalNewsletter || 0)
    } catch { /* silent */ }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const doAction = async (action: string, id?: string, extra?: Record<string, string>) => {
    setActionLoading(id || action)
    try {
      await fetch('/api/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id, ...extra }),
      })
      await fetchData()
    } catch { /* silent */ }
    setActionLoading(null)
  }

  const handleAdd = async () => {
    if (!newEmail.trim()) return
    await doAction('add', undefined, { email: newEmail.trim(), source: 'newsletter' })
    setNewEmail('')
    setShowAdd(false)
  }

  const rows = tab === 'early' ? early : newsletter
  const total = tab === 'early' ? totalEarly : totalNewsletter

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header stats */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        {[
          { label: 'Early Subscribers', value: totalEarly, icon: Mail, color: 'var(--brand-yellow)' },
          { label: 'Newsletter', value: totalNewsletter, icon: Send, color: 'var(--system-blue)' },
          { label: 'Converted', value: early.filter(s => s.status === 'converted').length, icon: CheckCircle, color: 'var(--status-green)' },
          { label: 'Pending', value: early.filter(s => s.status === 'pending').length, icon: Clock, color: 'var(--status-amber)' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.3 }}
            className="rounded-xl p-4"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={14} style={{ color: stat.color }} />
              <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                {stat.label}
              </span>
            </div>
            <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        {(['early', 'newsletter'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: tab === t ? 'var(--brand-yellow-dim)' : 'var(--bg-card)',
              color: tab === t ? 'var(--brand-yellow)' : 'var(--text-secondary)',
              border: `1px solid ${tab === t ? 'rgba(255,255,0,0.3)' : 'var(--border-primary)'}`,
            }}
          >
            {t === 'early' ? 'Early Subscribers' : 'Newsletter'}
          </button>
        ))}

        <div className="flex-1" />

        {tab === 'newsletter' && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: 'var(--brand-yellow-dim)',
              color: 'var(--brand-yellow)',
              border: '1px solid rgba(255,255,0,0.3)',
            }}
          >
            <UserPlus size={13} />
            Add Subscriber
          </button>
        )}
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="rounded-xl overflow-hidden"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-primary)',
        }}
      >
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {tab === 'early' ? 'Early Subscribers' : 'Newsletter Subscribers'}{' '}
            <span style={{ color: 'var(--text-tertiary)' }}>({total})</span>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                {['#', 'Email', 'Status', 'Source', 'Subscribed', 'Actions'].map(h => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    Loading...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    No subscribers yet
                  </td>
                </tr>
              ) : (
                rows.map((sub, idx) => {
                  const st = statusConfig[sub.status] || statusConfig.pending
                  const isLoading = actionLoading === sub.id
                  return (
                    <motion.tr
                      key={sub.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.02 }}
                      style={{ borderBottom: '1px solid var(--border-primary)' }}
                      className="transition-colors"
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--text-tertiary)' }}>{idx + 1}</td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>{sub.email}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ background: st.bg, color: st.color }}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{sub.source || '—'}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--text-tertiary)' }}>
                        {sub.subscribed_at ? new Date(sub.subscribed_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {sub.status !== 'converted' && (
                            <button
                              onClick={() => doAction('convert', sub.id)}
                              disabled={isLoading}
                              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all"
                              style={{
                                background: 'rgba(34,197,94,0.15)',
                                color: 'var(--status-green)',
                                border: '1px solid rgba(34,197,94,0.2)',
                                opacity: isLoading ? 0.5 : 1,
                              }}
                              title="Convert to user with 14-day trial + send invite"
                            >
                              <Gift size={10} />
                              Convert
                            </button>
                          )}
                          <button
                            onClick={() => doAction('extend_trial', sub.id)}
                            disabled={isLoading}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all"
                            style={{
                              background: 'rgba(59,130,246,0.15)',
                              color: 'var(--system-blue)',
                              border: '1px solid rgba(59,130,246,0.2)',
                              opacity: isLoading ? 0.5 : 1,
                            }}
                            title="Reset trial to 14 days"
                          >
                            <Clock size={10} />
                            Extend
                          </button>
                          <button
                            onClick={() => doAction('delete', sub.id)}
                            disabled={isLoading}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all"
                            style={{
                              background: 'rgba(239,68,68,0.15)',
                              color: 'var(--status-red)',
                              border: '1px solid rgba(239,68,68,0.2)',
                              opacity: isLoading ? 0.5 : 1,
                            }}
                            title="Delete subscriber"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Newsletter composer (Phase B placeholder) */}
      {tab === 'newsletter' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="rounded-xl p-5 space-y-4"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-primary)',
          }}
        >
          <div className="flex items-center gap-2">
            <Send size={14} style={{ color: 'var(--brand-yellow)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              Create Newsletter
            </span>
            <span
              className="ml-2 px-2 py-0.5 rounded-full text-[9px] font-semibold"
              style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--status-amber)' }}
            >
              Phase B
            </span>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="Subject line..."
              value={nlSubject}
              onChange={e => setNlSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            />
            <textarea
              placeholder="Message body (HTML supported)..."
              value={nlBody}
              onChange={e => setNlBody(e.target.value)}
              rows={5}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            />
            <div className="flex items-center gap-2">
              <button
                disabled
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-tertiary)',
                  border: '1px solid var(--border-primary)',
                  opacity: 0.5,
                  cursor: 'not-allowed',
                }}
              >
                <Calendar size={12} />
                Schedule
              </button>
              <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                Newsletter scheduling coming soon
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Add Subscriber Modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-sm rounded-2xl p-6 space-y-4"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-primary)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Add Newsletter Subscriber
                </h3>
                <button onClick={() => setShowAdd(false)} style={{ color: 'var(--text-tertiary)' }}>
                  <X size={16} />
                </button>
              </div>

              <input
                type="email"
                placeholder="email@example.com"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                autoFocus
                className="w-full px-3 py-2.5 rounded-lg text-xs outline-none"
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowAdd(false)}
                  className="px-3 py-2 rounded-lg text-xs font-semibold"
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-primary)',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                  style={{
                    background: 'var(--brand-yellow-dim)',
                    color: 'var(--brand-yellow)',
                    border: '1px solid rgba(255,255,0,0.3)',
                  }}
                >
                  <UserPlus size={12} />
                  Add
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
