'use client'

import { motion } from 'framer-motion'
import { Ghost, Bot, Server, Users, Headset, Lightbulb, DollarSign, Activity } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { Heartbeat } from '@/components/ghost/Heartbeat'
import { useGhostHealth } from '@/app/hooks/useGhostHealth'

export default function DashboardPage() {
  const { health, loading } = useGhostHealth()

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

      {/* Metric cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <MetricCard
          title="Knowledge Base"
          value={health?.knowledgeBaseSize || 0}
          subtitle="Learned error patterns"
          icon={Ghost}
          accent="var(--ghost-purple)"
          accentDim="var(--ghost-purple-dim)"
          glowClass="glass-card--ghost"
          delay={0.1}
        />
        <MetricCard
          title="Fixes Applied"
          value={health?.recentFixes || 0}
          subtitle="Auto-healed issues"
          icon={Activity}
          accent="var(--status-green)"
          accentDim="rgba(34, 197, 94, 0.15)"
          glowClass="glass-card--linus"
          delay={0.15}
        />
        <MetricCard
          title="Active Sessions"
          value={health?.activeConnections || 0}
          subtitle="Connected DJ apps"
          icon={Users}
          accent="var(--system-blue)"
          accentDim="var(--system-blue-dim)"
          glowClass="glass-card--system"
          delay={0.2}
        />
        <MetricCard
          title="Pending Analysis"
          value={health?.pendingAnalysis || 0}
          subtitle="Awaiting LLM diagnosis"
          icon={Bot}
          accent="var(--brand-yellow)"
          accentDim="var(--brand-yellow-dim)"
          glowClass="glass-card--yellow"
          delay={0.25}
        />
      </div>

      {/* Quick access panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent activity */}
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
            Recent Ghost Activity
          </h3>
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-3 py-8 justify-center">
                <div
                  className="w-4 h-4 rounded-full animate-pulse"
                  style={{ background: 'var(--ghost-purple-dim)' }}
                />
                <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  Loading telemetry...
                </span>
              </div>
            ) : (
              <div
                className="flex items-center gap-3 py-8 justify-center"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <Ghost size={20} style={{ color: 'var(--ghost-purple)', opacity: 0.5 }} />
                <span className="text-sm">Ghost is monitoring. Activity will appear here.</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Quick links */}
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
            Quick Actions
          </h3>
          <div className="space-y-2">
            {[
              { icon: Users, label: 'Invite Beta Tester', accent: 'var(--brand-yellow)' },
              { icon: Headset, label: 'Open Tickets', accent: 'var(--brand-yellow)' },
              { icon: Lightbulb, label: 'New Idea', accent: 'var(--brand-yellow)' },
              { icon: DollarSign, label: 'Revenue Report', accent: 'var(--brand-yellow)' },
              { icon: Server, label: 'System Health', accent: 'var(--system-blue)' },
            ].map((item, i) => (
              <motion.button
                key={item.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.05, duration: 0.3 }}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm transition-all"
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-secondary)'
                  e.currentTarget.style.background = 'var(--bg-elevated)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-primary)'
                  e.currentTarget.style.background = 'var(--bg-tertiary)'
                }}
              >
                <item.icon size={16} style={{ color: item.accent }} strokeWidth={1.5} />
                <span>{item.label}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
