'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Music, ListMusic, MessageSquare, Monitor, Hash, Mail, User, Shield, Clock, Activity,
  Pencil, PauseCircle, PlayCircle, KeyRound, Trash2, X, Check, Copy, Calendar, MapPin, Phone, Globe
} from 'lucide-react'

type Role = 'admin' | 'support_agent' | 'beta_tester' | 'subscriber' | 'bookkeeper'

interface UserData {
  id: string; email: string; name: string; role: Role; roles: Role[]
  status: 'active' | 'invited' | 'disabled'; tier: string
  avatar_url: string | null; invited_by: string | null; last_active: string | null
  sessions_count: number; created_at: string; updated_at: string
  profile_data: { phone?: string; dob?: string; country?: string; city?: string; address1?: string; address2?: string; postalCode?: string } | null
}

interface Stats {
  tracks: number; totalPlays: number; playlists: number
  conversations: number; totalMessages: number; activeSessions: number
}

const roleBadgeColors: Record<string, { bg: string; text: string }> = {
  admin: { bg: 'var(--brand-yellow-dim)', text: 'var(--brand-yellow)' },
  support_agent: { bg: 'var(--system-blue-dim)', text: 'var(--system-blue)' },
  beta_tester: { bg: 'var(--ghost-purple-dim)', text: 'var(--ghost-purple)' },
  subscriber: { bg: 'var(--linus-green-dim)', text: 'var(--linus-green)' },
  bookkeeper: { bg: 'rgba(249,115,22,0.15)', text: '#f97316' },
}

const statusColors: Record<string, { bg: string; text: string }> = {
  active: { bg: 'rgba(34,197,94,0.1)', text: 'var(--status-green)' },
  invited: { bg: 'rgba(245,158,11,0.1)', text: 'var(--status-amber)' },
  disabled: { bg: 'rgba(239,68,68,0.1)', text: 'var(--status-red)' },
}

const tierColors: Record<string, { bg: string; text: string; label: string }> = {
  free: { bg: 'var(--bg-elevated)', text: 'var(--text-tertiary)', label: 'Free Trial' },
  dj: { bg: 'var(--brand-yellow-dim)', text: 'var(--brand-yellow)', label: 'DJ \u2014 \u20ac29.99/mo' },
}

const ALL_ROLES: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Admin' }, { value: 'support_agent', label: 'Support Agent' },
  { value: 'beta_tester', label: 'Beta Tester' }, { value: 'subscriber', label: 'Subscriber' },
  { value: 'bookkeeper', label: 'Bookkeeper' },
]

function generatePassword(length = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%'
  return Array.from(crypto.getRandomValues(new Uint8Array(length))).map(b => chars[b % chars.length]).join('')
}

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function UserProfilePage() {
  const params = useParams()
  const router = useRouter()
  const [user, setUser] = useState<UserData | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit modal
  const [showEdit, setShowEdit] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editRoles, setEditRoles] = useState<Role[]>([])

  // Password modal
  const [showPassword, setShowPassword] = useState(false)
  const [generatedPw, setGeneratedPw] = useState('')
  const [pwCopied, setPwCopied] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)

  // Delete confirm
  const [showDelete, setShowDelete] = useState(false)

  useEffect(() => {
    if (!params.id) return
    fetch(`/api/users/${params.id}`)
      .then(r => { if (!r.ok) throw new Error('User not found'); return r.json() })
      .then(data => { setUser(data.user); setStats(data.stats) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [params.id])

  const openEdit = () => {
    if (!user) return
    setEditName(user.name); setEditEmail(user.email)
    setEditRoles(user.roles?.length > 0 ? user.roles : [user.role])
    setShowEdit(true)
  }

  const saveEdit = async () => {
    if (!user) return
    const primaryRole = editRoles.includes('admin') ? 'admin' : editRoles[0] || 'subscriber'
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, email: editEmail, role: primaryRole, roles: editRoles }),
    })
    if (res.ok) { const data = await res.json(); setUser(data.user); setShowEdit(false) }
  }

  const toggleRole = (role: Role) => {
    setEditRoles(prev => prev.includes(role) ? (prev.length > 1 ? prev.filter(r => r !== role) : prev) : [...prev, role])
  }

  const openPassword = () => {
    setGeneratedPw(generatePassword()); setPwCopied(false); setPwSaved(false); setShowPassword(true)
  }

  const savePassword = async () => {
    if (!user) return
    const hash = await hashPassword(generatedPw)
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password_hash: hash }),
    })
    if (res.ok) setPwSaved(true)
  }

  const toggleStatus = async () => {
    if (!user) return
    const newStatus = user.status === 'active' ? 'disabled' : 'active'
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) { const data = await res.json(); setUser(data.user) }
  }

  const handleDelete = async () => {
    if (!user) return
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
    if (res.ok) router.push('/users')
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--brand-yellow)', borderTopColor: 'transparent' }} />
    </div>
  )

  if (error || !user) return (
    <div className="space-y-4">
      <button onClick={() => router.push('/users')} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
        <ArrowLeft size={16} /> Back to Users
      </button>
      <div className="glass-card p-8 text-center">
        <p className="text-sm" style={{ color: 'var(--status-red)' }}>{error || 'User not found'}</p>
      </div>
    </div>
  )

  const userRoles = user.roles?.length > 0 ? user.roles : [user.role]
  const sc = statusColors[user.status] || statusColors.active
  const tc = tierColors[user.tier || 'free'] || tierColors.free
  const profile = user.profile_data || {}

  return (
    <div className="space-y-6">
      {/* Back */}
      <motion.button initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
        onClick={() => router.push('/users')} className="flex items-center gap-2 text-sm transition-colors"
        style={{ color: 'var(--text-tertiary)' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--brand-yellow)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)' }}>
        <ArrowLeft size={16} /> Back to Users
      </motion.button>

      {/* ── Profile Header ────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card glass-card--yellow p-8">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold shrink-0"
            style={{ background: roleBadgeColors[user.role]?.bg, color: roleBadgeColors[user.role]?.text, border: `2px solid ${roleBadgeColors[user.role]?.text}40` }}>
            {user.name.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1">
            {/* Name + status + tier */}
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{user.name}</h1>
              <span className="text-[10px] px-2.5 py-1 rounded-lg font-semibold capitalize flex items-center gap-1.5"
                style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.text}25` }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: sc.text }} />
                {user.status}
              </span>
              <span className="text-[10px] px-2.5 py-1 rounded-lg font-semibold"
                style={{ background: tc.bg, color: tc.text, border: `1px solid ${tc.text}25` }}>
                {tc.label}
              </span>
            </div>

            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{user.email}</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Member since {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              {user.last_active && ` · Last active ${new Date(user.last_active).toLocaleDateString()}`}
            </p>

            {/* Roles */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {userRoles.map(r => (
                <span key={r} className="text-[10px] px-2.5 py-1 rounded-lg font-semibold uppercase tracking-wider"
                  style={{ background: roleBadgeColors[r]?.bg, color: roleBadgeColors[r]?.text, border: `1px solid ${roleBadgeColors[r]?.text}25` }}>
                  {r.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex md:flex-col gap-2 shrink-0">
            <button onClick={openEdit} className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-medium transition-colors"
              style={{ background: 'var(--brand-yellow-dim)', color: 'var(--brand-yellow)', border: '1px solid rgba(255,255,0,0.15)' }}>
              <Pencil size={12} /> Edit
            </button>
            <button onClick={toggleStatus} className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-medium transition-colors"
              style={{ background: user.status === 'active' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)', color: user.status === 'active' ? 'var(--status-amber)' : 'var(--status-green)', border: `1px solid ${user.status === 'active' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)'}` }}>
              {user.status === 'active' ? <PauseCircle size={12} /> : <PlayCircle size={12} />}
              {user.status === 'active' ? 'Pause' : 'Resume'}
            </button>
            <button onClick={openPassword} className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-medium transition-colors"
              style={{ background: 'var(--system-blue-dim)', color: 'var(--system-blue)', border: '1px solid rgba(59,130,246,0.15)' }}>
              <KeyRound size={12} /> Reset PW
            </button>
            {user.role !== 'admin' && (
              <button onClick={() => setShowDelete(true)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-medium transition-colors"
                style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--status-red)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Stats ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Tracks', value: stats?.tracks ?? 0, sub: `${stats?.totalPlays ?? 0} total plays`, icon: Music, color: 'var(--brand-yellow)' },
          { label: 'Playlists', value: stats?.playlists ?? 0, sub: null, icon: ListMusic, color: 'var(--system-blue)' },
          { label: 'Conversations', value: stats?.conversations ?? 0, sub: `${stats?.totalMessages ?? 0} messages`, icon: MessageSquare, color: 'var(--ghost-purple)' },
          { label: 'Active Sessions', value: stats?.activeSessions ?? 0, sub: `${user.sessions_count} total`, icon: Monitor, color: 'var(--linus-green)' },
        ].map((card, i) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.04 }}
            className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <card.icon size={14} style={{ color: card.color }} />
              <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-tertiary)' }}>{card.label}</p>
            </div>
            <p className="text-2xl font-bold font-mono" style={{ color: card.color }}>{card.value}</p>
            {card.sub && <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{card.sub}</p>}
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Account Details ──────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--brand-yellow)' }}>
            <User size={14} /> Account Details
          </h2>
          <div className="space-y-3">
            {[
              { icon: Hash, label: 'User ID', value: user.id, mono: true },
              { icon: Mail, label: 'Email', value: user.email },
              { icon: Shield, label: 'Primary Role', value: user.role.replace(/_/g, ' ') },
              { icon: Activity, label: 'Status', value: user.status },
              { icon: Clock, label: 'Created', value: new Date(user.created_at).toLocaleString() },
              { icon: Clock, label: 'Last Active', value: user.last_active ? new Date(user.last_active).toLocaleString() : 'Never' },
              { icon: Monitor, label: 'Total Sessions', value: String(user.sessions_count) },
            ].map(d => (
              <div key={d.label} className="flex items-center gap-3 py-1.5" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <d.icon size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                <span className="text-[10px] uppercase tracking-wider font-medium shrink-0" style={{ color: 'var(--text-tertiary)', width: 90 }}>{d.label}</span>
                <span className={`text-[12px] ${d.mono ? 'font-mono text-[11px]' : ''}`} style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>{d.value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Profile / KYC ────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--system-blue)' }}>
            <Globe size={14} /> Profile Information
          </h2>
          {Object.values(profile).some(v => v) ? (
            <div className="space-y-3">
              {[
                { icon: Phone, label: 'Phone', value: profile.phone },
                { icon: Calendar, label: 'Date of Birth', value: profile.dob },
                { icon: Globe, label: 'Country', value: profile.country },
                { icon: MapPin, label: 'City', value: profile.city },
                { icon: MapPin, label: 'Address', value: [profile.address1, profile.address2].filter(Boolean).join(', ') },
                { icon: Hash, label: 'Postal Code', value: profile.postalCode },
              ].filter(d => d.value).map(d => (
                <div key={d.label} className="flex items-center gap-3 py-1.5" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <d.icon size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  <span className="text-[10px] uppercase tracking-wider font-medium shrink-0" style={{ color: 'var(--text-tertiary)', width: 90 }}>{d.label}</span>
                  <span className="text-[12px]" style={{ color: 'var(--text-primary)' }}>{d.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-2" style={{ color: 'var(--text-tertiary)' }}>
              <Globe size={24} style={{ opacity: 0.3 }} />
              <p className="text-sm">No profile data yet</p>
              <p className="text-[10px]">User hasn&apos;t filled in their profile / KYC information</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Edit Modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {showEdit && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowEdit(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="glass-card p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--brand-yellow)' }}>Edit User</h3>
                <button onClick={() => setShowEdit(false)} style={{ color: 'var(--text-tertiary)' }}><X size={20} /></button>
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
                  <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>Roles</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_ROLES.map(({ value, label }) => {
                      const active = editRoles.includes(value)
                      return (
                        <button key={value} onClick={() => toggleRole(value)}
                          className="px-3 py-2 rounded-xl text-xs font-medium text-left flex items-center gap-2"
                          style={{ background: active ? roleBadgeColors[value].bg : 'var(--bg-tertiary)', color: active ? roleBadgeColors[value].text : 'var(--text-tertiary)', border: `1px solid ${active ? `${roleBadgeColors[value].text}33` : 'var(--border-primary)'}` }}>
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
                <button onClick={saveEdit} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium"
                  style={{ background: 'var(--brand-yellow)', color: 'var(--bg-primary)' }}>
                  <Check size={16} /> Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Password Reset Modal ──────────────────────────── */}
      <AnimatePresence>
        {showPassword && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowPassword(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="glass-card p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--system-blue)' }}>Reset Password</h3>
                <button onClick={() => setShowPassword(false)} style={{ color: 'var(--text-tertiary)' }}><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div className="px-4 py-3 rounded-xl" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>User</p>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{user.name} — {user.email}</p>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>Generated Password</label>
                  <div className="flex gap-2">
                    <input type="text" value={generatedPw} readOnly className="flex-1 px-4 py-3 rounded-xl text-sm font-mono outline-none"
                      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--brand-yellow)' }} />
                    <button onClick={() => { navigator.clipboard.writeText(generatedPw); setPwCopied(true); setTimeout(() => setPwCopied(false), 2000) }}
                      className="px-3 rounded-xl flex items-center" style={{ background: pwCopied ? 'rgba(34,197,94,0.15)' : 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: pwCopied ? 'var(--status-green)' : 'var(--text-tertiary)' }}>
                      {pwCopied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    <button onClick={() => setGeneratedPw(generatePassword())} className="px-3 rounded-xl text-[11px]"
                      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-tertiary)' }}>New</button>
                  </div>
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Copy and share securely. Only the hash is stored.</p>
                {pwSaved ? (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: 'var(--status-green)' }}>
                    <Check size={16} /> <span className="text-sm font-medium">Password saved.</span>
                  </div>
                ) : (
                  <button onClick={savePassword} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium"
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
        {showDelete && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowDelete(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="glass-card p-8 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--status-red)' }}>Delete User</h3>
              <p className="text-sm mb-1" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
              <p className="text-xs mb-6" style={{ color: 'var(--text-tertiary)' }}>
                This permanently removes the user, their tracks, playlists, and all data. Cannot be undone.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowDelete(false)} className="flex-1 px-4 py-3 rounded-xl text-sm font-medium"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}>Cancel</button>
                <button onClick={handleDelete} className="flex-1 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
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
