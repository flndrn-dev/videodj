'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, UserPlus, Eye, EyeOff, Trash2, Mail, X } from 'lucide-react'
import { getUsers, addUser, updateUser, deleteUser, type User } from '@/lib/store'

const roleBadgeColors: Record<string, { bg: string; text: string }> = {
  admin: { bg: 'var(--brand-yellow-dim)', text: 'var(--brand-yellow)' },
  support_agent: { bg: 'var(--system-blue-dim)', text: 'var(--system-blue)' },
  beta_tester: { bg: 'var(--ghost-purple-dim)', text: 'var(--ghost-purple)' },
  subscriber: { bg: 'var(--linus-green-dim)', text: 'var(--linus-green)' },
}

const statusDotColors: Record<string, string> = {
  active: 'var(--status-green)',
  invited: 'var(--status-amber)',
  disabled: 'var(--status-red)',
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<User['role']>('beta_tester')
  const [filter, setFilter] = useState('all')

  useEffect(() => { setUsers(getUsers()) }, [])

  const handleInvite = () => {
    if (!inviteEmail) return
    const user = addUser({
      email: inviteEmail,
      name: inviteName || inviteEmail.split('@')[0],
      role: inviteRole,
      status: 'invited',
      invitedAt: new Date().toISOString(),
      lastActive: null,
      invitedBy: 'DJ Bodhi',
      sessions: 0,
    })
    setUsers(prev => [...prev, user])
    setInviteEmail('')
    setInviteName('')
    setShowInvite(false)
  }

  const toggleStatus = (id: string, status: string) => {
    const newStatus = status === 'active' ? 'disabled' : 'active'
    updateUser(id, { status: newStatus as User['status'] })
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: newStatus as User['status'] } : u))
  }

  const handleDelete = (id: string) => {
    deleteUser(id)
    setUsers(prev => prev.filter(u => u.id !== id))
  }

  const filtered = filter === 'all' ? users : users.filter(u => u.role === filter)

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold glow-yellow" style={{ color: 'var(--brand-yellow)' }}>User Management</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {users.length} users — {users.filter(u => u.status === 'active').length} active
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
          style={{ background: 'var(--brand-yellow)', color: 'var(--bg-primary)' }}
        >
          <UserPlus size={16} />
          Invite User
        </button>
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="flex gap-2">
        {['all', 'admin', 'support_agent', 'beta_tester', 'subscriber'].map(role => (
          <button
            key={role}
            onClick={() => setFilter(role)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: filter === role ? 'var(--brand-yellow-dim)' : 'var(--bg-card)',
              color: filter === role ? 'var(--brand-yellow)' : 'var(--text-tertiary)',
              border: `1px solid ${filter === role ? 'rgba(255,255,0,0.2)' : 'var(--border-primary)'}`,
            }}
          >
            {role === 'all' ? 'All' : role.replace(/_/g, ' ')}
          </button>
        ))}
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card glass-card--yellow overflow-hidden">
        <div className="hidden lg:grid grid-cols-[1fr_130px_100px_80px_90px_80px] gap-4 px-6 py-3 text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-primary)' }}>
          <span>User</span><span>Role</span><span>Status</span><span>Sessions</span><span>Last Active</span><span>Actions</span>
        </div>
        {filtered.map((user, i) => (
          <motion.div key={user.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
            className="flex flex-col lg:grid lg:grid-cols-[1fr_130px_100px_80px_90px_80px] gap-2 lg:gap-4 px-4 lg:px-6 py-4 lg:items-center transition-colors"
            style={{ borderBottom: '1px solid var(--border-primary)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                style={{ background: roleBadgeColors[user.role]?.bg, color: roleBadgeColors[user.role]?.text }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{user.email}</p>
              </div>
            </div>
            <span className="text-[10px] px-2 py-1 rounded-md font-semibold uppercase tracking-wider w-fit"
              style={{ background: roleBadgeColors[user.role]?.bg, color: roleBadgeColors[user.role]?.text }}>
              {user.role.replace(/_/g, ' ')}
            </span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: statusDotColors[user.status] }} />
              <span className="text-xs capitalize" style={{ color: 'var(--text-secondary)' }}>{user.status}</span>
            </div>
            <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{user.sessions}</span>
            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              {user.lastActive ? new Date(user.lastActive).toLocaleDateString() : '—'}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => toggleStatus(user.id, user.status)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
                {user.status === 'active' ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              {user.role !== 'admin' && (
                <button onClick={() => handleDelete(user.id)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Invite Modal */}
      <AnimatePresence>
        {showInvite && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowInvite(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--brand-yellow)' }}>Invite User</h3>
                <button onClick={() => setShowInvite(false)} style={{ color: 'var(--text-tertiary)' }}><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>Email</label>
                  <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="user@example.com"
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>Name</label>
                  <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Display name"
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['beta_tester', 'support_agent', 'subscriber', 'admin'] as const).map(role => (
                      <button key={role} onClick={() => setInviteRole(role)}
                        className="px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all"
                        style={{
                          background: inviteRole === role ? roleBadgeColors[role].bg : 'var(--bg-tertiary)',
                          color: inviteRole === role ? roleBadgeColors[role].text : 'var(--text-tertiary)',
                          border: `1px solid ${inviteRole === role ? `${roleBadgeColors[role].text}33` : 'var(--border-primary)'}`,
                        }}>
                        {role.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={handleInvite} disabled={!inviteEmail}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mt-2"
                  style={{
                    background: inviteEmail ? 'var(--brand-yellow)' : 'var(--bg-elevated)',
                    color: inviteEmail ? 'var(--bg-primary)' : 'var(--text-tertiary)',
                    cursor: inviteEmail ? 'pointer' : 'not-allowed',
                  }}>
                  <Mail size={16} />
                  Send Invite
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
