'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Music, ListMusic, MessageSquare, Monitor, Hash, Mail, User, Shield, Clock, Activity, Pencil, PauseCircle, PlayCircle, KeyRound, Trash2 } from 'lucide-react'

type Role = 'admin' | 'support_agent' | 'beta_tester' | 'subscriber' | 'bookkeeper'

interface UserData {
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

interface Stats {
  tracks: number
  totalPlays: number
  playlists: number
  conversations: number
  totalMessages: number
  activeSessions: number
}

const roleBadgeColors: Record<string, { bg: string; text: string }> = {
  admin: { bg: 'var(--brand-yellow-dim)', text: 'var(--brand-yellow)' },
  support_agent: { bg: 'var(--system-blue-dim)', text: 'var(--system-blue)' },
  beta_tester: { bg: 'var(--ghost-purple-dim)', text: 'var(--ghost-purple)' },
  subscriber: { bg: 'var(--linus-green-dim)', text: 'var(--linus-green)' },
  bookkeeper: { bg: 'rgba(249,115,22,0.15)', text: '#f97316' },
}

const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
  active: { bg: 'rgba(34,197,94,0.1)', text: 'var(--status-green)', dot: 'var(--status-green)' },
  invited: { bg: 'rgba(245,158,11,0.1)', text: 'var(--status-amber)', dot: 'var(--status-amber)' },
  disabled: { bg: 'rgba(239,68,68,0.1)', text: 'var(--status-red)', dot: 'var(--status-red)' },
}

export default function UserProfilePage() {
  const params = useParams()
  const router = useRouter()
  const [user, setUser] = useState<UserData | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!params.id) return
    fetch(`/api/users/${params.id}`)
      .then(r => {
        if (!r.ok) throw new Error('User not found')
        return r.json()
      })
      .then(data => {
        setUser(data.user)
        setStats(data.stats)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--brand-yellow)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.push('/users')} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          <ArrowLeft size={16} /> Back to Users
        </button>
        <div className="glass-card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--status-red)' }}>{error || 'User not found'}</p>
        </div>
      </div>
    )
  }

  const userRoles = user.roles?.length > 0 ? user.roles : [user.role]
  const statusStyle = statusColors[user.status] || statusColors.active

  const statCards = [
    { label: 'Tracks', value: stats?.tracks ?? 0, sub: `${stats?.totalPlays ?? 0} total plays`, icon: Music, color: 'var(--brand-yellow)' },
    { label: 'Playlists', value: stats?.playlists ?? 0, sub: null, icon: ListMusic, color: 'var(--system-blue)' },
    { label: 'Conversations', value: stats?.conversations ?? 0, sub: `${stats?.totalMessages ?? 0} messages`, icon: MessageSquare, color: 'var(--ghost-purple)' },
    { label: 'Active Sessions', value: stats?.activeSessions ?? 0, sub: null, icon: Monitor, color: 'var(--linus-green)' },
  ]

  const details = [
    { label: 'ID', value: user.id, mono: true, icon: Hash },
    { label: 'Email', value: user.email, mono: false, icon: Mail },
    { label: 'Name', value: user.name, mono: false, icon: User },
    { label: 'Primary Role', value: user.role.replace(/_/g, ' '), mono: false, icon: Shield },
    { label: 'Status', value: user.status, mono: false, icon: Activity },
    { label: 'Created', value: new Date(user.created_at).toLocaleString(), mono: false, icon: Clock },
    { label: 'Last Active', value: user.last_active ? new Date(user.last_active).toLocaleString() : 'Never', mono: false, icon: Clock },
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back button */}
      <motion.button
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={() => router.push('/users')}
        className="flex items-center gap-2 text-sm transition-colors"
        style={{ color: 'var(--text-tertiary)' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--brand-yellow)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
      >
        <ArrowLeft size={16} /> Back to Users
      </motion.button>

      {/* User header card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass-card glass-card--yellow p-6"
      >
        <div className="flex items-start gap-5">
          {/* Large avatar */}
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shrink-0"
            style={{
              background: roleBadgeColors[user.role]?.bg,
              color: roleBadgeColors[user.role]?.text,
              border: `1px solid ${roleBadgeColors[user.role]?.text}30`,
            }}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            {/* Name row */}
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {user.name}
              </h1>
              <span
                className="text-[10px] px-2.5 py-1 rounded-lg font-semibold capitalize flex items-center gap-1.5"
                style={{ background: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.text}25` }}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: statusStyle.dot }} />
                {user.status}
              </span>
            </div>

            {/* Email */}
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{user.email}</p>

            {/* Member since */}
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Member since {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>

            {/* Roles row */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {userRoles.map(r => (
                <span
                  key={r}
                  className="text-[10px] px-2.5 py-1 rounded-lg font-semibold uppercase tracking-wider"
                  style={{
                    background: roleBadgeColors[r]?.bg || 'var(--bg-elevated)',
                    color: roleBadgeColors[r]?.text || 'var(--text-tertiary)',
                    border: `1px solid ${roleBadgeColors[r]?.text || 'var(--border-secondary)'}25`,
                  }}
                >
                  {r.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((card, i) => {
          const Icon = card.icon
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.04 }}
              className="glass-card p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} style={{ color: card.color }} />
                <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  {card.label}
                </p>
              </div>
              <p className="text-2xl font-bold font-mono" style={{ color: card.color }}>
                {card.value}
              </p>
              {card.sub && (
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{card.sub}</p>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* User details */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card p-5"
      >
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--brand-yellow)' }}>User Details</h2>
        <div className="space-y-3">
          {details.map(d => {
            const Icon = d.icon
            return (
              <div key={d.label} className="flex items-center gap-3">
                <Icon size={13} style={{ color: 'var(--text-tertiary)' }} />
                <span className="text-[11px] uppercase tracking-wider font-medium shrink-0" style={{ color: 'var(--text-tertiary)', width: 100 }}>
                  {d.label}
                </span>
                <span
                  className={`text-sm ${d.mono ? 'font-mono text-[12px]' : ''}`}
                  style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}
                >
                  {d.value}
                </span>
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="glass-card p-5"
      >
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--brand-yellow)' }}>Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => router.push('/users')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-colors"
            style={{ background: 'var(--brand-yellow-dim)', color: 'var(--brand-yellow)', border: '1px solid rgba(255,255,0,0.15)' }}
          >
            <Pencil size={13} /> Edit on Users page
          </button>
          <button
            onClick={async () => {
              const newStatus = user.status === 'active' ? 'disabled' : 'active'
              const res = await fetch(`/api/users/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
              })
              if (res.ok) {
                const data = await res.json()
                setUser(data.user)
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-colors"
            style={{
              background: user.status === 'active' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
              color: user.status === 'active' ? 'var(--status-amber)' : 'var(--status-green)',
              border: `1px solid ${user.status === 'active' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)'}`,
            }}
          >
            {user.status === 'active' ? <PauseCircle size={13} /> : <PlayCircle size={13} />}
            {user.status === 'active' ? 'Pause User' : 'Resume User'}
          </button>
          <button
            onClick={() => router.push('/users')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-colors"
            style={{ background: 'var(--system-blue-dim)', color: 'var(--system-blue)', border: '1px solid rgba(59,130,246,0.15)' }}
          >
            <KeyRound size={13} /> Reset Password
          </button>
          {user.role !== 'admin' && (
            <button
              onClick={async () => {
                if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return
                const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
                if (res.ok) router.push('/users')
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-colors"
              style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--status-red)', border: '1px solid rgba(239,68,68,0.15)' }}
            >
              <Trash2 size={13} /> Delete User
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
