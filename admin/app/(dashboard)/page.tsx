'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Ghost, Bot, Music, Users, Activity, MessageSquare, BookOpen, Wrench, MonitorCheck, Clock } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { Heartbeat } from '@/components/ghost/Heartbeat'
import { useGhostHealth } from '@/app/hooks/useGhostHealth'

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
  const { health, loading: ghostLoading } = useGhostHealth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard')
      .then((res) => res.json())
      .then((json) => {
        if (!json.error) setData(json)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
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

      {/* Activity panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent tracks */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="glass-card p-6 lg:col-span-2"
        >
          <h3
            className="text-sm font-semibold uppercase tracking-wider mb-4"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Recent Tracks
          </h3>
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-3 py-8 justify-center">
                <div
                  className="w-4 h-4 rounded-full animate-pulse"
                  style={{ background: 'var(--brand-yellow-dim)' }}
                />
                <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  Loading tracks...
                </span>
              </div>
            ) : data?.recentTracks && data.recentTracks.length > 0 ? (
              data.recentTracks.map((track, i) => (
                <motion.div
                  key={track.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.04, duration: 0.3 }}
                  className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-primary)',
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Music size={14} style={{ color: 'var(--brand-yellow)', flexShrink: 0 }} strokeWidth={1.5} />
                    <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {track.artist ? `${track.artist} — ${track.title}` : track.title}
                    </span>
                  </div>
                  <span
                    className="text-xs ml-3 whitespace-nowrap"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {timeAgo(track.created_at)}
                  </span>
                </motion.div>
              ))
            ) : (
              <div
                className="flex items-center gap-3 py-8 justify-center"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <Music size={20} style={{ color: 'var(--brand-yellow)', opacity: 0.5 }} />
                <span className="text-sm">No tracks yet.</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Recent conversations */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          className="glass-card p-6"
        >
          <h3
            className="text-sm font-semibold uppercase tracking-wider mb-4"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Linus Conversations
          </h3>
          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center gap-3 py-8 justify-center">
                <div
                  className="w-4 h-4 rounded-full animate-pulse"
                  style={{ background: 'var(--ghost-purple-dim)' }}
                />
                <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  Loading...
                </span>
              </div>
            ) : data?.recentConversations && data.recentConversations.length > 0 ? (
              data.recentConversations.map((conv, i) => (
                <motion.div
                  key={conv.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.05, duration: 0.3 }}
                  className="flex flex-col gap-1 px-4 py-3 rounded-xl"
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-primary)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare size={13} style={{ color: 'var(--ghost-purple)', flexShrink: 0 }} strokeWidth={1.5} />
                    <span
                      className="text-sm truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {conv.summary || 'Untitled conversation'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pl-5">
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {conv.message_count} message{conv.message_count !== 1 ? 's' : ''}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {timeAgo(conv.created_at)}
                    </span>
                  </div>
                </motion.div>
              ))
            ) : (
              <div
                className="flex items-center gap-3 py-8 justify-center"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <Bot size={20} style={{ color: 'var(--ghost-purple)', opacity: 0.5 }} />
                <span className="text-sm">No conversations yet.</span>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
