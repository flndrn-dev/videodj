'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, UserPlus, Eye, EyeOff, Trash2, Mail, X, Pencil, KeyRound, Copy, Check, PauseCircle, PlayCircle } from 'lucide-react'

type Role = 'admin' | 'support_agent' | 'beta_tester' | 'subscriber' | 'bookkeeper'

interface User {
  id: string
  email: string
  name: string
  role: Role
  roles: Role[]
  status: 'active' | 'invited' | 'disabled'
  avatar_url: string | null
  invited_by: string | null
  last_active: string | null
  sessions_count: number
  created_at: string
  updated_at: string
}

const ALL_ROLES: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'support_agent', label: 'Support Agent' },
  { value: 'beta_tester', label: 'Beta Tester' },
  { value: 'subscriber', label: 'Subscriber' },
  { value: 'bookkeeper', label: 'Bookkeeper' },
]

const roleBadgeColors: Record<string, { bg: string; text: string }> = {
  admin: { bg: 'var(--brand-yellow-dim)', text: 'var(--brand-yellow)' },
  support_agent: { bg: 'var(--system-blue-dim)', text: 'var(--system-blue)' },
  beta_tester: { bg: 'var(--ghost-purple-dim)', text: 'var(--ghost-purple)' },
  subscriber: { bg: 'var(--linus-green-dim)', text: 'var(--linus-green)' },
  bookkeeper: { bg: 'rgba(249,115,22,0.15)', text: '#f97316' },
}

const statusDotColors: Record<string, string> = {
  active: 'var(--status-green)',
  invited: 'var(--status-amber)',
  disabled: 'var(--status-red)',
}

function generatePassword(length = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%'
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map(b => chars[b % chars.length])
    .join('')
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRoles, setInviteRoles] = useState<Role[]>(['beta_tester'])
  const [filter, setFilter] = useState('all')

  // Edit modal
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editRoles, setEditRoles] = useState<Role[]>([])

  // Password reset modal
  const [resetUser, setResetUser] = useState<User | null>(null)
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [passwordCopied, setPasswordCopied] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(data => setUsers(data.users ?? []))
  }, [])

  const handleInvite = async () => {
    if (!inviteEmail) return
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, name: inviteName || inviteEmail.split('@')[0], role: inviteRoles[0] || 'subscriber', roles: inviteRoles }),
    })
    if (!res.ok) return
    const data = await res.json()
    setUsers(prev => [...prev, data.user])
    setInviteEmail(''); setInviteName(''); setShowInvite(false)
  }

  const toggleStatus = async (user: User) => {
    const newStatus = user.status === 'active' ? 'disabled' : 'active'
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) return
    const data = await res.json()
    setUsers(prev => prev.map(u => u.id === user.id ? data.user : u))
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
    if (!res.ok) return
    setUsers(prev => prev.filter(u => u.id !== id))
    setDeleteConfirm(null)
  }

  const openEdit = (user: User) => {
    setEditUser(user)
    setEditName(user.name)
    setEditEmail(user.email)
    setEditRoles(user.roles?.length > 0 ? user.roles : [user.role])
  }

  const toggleRole = (role: Role, list: Role[], setter: (r: Role[]) => void) => {
    if (list.includes(role)) {
      if (list.length > 1) setter(list.filter(r => r !== role)) // must keep at least one
    } else {
      setter([...list, role])
    }
  }

  const saveEdit = async () => {
    if (!editUser) return
    const primaryRole = editRoles.includes('admin') ? 'admin' : editRoles[0] || 'subscriber'
    const res = await fetch(`/api/users/${editUser.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, email: editEmail, role: primaryRole, roles: editRoles }),
    })
    if (!res.ok) return
    const data = await res.json()
    setUsers(prev => prev.map(u => u.id === editUser.id ? data.user : u))
    setEditUser(null)
  }

  const openResetPassword = (user: User) => {
    const pw = generatePassword()
    setResetUser(user)
    setGeneratedPassword(pw)
    setPasswordCopied(false)
    setPasswordSaved(false)
  }

  const savePassword = async () => {
    if (!resetUser || !generatedPassword) return
    const hash = await hashPassword(generatedPassword)
    const res = await fetch(`/api/users/${resetUser.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password_hash: hash }),
    })
    if (res.ok) setPasswordSaved(true)
  }

  const copyPassword = () => {
    navigator.clipboard.writeText(generatedPassword)
    setPasswordCopied(true)
    setTimeout(() => setPasswordCopied(false), 2000)
  }

  const filtered = filter === 'all' ? users : users.filter(u => u.roles?.includes(filter as Role) || u.role === filter)

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
        <button onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
          style={{ background: 'var(--brand-yellow)', color: 'var(--bg-primary)' }}>
          <UserPlus size={16} /> Invite User
        </button>
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="flex gap-2">
        {['all', 'admin', 'support_agent', 'beta_tester', 'subscriber', 'bookkeeper'].map(role => (
          <button key={role} onClick={() => setFilter(role)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: filter === role ? 'var(--brand-yellow-dim)' : 'var(--bg-card)',
              color: filter === role ? 'var(--brand-yellow)' : 'var(--text-tertiary)',
              border: `1px solid ${filter === role ? 'rgba(255,255,0,0.2)' : 'var(--border-primary)'}`,
            }}>
            {role === 'all' ? 'All' : role.replace(/_/g, ' ')}
          </button>
        ))}
      </motion.div>

      {/* User cards */}
      <div className="space-y-3">
        {filtered.map((user, i) => {
          const userRoles = user.roles?.length > 0 ? user.roles : [user.role]
          return (
            <motion.div key={user.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="glass-card glass-card--yellow p-5 transition-colors"
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,0,0.2)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)' }}>
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: roleBadgeColors[user.role]?.bg, color: roleBadgeColors[user.role]?.text, border: `1px solid ${roleBadgeColors[user.role]?.text}30` }}>
                  {user.name.charAt(0).toUpperCase()}
                </div>

                {/* Name + email */}
                <div className="shrink-0" style={{ width: 180 }}>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: statusDotColors[user.status] }} />
                      <span className="text-[9px] capitalize" style={{ color: 'var(--text-secondary)' }}>{user.status}</span>
                    </div>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{user.email}</p>
                </div>

                {/* Roles — center, takes remaining space */}
                <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
                  {userRoles.map(r => (
                    <span key={r} className="text-[10px] px-2.5 py-1 rounded-lg font-semibold uppercase tracking-wider"
                      style={{ background: roleBadgeColors[r]?.bg || 'var(--bg-elevated)', color: roleBadgeColors[r]?.text || 'var(--text-tertiary)', border: `1px solid ${roleBadgeColors[r]?.text || 'var(--border-secondary)'}25` }}>
                      {r.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>

                {/* Stats */}
                <div className="hidden md:flex items-center gap-6 shrink-0 text-right">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Sessions</p>
                    <p className="text-sm font-mono font-bold" style={{ color: 'var(--text-secondary)' }}>{user.sessions_count}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Last Active</p>
                    <p className="text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {user.last_active ? new Date(user.last_active).toLocaleDateString() : '—'}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => openEdit(user)} title="Edit user" className="p-2 rounded-lg transition-colors"
                    style={{ color: 'var(--brand-yellow)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-yellow-dim)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => toggleStatus(user)} title={user.status === 'active' ? 'Pause user' : 'Activate user'}
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: user.status === 'active' ? 'var(--status-amber)' : 'var(--status-green)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    {user.status === 'active' ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
                  </button>
                  <button onClick={() => openResetPassword(user)} title="Reset password" className="p-2 rounded-lg transition-colors"
                    style={{ color: 'var(--system-blue)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--system-blue-dim)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <KeyRound size={14} />
                  </button>
                  {user.role !== 'admin' && (
                    <button onClick={() => setDeleteConfirm(user.id)} title="Delete user" className="p-2 rounded-lg transition-colors"
                      style={{ color: 'var(--status-red)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* ── Invite Modal ───────────────────────────────────── */}
      <AnimatePresence>
        {showInvite && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowInvite(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="glass-card p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--brand-yellow)' }}>Invite User</h3>
                <button onClick={() => setShowInvite(false)} style={{ color: 'var(--text-tertiary)' }}><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>Email</label>
                  <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="user@example.com"
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>Name</label>
                  <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Display name"
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>
                    Roles <span className="normal-case text-[9px]" style={{ color: 'var(--text-tertiary)' }}>(select multiple)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_ROLES.map(({ value, label }) => {
                      const active = inviteRoles.includes(value)
                      return (
                        <button key={value} onClick={() => toggleRole(value, inviteRoles, setInviteRoles)}
                          className="px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all flex items-center gap-2"
                          style={{
                            background: active ? roleBadgeColors[value].bg : 'var(--bg-tertiary)',
                            color: active ? roleBadgeColors[value].text : 'var(--text-tertiary)',
                            border: `1px solid ${active ? `${roleBadgeColors[value].text}33` : 'var(--border-primary)'}`,
                          }}>
                          <div className="w-3.5 h-3.5 rounded border flex items-center justify-center"
                            style={{ borderColor: active ? roleBadgeColors[value].text : 'var(--border-secondary)', background: active ? roleBadgeColors[value].text : 'transparent' }}>
                            {active && <Check size={10} style={{ color: 'var(--bg-primary)' }} />}
                          </div>
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <button onClick={handleInvite} disabled={!inviteEmail}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mt-2"
                  style={{ background: inviteEmail ? 'var(--brand-yellow)' : 'var(--bg-elevated)', color: inviteEmail ? 'var(--bg-primary)' : 'var(--text-tertiary)', cursor: inviteEmail ? 'pointer' : 'not-allowed' }}>
                  <Mail size={16} /> Send Invite
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Edit Modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {editUser && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setEditUser(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="glass-card p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--brand-yellow)' }}>Edit User</h3>
                <button onClick={() => setEditUser(null)} style={{ color: 'var(--text-tertiary)' }}><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>Name</label>
                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>Email</label>
                  <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>
                    Roles <span className="normal-case text-[9px]" style={{ color: 'var(--text-tertiary)' }}>(select multiple)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_ROLES.map(({ value, label }) => {
                      const active = editRoles.includes(value)
                      return (
                        <button key={value} onClick={() => toggleRole(value, editRoles, setEditRoles)}
                          className="px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all flex items-center gap-2"
                          style={{
                            background: active ? roleBadgeColors[value].bg : 'var(--bg-tertiary)',
                            color: active ? roleBadgeColors[value].text : 'var(--text-tertiary)',
                            border: `1px solid ${active ? `${roleBadgeColors[value].text}33` : 'var(--border-primary)'}`,
                          }}>
                          <div className="w-3.5 h-3.5 rounded border flex items-center justify-center"
                            style={{ borderColor: active ? roleBadgeColors[value].text : 'var(--border-secondary)', background: active ? roleBadgeColors[value].text : 'transparent' }}>
                            {active && <Check size={10} style={{ color: 'var(--bg-primary)' }} />}
                          </div>
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <button onClick={saveEdit}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mt-2"
                  style={{ background: 'var(--brand-yellow)', color: 'var(--bg-primary)' }}>
                  <Check size={16} /> Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Reset Password Modal ──────────────────────────── */}
      <AnimatePresence>
        {resetUser && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setResetUser(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="glass-card p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--system-blue)' }}>Reset Password</h3>
                <button onClick={() => setResetUser(null)} style={{ color: 'var(--text-tertiary)' }}><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div className="px-4 py-3 rounded-xl" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>User</p>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{resetUser.name}</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{resetUser.email}</p>
                </div>

                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>
                    Generated Password
                  </label>
                  <div className="flex gap-2">
                    <input type="text" value={generatedPassword} readOnly
                      className="flex-1 px-4 py-3 rounded-xl text-sm font-mono outline-none"
                      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--brand-yellow)' }} />
                    <button onClick={copyPassword} title="Copy to clipboard"
                      className="px-3 rounded-xl transition-colors flex items-center gap-1"
                      style={{ background: passwordCopied ? 'rgba(34,197,94,0.15)' : 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: passwordCopied ? 'var(--status-green)' : 'var(--text-tertiary)' }}>
                      {passwordCopied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    <button onClick={() => setGeneratedPassword(generatePassword())} title="Generate new"
                      className="px-3 rounded-xl transition-colors"
                      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-tertiary)', fontSize: 11 }}>
                      New
                    </button>
                  </div>
                </div>

                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                  Copy this password and share it securely with the user. Once saved, only the hash is stored — the plain password cannot be recovered.
                </p>

                {passwordSaved ? (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
                    style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: 'var(--status-green)' }}>
                    <Check size={16} />
                    <span className="text-sm font-medium">Password saved. User can now sign in with the new password.</span>
                  </div>
                ) : (
                  <button onClick={savePassword}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium"
                    style={{ background: 'var(--system-blue)', color: 'white' }}>
                    <KeyRound size={16} /> Save New Password
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirm Modal ──────────────────────────── */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setDeleteConfirm(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="glass-card p-8 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--status-red)' }}>Delete User</h3>
              <p className="text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                {users.find(u => u.id === deleteConfirm)?.name}
              </p>
              <p className="text-xs mb-6" style={{ color: 'var(--text-tertiary)' }}>
                This will permanently remove the user, their tracks, playlists, and all associated data. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-medium"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}>
                  Cancel
                </button>
                <button onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                  style={{ background: 'var(--status-red)', color: 'white' }}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
