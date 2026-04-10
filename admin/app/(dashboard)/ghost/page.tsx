'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Ghost, Shield, Brain, Bell, TrendingUp, Search, Filter } from 'lucide-react'
import { Heartbeat } from '@/components/ghost/Heartbeat'
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter'
import { useGhostHealth } from '@/app/hooks/useGhostHealth'

const GHOST_URL = process.env.NEXT_PUBLIC_GHOST_URL || 'https://ghost.videodj.studio'
const GHOST_API_KEY = process.env.NEXT_PUBLIC_GHOST_API_KEY || ''

interface TelemetryEntry {
  id: number
  type: string
  severity: string
  component: string
  error_message: string
  fix_applied: string
  fix_result: string
  created_at: string
}

interface KnowledgeEntry {
  id: number
  error_pattern: string
  fix_action: string
  fix_command_type: string
  success_rate: number
  times_seen: number
  auto_promoted: boolean
  llm_analysis: string
}

const severityColors: Record<string, string> = {
  low: 'var(--text-tertiary)',
  medium: 'var(--status-amber)',
  high: '#f97316',
  critical: 'var(--status-red)',
}

export default function GhostPage() {
  const { health } = useGhostHealth(5000)
  const [telemetry, setTelemetry] = useState<TelemetryEntry[]>([])
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([])
  const [activeTab, setActiveTab] = useState<'errors' | 'knowledge' | 'notifications'>('errors')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function fetchData() {
      try {
        const [telRes, kbRes] = await Promise.all([
          fetch(`${GHOST_URL}/knowledge/telemetry?limit=50`, {
            headers: { 'x-ghost-api-key': GHOST_API_KEY },
          }),
          fetch(`${GHOST_URL}/knowledge?limit=50`, {
            headers: { 'x-ghost-api-key': GHOST_API_KEY },
          }),
        ])
        if (telRes.ok) {
          const data = await telRes.json()
          setTelemetry(data.entries || [])
        }
        if (kbRes.ok) {
          const data = await kbRes.json()
          setKnowledge(data.entries || [])
        }
      } catch {
        // Ghost Server unreachable — silent
      }
    }
    fetchData()
    const timer = setInterval(fetchData, 15000)
    return () => clearInterval(timer)
  }, [])

  const filteredTelemetry = telemetry.filter(t =>
    !searchQuery || t.error_message?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const tabs = [
    { id: 'errors' as const, label: 'Error Log', icon: Shield, count: telemetry.length },
    { id: 'knowledge' as const, label: 'Knowledge Base', icon: Brain, count: knowledge.length },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell, count: 0 },
  ]

  return (
    <div className="space-y-8">
      {/* Heartbeat */}
      <Heartbeat
        status={health?.status || 'amber'}
        uptime={health?.uptime || 0}
        connections={health?.activeConnections || 0}
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Patterns Learned', value: health?.knowledgeBaseSize || 0, accent: 'var(--ghost-purple)' },
          { label: 'Total Fixes', value: health?.recentFixes || 0, accent: 'var(--status-green)' },
          { label: 'Pending', value: health?.pendingAnalysis || 0, accent: 'var(--status-amber)' },
          { label: 'Success Rate', value: 95, suffix: '%', accent: 'var(--ghost-purple)' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            className="glass-card glass-card--ghost p-4"
          >
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>
              {stat.label}
            </p>
            <p className="text-2xl font-bold" style={{ color: stat.accent }}>
              <AnimatedCounter value={stat.value} suffix={stat.suffix} />
            </p>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-1 px-4 pt-4" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative"
              style={{
                color: activeTab === tab.id ? 'var(--ghost-purple)' : 'var(--text-tertiary)',
              }}
            >
              <tab.icon size={14} />
              {tab.label}
              {tab.count > 0 && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-mono"
                  style={{
                    background: activeTab === tab.id ? 'var(--ghost-purple-dim)' : 'var(--bg-elevated)',
                    color: activeTab === tab.id ? 'var(--ghost-purple)' : 'var(--text-tertiary)',
                  }}
                >
                  {tab.count}
                </span>
              )}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="ghost-tab"
                  className="absolute bottom-0 left-0 right-0 h-[2px]"
                  style={{ background: 'var(--ghost-purple)' }}
                />
              )}
            </button>
          ))}

          {/* Search */}
          <div className="ml-auto flex items-center gap-2 pb-3">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              <Search size={12} style={{ color: 'var(--text-tertiary)' }} />
              <input
                type="text"
                placeholder="Filter..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent outline-none text-xs w-32"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
          </div>
        </div>

        {/* Tab content */}
        <div className="p-4">
          {activeTab === 'errors' && (
            <div className="space-y-1">
              {filteredTelemetry.length === 0 ? (
                <div className="flex items-center justify-center py-12 gap-3" style={{ color: 'var(--text-tertiary)' }}>
                  <Ghost size={20} style={{ opacity: 0.4 }} />
                  <span className="text-sm">No errors captured yet. Ghost is watching.</span>
                </div>
              ) : (
                filteredTelemetry.map((entry, i) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-center gap-4 px-4 py-3 rounded-lg transition-colors"
                    style={{ background: 'transparent' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: severityColors[entry.severity] || 'var(--text-tertiary)' }}
                    />
                    <span className="text-xs font-mono flex-shrink-0 w-16" style={{ color: severityColors[entry.severity] }}>
                      {entry.severity}
                    </span>
                    <span className="text-xs font-mono flex-shrink-0 w-20" style={{ color: 'var(--system-blue)' }}>
                      {entry.component}
                    </span>
                    <span className="text-sm truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                      {entry.error_message || 'Unknown error'}
                    </span>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded font-mono flex-shrink-0"
                      style={{
                        background: entry.fix_result === 'success' ? 'rgba(34, 197, 94, 0.15)' : entry.fix_result === 'failed' ? 'var(--deck-red-dim)' : 'var(--bg-elevated)',
                        color: entry.fix_result === 'success' ? 'var(--status-green)' : entry.fix_result === 'failed' ? 'var(--status-red)' : 'var(--text-tertiary)',
                      }}
                    >
                      {entry.fix_applied || 'pending'}
                    </span>
                    <span className="text-[10px] font-mono flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(entry.created_at).toLocaleTimeString()}
                    </span>
                  </motion.div>
                ))
              )}
            </div>
          )}

          {activeTab === 'knowledge' && (
            <div className="space-y-1">
              {knowledge.length === 0 ? (
                <div className="flex items-center justify-center py-12 gap-3" style={{ color: 'var(--text-tertiary)' }}>
                  <Brain size={20} style={{ opacity: 0.4 }} />
                  <span className="text-sm">Knowledge base is empty. Ghost will learn from errors.</span>
                </div>
              ) : (
                knowledge.map((entry, i) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-center gap-4 px-4 py-3 rounded-lg transition-colors cursor-pointer"
                    style={{ background: 'transparent' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <TrendingUp
                      size={14}
                      style={{ color: entry.success_rate > 0.8 ? 'var(--status-green)' : 'var(--status-amber)' }}
                    />
                    <span className="text-sm truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                      {entry.error_pattern.slice(0, 80)}
                    </span>
                    <span className="text-xs truncate max-w-48" style={{ color: 'var(--text-tertiary)' }}>
                      {entry.fix_action}
                    </span>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded font-mono"
                      style={{
                        background: entry.success_rate > 0.8 ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-elevated)',
                        color: entry.success_rate > 0.8 ? 'var(--status-green)' : 'var(--text-tertiary)',
                      }}
                    >
                      {(entry.success_rate * 100).toFixed(0)}%
                    </span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                      {entry.times_seen}x
                    </span>
                    {entry.auto_promoted && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold tracking-wider"
                        style={{ background: 'var(--ghost-purple-dim)', color: 'var(--ghost-purple)' }}
                      >
                        Promoted
                      </span>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="flex items-center justify-center py-12 gap-3" style={{ color: 'var(--text-tertiary)' }}>
              <Bell size={20} style={{ opacity: 0.4 }} />
              <span className="text-sm">No notifications yet.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
