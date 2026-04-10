'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Ghost, Shield, Brain, Bell, TrendingUp, Search, ChevronDown, ChevronRight, CheckCircle, XCircle, Info, AlertTriangle, BookOpen, Wrench, Clock, Percent } from 'lucide-react'
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

interface NotificationEntry {
  id: number
  type: string
  channel: string
  recipient: string
  subject: string
  status: string
  created_at: string
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
  const [notifications, setNotifications] = useState<NotificationEntry[]>([])
  const [activeTab, setActiveTab] = useState<'errors' | 'knowledge' | 'notifications'>('errors')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedError, setExpandedError] = useState<number | null>(null)
  const [expandedKb, setExpandedKb] = useState<number | null>(null)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)

  // Fetch all Ghost data
  useEffect(() => {
    async function fetchData() {
      try {
        const headers = { 'x-ghost-api-key': GHOST_API_KEY }
        const [telRes, kbRes, notifRes] = await Promise.all([
          fetch(`${GHOST_URL}/knowledge/telemetry?limit=100`, { headers }).catch(() => null),
          fetch(`${GHOST_URL}/knowledge?limit=100`, { headers }).catch(() => null),
          fetch(`${GHOST_URL}/notifications?limit=50`, { headers }).catch(() => null),
        ])
        if (telRes?.ok) {
          const data = await telRes.json()
          setTelemetry(Array.isArray(data) ? data : data.entries || [])
        }
        if (kbRes?.ok) {
          const data = await kbRes.json()
          setKnowledge(Array.isArray(data) ? data : data.entries || [])
        }
        if (notifRes?.ok) {
          const data = await notifRes.json()
          setNotifications(Array.isArray(data) ? data : data.entries || [])
        }
      } catch { /* Ghost unreachable */ }
    }
    fetchData()
    const timer = setInterval(fetchData, 10000) // Real-time: every 10s
    return () => clearInterval(timer)
  }, [])

  // Compute success rate from telemetry
  const successRate = useMemo(() => {
    if (telemetry.length === 0) return { rate: 100, total: 0, succeeded: 0, failed: 0, failedEntries: [] as TelemetryEntry[] }
    const withResult = telemetry.filter(t => t.fix_result === 'success' || t.fix_result === 'failed')
    const succeeded = withResult.filter(t => t.fix_result === 'success').length
    const failed = withResult.filter(t => t.fix_result === 'failed')
    const rate = withResult.length > 0 ? Math.round((succeeded / withResult.length) * 100) : 100
    return { rate, total: withResult.length, succeeded, failed: failed.length, failedEntries: failed }
  }, [telemetry])

  const filteredTelemetry = telemetry.filter(t =>
    !searchQuery || t.error_message?.toLowerCase().includes(searchQuery.toLowerCase()) || t.component?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredKnowledge = knowledge.filter(k =>
    !searchQuery || k.error_pattern?.toLowerCase().includes(searchQuery.toLowerCase()) || k.fix_action?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const tabs = [
    { id: 'errors' as const, label: 'Error Log', icon: Shield, count: telemetry.length },
    { id: 'knowledge' as const, label: 'Knowledge Base', icon: Brain, count: knowledge.length },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell, count: notifications.length },
  ]

  return (
    <div className="space-y-6">
      {/* Heartbeat — same animated heart as dashboard */}
      <Heartbeat
        status={health?.status || 'amber'}
        uptime={health?.uptime || 0}
        connections={health?.activeConnections || 0}
      />

      {/* Stats cards — clickable with expandable detail */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Patterns Learned */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className="glass-card glass-card--ghost p-4 cursor-pointer"
          onClick={() => { setExpandedCard(expandedCard === 'patterns' ? null : 'patterns'); setActiveTab('knowledge') }}
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Patterns Learned</p>
            <BookOpen size={14} style={{ color: 'var(--ghost-purple)' }} />
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--ghost-purple)' }}>
            <AnimatedCounter value={health?.knowledgeBaseSize || knowledge.length || 0} />
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {knowledge.filter(k => k.auto_promoted).length} auto-promoted
          </p>
        </motion.div>

        {/* Total Fixes */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className="glass-card glass-card--ghost p-4 cursor-pointer"
          onClick={() => { setExpandedCard(expandedCard === 'fixes' ? null : 'fixes'); setActiveTab('errors') }}
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Total Fixes</p>
            <Wrench size={14} style={{ color: 'var(--status-green)' }} />
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--status-green)' }}>
            <AnimatedCounter value={health?.recentFixes || successRate.succeeded} />
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {successRate.total} total attempts
          </p>
        </motion.div>

        {/* Pending */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className="glass-card glass-card--ghost p-4 cursor-pointer"
          onClick={() => { setExpandedCard(expandedCard === 'pending' ? null : 'pending'); setActiveTab('errors') }}
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Pending</p>
            <Clock size={14} style={{ color: 'var(--status-amber)' }} />
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--status-amber)' }}>
            <AnimatedCounter value={health?.pendingAnalysis || telemetry.filter(t => !t.fix_result).length} />
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Awaiting LLM diagnosis
          </p>
        </motion.div>

        {/* Success Rate — with failure details */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className="glass-card glass-card--ghost p-4 cursor-pointer"
          onClick={() => setExpandedCard(expandedCard === 'success' ? null : 'success')}
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Success Rate</p>
            <Percent size={14} style={{ color: successRate.rate >= 90 ? 'var(--ghost-purple)' : 'var(--status-amber)' }} />
          </div>
          <p className="text-2xl font-bold" style={{ color: successRate.rate >= 90 ? 'var(--ghost-purple)' : 'var(--status-amber)' }}>
            <AnimatedCounter value={successRate.rate} suffix="%" />
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {successRate.failed > 0 ? `${successRate.failed} failed fix${successRate.failed > 1 ? 'es' : ''}` : 'All fixes successful'}
          </p>
        </motion.div>
      </div>

      {/* Expanded card detail */}
      <AnimatePresence>
        {expandedCard === 'success' && successRate.failedEntries.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="glass-card p-4 overflow-hidden"
          >
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--status-red)' }}>
              Why not 100%? — Failed Fixes ({successRate.failed})
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {successRate.failedEntries.map(entry => (
                <div key={entry.id} className="flex items-start gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                  <XCircle size={14} style={{ color: 'var(--status-red)', flexShrink: 0, marginTop: 2 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>{entry.error_message}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[9px] font-mono" style={{ color: 'var(--system-blue)' }}>{entry.component}</span>
                      <span className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>Fix: {entry.fix_applied || 'none'}</span>
                      <span className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{new Date(entry.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
        {expandedCard === 'patterns' && knowledge.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="glass-card p-4 overflow-hidden"
          >
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--ghost-purple)' }}>
              Learned Patterns ({knowledge.length})
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {knowledge.slice(0, 10).map(k => (
                <div key={k.id} className="flex items-start gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                  <Brain size={14} style={{ color: 'var(--ghost-purple)', flexShrink: 0, marginTop: 2 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{k.error_pattern.slice(0, 100)}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--status-green)' }}>Fix: {k.fix_action}</p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{(k.success_rate * 100).toFixed(0)}% success</span>
                      <span className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{k.times_seen}x seen</span>
                      {k.auto_promoted && <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: 'var(--ghost-purple-dim)', color: 'var(--ghost-purple)' }}>PROMOTED</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs — Error Log, Knowledge Base, Notifications */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-1 px-4 pt-4" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative"
              style={{ color: activeTab === tab.id ? 'var(--ghost-purple)' : 'var(--text-tertiary)' }}
            >
              <tab.icon size={14} />
              {tab.label}
              {tab.count > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono"
                  style={{
                    background: activeTab === tab.id ? 'var(--ghost-purple-dim)' : 'var(--bg-elevated)',
                    color: activeTab === tab.id ? 'var(--ghost-purple)' : 'var(--text-tertiary)',
                  }}>
                  {tab.count}
                </span>
              )}
              {activeTab === tab.id && (
                <motion.div layoutId="ghost-tab" className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: 'var(--ghost-purple)' }} />
              )}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2 pb-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
              <Search size={12} style={{ color: 'var(--text-tertiary)' }} />
              <input type="text" placeholder="Filter..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent outline-none text-xs w-32" style={{ color: 'var(--text-primary)' }} />
            </div>
          </div>
        </div>

        {/* Error Log tab — clickable entries with expandable detail */}
        <div className="p-4">
          {activeTab === 'errors' && (
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {filteredTelemetry.length === 0 ? (
                <div className="flex items-center justify-center py-12 gap-3" style={{ color: 'var(--text-tertiary)' }}>
                  <Ghost size={20} style={{ opacity: 0.4 }} />
                  <span className="text-sm">No errors captured yet. Ghost is watching.</span>
                </div>
              ) : (
                filteredTelemetry.map((entry, i) => {
                  const isExpanded = expandedError === entry.id
                  const resultIcon = entry.fix_result === 'success'
                    ? <CheckCircle size={12} style={{ color: 'var(--status-green)', flexShrink: 0 }} />
                    : entry.fix_result === 'failed'
                    ? <XCircle size={12} style={{ color: 'var(--status-red)', flexShrink: 0 }} />
                    : <AlertTriangle size={12} style={{ color: 'var(--status-amber)', flexShrink: 0 }} />

                  return (
                    <div key={entry.id}>
                      <motion.button
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.015 }}
                        onClick={() => setExpandedError(isExpanded ? null : entry.id)}
                        className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-colors text-left"
                        style={{ background: isExpanded ? 'var(--bg-tertiary)' : 'transparent', border: isExpanded ? '1px solid var(--border-primary)' : '1px solid transparent' }}
                        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                        onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}
                      >
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: severityColors[entry.severity] || 'var(--text-tertiary)' }} />
                        {resultIcon}
                        <span className="text-xs font-mono flex-shrink-0 w-16" style={{ color: severityColors[entry.severity] }}>{entry.severity}</span>
                        <span className="text-xs font-mono flex-shrink-0 w-20" style={{ color: 'var(--system-blue)' }}>{entry.component}</span>
                        <span className="text-[11px] truncate flex-1" style={{ color: 'var(--text-primary)' }}>{entry.error_message || 'Unknown error'}</span>
                        <span className="text-[10px] font-mono flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>{new Date(entry.created_at).toLocaleTimeString()}</span>
                        {isExpanded ? <ChevronDown size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} /> : <ChevronRight size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                      </motion.button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="mx-4 mb-2 px-4 py-3 rounded-lg"
                            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
                          >
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[10px]">
                              <div>
                                <span style={{ color: 'var(--text-tertiary)' }}>Type</span>
                                <p className="font-mono mt-0.5" style={{ color: 'var(--text-primary)' }}>{entry.type}</p>
                              </div>
                              <div>
                                <span style={{ color: 'var(--text-tertiary)' }}>Severity</span>
                                <p className="font-mono mt-0.5" style={{ color: severityColors[entry.severity] }}>{entry.severity}</p>
                              </div>
                              <div>
                                <span style={{ color: 'var(--text-tertiary)' }}>Component</span>
                                <p className="font-mono mt-0.5" style={{ color: 'var(--system-blue)' }}>{entry.component}</p>
                              </div>
                              <div>
                                <span style={{ color: 'var(--text-tertiary)' }}>Fix Result</span>
                                <p className="font-mono mt-0.5" style={{ color: entry.fix_result === 'success' ? 'var(--status-green)' : entry.fix_result === 'failed' ? 'var(--status-red)' : 'var(--status-amber)' }}>
                                  {entry.fix_result || 'pending'}
                                </p>
                              </div>
                              <div>
                                <span style={{ color: 'var(--text-tertiary)' }}>Fix Applied</span>
                                <p className="font-mono mt-0.5" style={{ color: 'var(--status-green)' }}>{entry.fix_applied || 'none yet'}</p>
                              </div>
                              <div>
                                <span style={{ color: 'var(--text-tertiary)' }}>Timestamp</span>
                                <p className="font-mono mt-0.5" style={{ color: 'var(--text-primary)' }}>{new Date(entry.created_at).toLocaleString()}</p>
                              </div>
                              {entry.error_message && (
                                <div className="col-span-2 md:col-span-3">
                                  <span style={{ color: 'var(--text-tertiary)' }}>Full Error</span>
                                  <p className="font-mono mt-0.5 break-all text-[11px]" style={{ color: 'var(--status-red)' }}>{entry.error_message}</p>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* Knowledge Base tab — clickable with LLM analysis */}
          {activeTab === 'knowledge' && (
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {filteredKnowledge.length === 0 ? (
                <div className="flex items-center justify-center py-12 gap-3" style={{ color: 'var(--text-tertiary)' }}>
                  <Brain size={20} style={{ opacity: 0.4 }} />
                  <span className="text-sm">Knowledge base is empty. Ghost will learn from errors.</span>
                </div>
              ) : (
                filteredKnowledge.map((entry, i) => {
                  const isExpanded = expandedKb === entry.id
                  return (
                    <div key={entry.id}>
                      <motion.button
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.015 }}
                        onClick={() => setExpandedKb(isExpanded ? null : entry.id)}
                        className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-colors text-left"
                        style={{ background: isExpanded ? 'var(--bg-tertiary)' : 'transparent', border: isExpanded ? '1px solid var(--border-primary)' : '1px solid transparent' }}
                        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                        onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}
                      >
                        <TrendingUp size={14} style={{ color: entry.success_rate > 0.8 ? 'var(--status-green)' : 'var(--status-amber)', flexShrink: 0 }} />
                        <span className="text-[11px] truncate flex-1" style={{ color: 'var(--text-primary)' }}>{entry.error_pattern.slice(0, 80)}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono flex-shrink-0"
                          style={{
                            background: entry.success_rate > 0.8 ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-elevated)',
                            color: entry.success_rate > 0.8 ? 'var(--status-green)' : 'var(--text-tertiary)',
                          }}>
                          {(entry.success_rate * 100).toFixed(0)}%
                        </span>
                        <span className="text-[10px] font-mono flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>{entry.times_seen}x</span>
                        {entry.auto_promoted && (
                          <span className="text-[8px] px-1.5 py-0.5 rounded uppercase font-semibold tracking-wider flex-shrink-0"
                            style={{ background: 'var(--ghost-purple-dim)', color: 'var(--ghost-purple)' }}>
                            Promoted
                          </span>
                        )}
                        {isExpanded ? <ChevronDown size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} /> : <ChevronRight size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                      </motion.button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="mx-4 mb-2 px-4 py-3 rounded-lg"
                            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
                          >
                            <div className="grid grid-cols-2 gap-3 text-[10px]">
                              <div className="col-span-2">
                                <span style={{ color: 'var(--text-tertiary)' }}>Error Pattern</span>
                                <p className="font-mono mt-0.5 break-all text-[11px]" style={{ color: 'var(--text-primary)' }}>{entry.error_pattern}</p>
                              </div>
                              <div className="col-span-2">
                                <span style={{ color: 'var(--text-tertiary)' }}>Fix Action</span>
                                <p className="font-mono mt-0.5" style={{ color: 'var(--status-green)' }}>{entry.fix_action}</p>
                              </div>
                              <div>
                                <span style={{ color: 'var(--text-tertiary)' }}>Command Type</span>
                                <p className="font-mono mt-0.5" style={{ color: 'var(--system-blue)' }}>{entry.fix_command_type}</p>
                              </div>
                              <div>
                                <span style={{ color: 'var(--text-tertiary)' }}>Success Rate</span>
                                <p className="font-mono mt-0.5" style={{ color: entry.success_rate > 0.8 ? 'var(--status-green)' : 'var(--status-amber)' }}>
                                  {(entry.success_rate * 100).toFixed(1)}% ({entry.times_seen} attempts)
                                </p>
                              </div>
                              {entry.llm_analysis && (
                                <div className="col-span-2">
                                  <span style={{ color: 'var(--text-tertiary)' }}>LLM Analysis</span>
                                  <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{entry.llm_analysis}</p>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* Notifications tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex items-center justify-center py-12 gap-3" style={{ color: 'var(--text-tertiary)' }}>
                  <Bell size={20} style={{ opacity: 0.4 }} />
                  <span className="text-sm">No notifications yet. Ghost sends alerts via email and Telegram.</span>
                </div>
              ) : (
                notifications.map((notif, i) => (
                  <motion.div
                    key={notif.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors"
                    style={{ background: 'transparent' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <Bell size={14} style={{ color: 'var(--ghost-purple)', flexShrink: 0 }} />
                    <span className="text-xs font-mono flex-shrink-0 w-16" style={{ color: 'var(--system-blue)' }}>{notif.channel}</span>
                    <span className="text-[11px] truncate flex-1" style={{ color: 'var(--text-primary)' }}>{notif.subject || notif.type}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono flex-shrink-0"
                      style={{
                        background: notif.status === 'sent' ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-elevated)',
                        color: notif.status === 'sent' ? 'var(--status-green)' : 'var(--text-tertiary)',
                      }}>
                      {notif.status}
                    </span>
                    <span className="text-[10px] font-mono flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>{new Date(notif.created_at).toLocaleString()}</span>
                  </motion.div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
