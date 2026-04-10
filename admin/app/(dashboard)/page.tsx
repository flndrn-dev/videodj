'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Ghost, Bot, Music, Users, Activity, MessageSquare, BookOpen, Wrench, MonitorCheck, Clock, UserPlus, Ticket, Lightbulb, DollarSign, Server, ChevronRight, ChevronDown, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { Heartbeat } from '@/components/ghost/Heartbeat'
import { useGhostHealth } from '@/app/hooks/useGhostHealth'

const GHOST_URL = process.env.NEXT_PUBLIC_GHOST_URL || 'https://ghost.videodj.studio'
const GHOST_API_KEY = process.env.NEXT_PUBLIC_GHOST_API_KEY || ''

interface GhostActivity {
  id: number
  type: string
  severity: string
  component: string
  error_message: string
  fix_applied: string
  fix_result: string
  created_at: string
}

interface DashboardData {
  totalUsers: number
  totalTracks: number
  activeSessions: number
  totalConversations: number
  recentTracks: { id: string; title: string; artist: string; created_at: string }[]
  recentUsers: { id: string; name: string; email: string; last_active: string }[]
  recentConversations: { id: string; summary: string; message_count: number; created_at: string }[]
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export default function DashboardPage() {
  const { health } = useGhostHealth()
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [ghostActivities, setGhostActivities] = useState<GhostActivity[]>([])
  const [expandedActivity, setExpandedActivity] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/dashboard')
      .then((res) => res.json())
      .then((json) => {
        if (!json.error) setData(json)
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    // Fetch Ghost telemetry
    fetch(`${GHOST_URL}/knowledge/telemetry?limit=15`, {
      headers: { 'x-ghost-api-key': GHOST_API_KEY },
    })
      .then(res => res.ok ? res.json() : [])
      .then(entries => setGhostActivities(Array.isArray(entries) ? entries : entries.entries || []))
      .catch(() => {})

    // Poll every 30s for real-time updates
    const interval = setInterval(() => {
      fetch(`${GHOST_URL}/knowledge/telemetry?limit=15`, {
        headers: { 'x-ghost-api-key': GHOST_API_KEY },
      })
        .then(res => res.ok ? res.json() : [])
        .then(entries => setGhostActivities(Array.isArray(entries) ? entries : entries.entries || []))
        .catch(() => {})
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1
          className="text-2xl font-bold tracking-tight glow-yellow"
          style={{ color: 'var(--brand-yellow)' }}
        >
          Mission Control
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Real-time operations overview for videoDJ.Studio
        </p>
      </motion.div>

      {/* Ghost heartbeat — full width */}
      <Heartbeat
        status={health?.status || 'amber'}
        uptime={health?.uptime || 0}
        connections={health?.activeConnections || 0}
      />

      {/* Ghost metric cards — clickable, linked to relevant pages */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <MetricCard
          title="Knowledge Base"
          value={health?.knowledgeBaseSize ?? 0}
          subtitle="Learned error patterns"
          icon={BookOpen}
          accent="var(--ghost-purple)"
          accentDim="var(--ghost-purple-dim)"
          glowClass="glass-card--ghost"
          delay={0.1}
          href="/ghost"
        />
        <MetricCard
          title="Fixes Applied"
          value={health?.recentFixes ?? 0}
          subtitle="Auto-healed issues"
          icon={Wrench}
          accent="var(--status-green)"
          accentDim="rgba(34, 197, 94, 0.15)"
          glowClass="glass-card--linus"
          delay={0.15}
          href="/ghost"
        />
        <MetricCard
          title="Active Sessions"
          value={health?.activeConnections ?? (data?.activeSessions ?? 0)}
          subtitle="Connected DJ apps"
          icon={MonitorCheck}
          accent="var(--system-blue)"
          accentDim="var(--system-blue-dim)"
          glowClass="glass-card--system"
          delay={0.2}
          href="/system"
        />
        <MetricCard
          title="Pending Analysis"
          value={health?.pendingAnalysis ?? 0}
          subtitle="Awaiting LLM diagnosis"
          icon={Clock}
          accent="var(--brand-yellow)"
          accentDim="var(--brand-yellow-dim)"
          glowClass="glass-card--yellow"
          delay={0.25}
          href="/ghost"
        />
      </div>

      {/* Secondary metrics row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <MetricCard
          title="Total Users"
          value={data?.totalUsers ?? 0}
          subtitle="Registered accounts"
          icon={Users}
          accent="var(--system-blue)"
          accentDim="var(--system-blue-dim)"
          glowClass="glass-card--system"
          delay={0.3}
          href="/users"
        />
        <MetricCard
          title="Total Tracks"
          value={data?.totalTracks ?? 0}
          subtitle="In the library"
          icon={Music}
          accent="var(--brand-yellow)"
          accentDim="var(--brand-yellow-dim)"
          glowClass="glass-card--yellow"
          delay={0.35}
          href="/tracks"
        />
        <MetricCard
          title="Linus Conversations"
          value={data?.totalConversations ?? 0}
          subtitle="AI agent chats"
          icon={Bot}
          accent="var(--ghost-purple)"
          accentDim="var(--ghost-purple-dim)"
          glowClass="glass-card--ghost"
          delay={0.4}
          href="/linus"
        />
        <MetricCard
          title="Active Sessions"
          value={data?.activeSessions ?? 0}
          subtitle="Logged-in users"
          icon={Activity}
          accent="var(--status-green)"
          accentDim="rgba(34, 197, 94, 0.15)"
          glowClass="glass-card--linus"
          delay={0.45}
          href="/system"
        />
      </div>

      {/* Activity + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Ghost Activity — real-time, clickable with details */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="glass-card p-6 lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Recent Ghost Activity
            </h3>
            <button
              onClick={() => router.push('/ghost')}
              className="text-[10px] font-medium px-2 py-1 rounded-md transition-colors"
              style={{ color: 'var(--ghost-purple)', background: 'var(--ghost-purple-dim)' }}
            >
              View All
            </button>
          </div>
          <div className="space-y-1.5 max-h-[340px] overflow-y-auto">
            {ghostActivities.length === 0 ? (
              <div className="flex items-center gap-3 py-8 justify-center" style={{ color: 'var(--text-tertiary)' }}>
                <Ghost size={20} style={{ color: 'var(--ghost-purple)', opacity: 0.5 }} />
                <span className="text-sm">No Ghost activity yet</span>
              </div>
            ) : (
              ghostActivities.map((activity, i) => {
                const isExpanded = expandedActivity === activity.id
                const severityColor = activity.severity === 'critical' ? 'var(--status-red)'
                  : activity.severity === 'high' ? '#f97316'
                  : activity.severity === 'medium' ? 'var(--status-amber)'
                  : 'var(--text-tertiary)'
                const resultIcon = activity.fix_result === 'success'
                  ? <CheckCircle size={12} style={{ color: 'var(--status-green)' }} />
                  : activity.fix_result === 'failed'
                  ? <XCircle size={12} style={{ color: 'var(--status-red)' }} />
                  : <Info size={12} style={{ color: 'var(--text-tertiary)' }} />

                return (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 + i * 0.03, duration: 0.3 }}
                  >
                    {/* Activity row — clickable */}
                    <button
                      onClick={() => setExpandedActivity(isExpanded ? null : activity.id)}
                      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors"
                      style={{
                        background: isExpanded ? 'var(--bg-tertiary)' : 'transparent',
                        border: isExpanded ? '1px solid var(--border-primary)' : '1px solid transparent',
                      }}
                      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: severityColor }} />
                      {resultIcon}
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] truncate block" style={{ color: 'var(--text-primary)' }}>
                          {activity.error_message || activity.type}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono shrink-0 ml-2" style={{ color: 'var(--text-tertiary)' }}>
                        {activity.component}
                      </span>
                      <span className="text-[9px] font-mono shrink-0 ml-2" style={{ color: 'var(--text-tertiary)' }}>
                        {timeAgo(activity.created_at)}
                      </span>
                      {isExpanded
                        ? <ChevronDown size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                        : <ChevronRight size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                      }
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mx-3 mb-2 px-3 py-3 rounded-lg"
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
                      >
                        <div className="grid grid-cols-2 gap-3 text-[10px]">
                          <div>
                            <span style={{ color: 'var(--text-tertiary)' }}>Type</span>
                            <p className="font-mono mt-0.5" style={{ color: 'var(--text-primary)' }}>{activity.type}</p>
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-tertiary)' }}>Severity</span>
                            <p className="font-mono mt-0.5" style={{ color: severityColor }}>{activity.severity}</p>
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-tertiary)' }}>Component</span>
                            <p className="font-mono mt-0.5" style={{ color: 'var(--text-primary)' }}>{activity.component}</p>
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-tertiary)' }}>Result</span>
                            <p className="font-mono mt-0.5" style={{
                              color: activity.fix_result === 'success' ? 'var(--status-green)' : activity.fix_result === 'failed' ? 'var(--status-red)' : 'var(--text-primary)'
                            }}>{activity.fix_result || 'pending'}</p>
                          </div>
                          {activity.error_message && (
                            <div className="col-span-2">
                              <span style={{ color: 'var(--text-tertiary)' }}>Error</span>
                              <p className="font-mono mt-0.5 break-all" style={{ color: 'var(--status-red)' }}>{activity.error_message}</p>
                            </div>
                          )}
                          {activity.fix_applied && (
                            <div className="col-span-2">
                              <span style={{ color: 'var(--text-tertiary)' }}>Fix Applied</span>
                              <p className="font-mono mt-0.5" style={{ color: 'var(--status-green)' }}>{activity.fix_applied}</p>
                            </div>
                          )}
                          <div className="col-span-2">
                            <span style={{ color: 'var(--text-tertiary)' }}>Timestamp</span>
                            <p className="font-mono mt-0.5" style={{ color: 'var(--text-primary)' }}>
                              {new Date(activity.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                )
              })
            )}
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          className="glass-card p-6"
        >
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>
            Quick Actions
          </h3>
          <div className="space-y-2">
            {[
              { label: 'Invite Beta Tester', icon: UserPlus, href: '/users', accent: 'var(--system-blue)', accentDim: 'var(--system-blue-dim)' },
              { label: 'Open Tickets', icon: Ticket, href: '/support', accent: 'var(--status-amber)', accentDim: 'rgba(245, 158, 11, 0.15)' },
              { label: 'New Idea', icon: Lightbulb, href: '/devzone', accent: 'var(--brand-yellow)', accentDim: 'var(--brand-yellow-dim)' },
              { label: 'Revenue Report', icon: DollarSign, href: '/finance', accent: 'var(--status-green)', accentDim: 'rgba(34, 197, 94, 0.15)' },
              { label: 'System Health', icon: Server, href: '/system', accent: 'var(--ghost-purple)', accentDim: 'var(--ghost-purple-dim)' },
            ].map((action, i) => (
              <motion.button
                key={action.href}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.05, duration: 0.3 }}
                whileHover={{ x: 4 }}
                onClick={() => router.push(action.href)}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-colors text-left"
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = action.accent }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)' }}
              >
                <div className="p-2 rounded-lg" style={{ background: action.accentDim }}>
                  <action.icon size={14} style={{ color: action.accent }} strokeWidth={1.5} />
                </div>
                <span className="text-sm font-medium flex-1" style={{ color: 'var(--text-primary)' }}>
                  {action.label}
                </span>
                <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
