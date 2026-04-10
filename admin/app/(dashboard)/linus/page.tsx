'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, MessageSquare, Zap, Terminal, TrendingUp, RefreshCw, ChevronDown, ChevronRight, Users, Calendar, X } from 'lucide-react'
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter'

interface Conversation {
  id: string
  user_id: string
  user_name: string | null
  email: string
  summary: string
  topics: string[]
  actions: string[]
  message_count: number
  created_at: string
}

interface ModelConfig {
  provider: string
  model: string
  mode: string
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic (Claude API)',
  openai: 'OpenAI',
  xai: 'xAI (Grok)',
  deepseek: 'DeepSeek',
  ollama: 'Ollama (Local)',
  mock: 'Mock (Demo Mode)',
}

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'custom'

export default function LinusPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [expandedConv, setExpandedConv] = useState<string | null>(null)
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [customDate, setCustomDate] = useState('')

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/linus/conversations?limit=200')
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
        if (data.modelConfig) setModelConfig(data.modelConfig)
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConversations()
    const interval = setInterval(fetchConversations, 30000)
    return () => clearInterval(interval)
  }, [fetchConversations])

  // Date-filtered conversations
  const filteredConversations = useMemo(() => {
    const now = new Date()
    return conversations.filter(c => {
      const created = new Date(c.created_at)
      switch (dateFilter) {
        case 'today': {
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          return created >= start
        }
        case 'week': {
          const start = new Date(now)
          start.setDate(start.getDate() - 7)
          return created >= start
        }
        case 'month': {
          const start = new Date(now)
          start.setMonth(start.getMonth() - 1)
          return created >= start
        }
        case 'custom': {
          if (!customDate) return true
          const target = new Date(customDate)
          return created.toDateString() === target.toDateString()
        }
        default:
          return true
      }
    })
  }, [conversations, dateFilter, customDate])

  const totalMessages = conversations.reduce((sum, c) => sum + c.message_count, 0)
  const filteredMessages = filteredConversations.reduce((sum, c) => sum + c.message_count, 0)
  const uniqueUsers = new Set(conversations.map(c => c.user_id))
  const avgMessages = conversations.length > 0 ? Math.round(totalMessages / conversations.length) : 0

  // Group conversations by user for Active Users detail
  const userStats = useMemo(() => {
    const map = new Map<string, { name: string; email: string; convCount: number; msgCount: number; lastActive: string }>()
    for (const c of conversations) {
      const existing = map.get(c.user_id)
      if (existing) {
        existing.convCount++
        existing.msgCount += c.message_count
        if (c.created_at > existing.lastActive) existing.lastActive = c.created_at
      } else {
        map.set(c.user_id, { name: c.user_name || c.email, email: c.email, convCount: 1, msgCount: c.message_count, lastActive: c.created_at })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.msgCount - a.msgCount)
  }, [conversations])

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold glow-green" style={{ color: 'var(--linus-green)' }}>Linus AI Agent</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Conversation history, API usage, and model configuration
        </p>
      </motion.div>

      {/* Stats cards — all clickable */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Conversations */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className="glass-card glass-card--linus p-4 cursor-pointer"
          onClick={() => setExpandedCard(expandedCard === 'conversations' ? null : 'conversations')}>
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare size={14} style={{ color: 'var(--linus-green)' }} />
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-tertiary)' }}>Total Conversations</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--linus-green)' }}>
            <AnimatedCounter value={conversations.length} />
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>Click to view full history</p>
        </motion.div>

        {/* Total Messages */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className="glass-card glass-card--linus p-4 cursor-pointer"
          onClick={() => setExpandedCard(expandedCard === 'messages' ? null : 'messages')}>
          <div className="flex items-center gap-2 mb-2">
            <Terminal size={14} style={{ color: 'var(--linus-green)' }} />
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-tertiary)' }}>Total Messages</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--linus-green)' }}>
            <AnimatedCounter value={totalMessages} />
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>Click to filter by date</p>
        </motion.div>

        {/* Avg Messages/Conv */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className="glass-card glass-card--linus p-4 cursor-pointer"
          onClick={() => setExpandedCard(expandedCard === 'avg' ? null : 'avg')}>
          <div className="flex items-center gap-2 mb-2">
            <Zap size={14} style={{ color: 'var(--status-amber)' }} />
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-tertiary)' }}>Avg Messages/Conv</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--status-amber)' }}>
            <AnimatedCounter value={avgMessages} />
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {conversations.length > 0 ? `${totalMessages} msgs / ${conversations.length} convs` : 'No data'}
          </p>
        </motion.div>

        {/* Active Users */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className="glass-card glass-card--linus p-4 cursor-pointer"
          onClick={() => setExpandedCard(expandedCard === 'users' ? null : 'users')}>
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} style={{ color: 'var(--status-green)' }} />
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-tertiary)' }}>Active Users</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--status-green)' }}>
            <AnimatedCounter value={uniqueUsers.size} />
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>Click to see user breakdown</p>
        </motion.div>
      </div>

      {/* Expanded card panels */}
      <AnimatePresence>
        {/* Total Conversations — full history */}
        {expandedCard === 'conversations' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="glass-card p-5 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--linus-green)' }}>
                All Conversations ({conversations.length})
              </h4>
              <button onClick={() => setExpandedCard(null)} style={{ color: 'var(--text-tertiary)' }}><X size={14} /></button>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {conversations.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-tertiary)' }}>No conversations yet</p>
              ) : conversations.map(conv => (
                <div key={conv.id}>
                  <button onClick={() => setExpandedConv(expandedConv === conv.id ? null : conv.id)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors"
                    style={{ background: expandedConv === conv.id ? 'var(--bg-tertiary)' : 'transparent', border: expandedConv === conv.id ? '1px solid var(--border-primary)' : '1px solid transparent' }}
                    onMouseEnter={e => { if (expandedConv !== conv.id) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                    onMouseLeave={e => { if (expandedConv !== conv.id) e.currentTarget.style.background = 'transparent' }}>
                    <Bot size={12} style={{ color: 'var(--linus-green)', flexShrink: 0 }} />
                    <span className="text-[10px] font-mono w-24 flex-shrink-0" style={{ color: 'var(--linus-green)' }}>{conv.user_name || conv.email}</span>
                    <span className="text-[11px] truncate flex-1" style={{ color: 'var(--text-primary)' }}>{conv.summary || 'Untitled'}</span>
                    <span className="text-[9px] font-mono flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>{conv.message_count} msgs</span>
                    <span className="text-[9px] font-mono flex-shrink-0 ml-2" style={{ color: 'var(--text-tertiary)' }}>{timeAgo(conv.created_at)}</span>
                    {expandedConv === conv.id ? <ChevronDown size={12} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight size={12} style={{ color: 'var(--text-tertiary)' }} />}
                  </button>
                  {expandedConv === conv.id && (
                    <div className="mx-3 mb-2 px-3 py-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}>
                      <div className="grid grid-cols-2 gap-3 text-[10px]">
                        <div><span style={{ color: 'var(--text-tertiary)' }}>User</span><p className="font-mono mt-0.5" style={{ color: 'var(--text-primary)' }}>{conv.user_name || 'Unknown'}</p></div>
                        <div><span style={{ color: 'var(--text-tertiary)' }}>Email</span><p className="font-mono mt-0.5" style={{ color: 'var(--text-primary)' }}>{conv.email}</p></div>
                        <div><span style={{ color: 'var(--text-tertiary)' }}>Messages</span><p className="font-mono mt-0.5" style={{ color: 'var(--linus-green)' }}>{conv.message_count}</p></div>
                        <div><span style={{ color: 'var(--text-tertiary)' }}>Date</span><p className="font-mono mt-0.5" style={{ color: 'var(--text-primary)' }}>{new Date(conv.created_at).toLocaleString()}</p></div>
                        <div className="col-span-2"><span style={{ color: 'var(--text-tertiary)' }}>Summary</span><p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>{conv.summary}</p></div>
                        {conv.topics.length > 0 && (
                          <div className="col-span-2"><span style={{ color: 'var(--text-tertiary)' }}>Topics</span>
                            <div className="flex gap-1 mt-1 flex-wrap">{conv.topics.map(t => (
                              <span key={t} className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--linus-green)', border: '1px solid rgba(34,197,94,0.2)' }}>{t}</span>
                            ))}</div>
                          </div>
                        )}
                        {conv.actions.length > 0 && (
                          <div className="col-span-2"><span style={{ color: 'var(--text-tertiary)' }}>Actions</span>
                            <div className="flex gap-1 mt-1 flex-wrap">{conv.actions.map(a => (
                              <span key={a} className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)' }}>{a}</span>
                            ))}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Total Messages — with date filter */}
        {expandedCard === 'messages' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="glass-card p-5 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--linus-green)' }}>
                Messages by Period
              </h4>
              <button onClick={() => setExpandedCard(null)} style={{ color: 'var(--text-tertiary)' }}><X size={14} /></button>
            </div>

            {/* Date filter buttons */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {([['all', 'All Time'], ['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['custom', 'Pick Date']] as [DateFilter, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setDateFilter(key)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                  style={{
                    background: dateFilter === key ? 'var(--linus-green)' : 'var(--bg-tertiary)',
                    color: dateFilter === key ? '#000' : 'var(--text-tertiary)',
                    border: `1px solid ${dateFilter === key ? 'var(--linus-green)' : 'var(--border-primary)'}`,
                  }}>
                  {label}
                </button>
              ))}
              {dateFilter === 'custom' && (
                <div className="flex items-center gap-2">
                  <Calendar size={12} style={{ color: 'var(--text-tertiary)' }} />
                  <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
                    className="px-2 py-1 rounded-lg text-[11px] font-mono"
                    style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)', colorScheme: 'dark' }} />
                </div>
              )}
            </div>

            {/* Filtered stats */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="px-3 py-2 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Conversations</span>
                <p className="text-lg font-bold font-mono" style={{ color: 'var(--linus-green)' }}>{filteredConversations.length}</p>
              </div>
              <div className="px-3 py-2 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Messages</span>
                <p className="text-lg font-bold font-mono" style={{ color: 'var(--linus-green)' }}>{filteredMessages}</p>
              </div>
              <div className="px-3 py-2 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Avg/Conv</span>
                <p className="text-lg font-bold font-mono" style={{ color: 'var(--status-amber)' }}>{filteredConversations.length > 0 ? Math.round(filteredMessages / filteredConversations.length) : 0}</p>
              </div>
            </div>

            {/* Filtered conversation list */}
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--text-tertiary)' }}>No messages in this period</p>
              ) : filteredConversations.map(conv => (
                <div key={conv.id} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                  <span className="text-[10px] font-mono w-20 flex-shrink-0" style={{ color: 'var(--linus-green)' }}>{conv.user_name || conv.email.split('@')[0]}</span>
                  <span className="text-[11px] truncate flex-1" style={{ color: 'var(--text-primary)' }}>{conv.summary || 'Untitled'}</span>
                  <span className="text-[10px] font-bold font-mono flex-shrink-0" style={{ color: 'var(--linus-green)' }}>{conv.message_count} msgs</span>
                  <span className="text-[9px] font-mono flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>{new Date(conv.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Avg Messages — breakdown */}
        {expandedCard === 'avg' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="glass-card p-5 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--status-amber)' }}>
                Conversation Length Distribution
              </h4>
              <button onClick={() => setExpandedCard(null)} style={{ color: 'var(--text-tertiary)' }}><X size={14} /></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Short (1-3 msgs)', count: conversations.filter(c => c.message_count <= 3).length, color: 'var(--text-tertiary)' },
                { label: 'Medium (4-10 msgs)', count: conversations.filter(c => c.message_count >= 4 && c.message_count <= 10).length, color: 'var(--status-amber)' },
                { label: 'Long (11-25 msgs)', count: conversations.filter(c => c.message_count >= 11 && c.message_count <= 25).length, color: 'var(--linus-green)' },
                { label: 'Deep (25+ msgs)', count: conversations.filter(c => c.message_count > 25).length, color: 'var(--ghost-purple)' },
              ].map(bucket => (
                <div key={bucket.label} className="px-3 py-3 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                  <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>{bucket.label}</span>
                  <p className="text-xl font-bold font-mono mt-1" style={{ color: bucket.color }}>{bucket.count}</p>
                </div>
              ))}
            </div>
            {conversations.length > 0 && (
              <div className="mt-3 px-3 py-2 rounded-lg text-[10px]" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-tertiary)' }}>
                Min: {Math.min(...conversations.map(c => c.message_count))} msgs | Max: {Math.max(...conversations.map(c => c.message_count))} msgs | Avg: {avgMessages} msgs
              </div>
            )}
          </motion.div>
        )}

        {/* Active Users — per-user breakdown */}
        {expandedCard === 'users' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="glass-card p-5 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--status-green)' }}>
                User Activity ({userStats.length} users)
              </h4>
              <button onClick={() => setExpandedCard(null)} style={{ color: 'var(--text-tertiary)' }}><X size={14} /></button>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {userStats.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--text-tertiary)' }}>No user activity yet</p>
              ) : userStats.map((user, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                    style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--status-green)', border: '1px solid rgba(34,197,94,0.2)' }}>
                    {(user.name || user.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
                    <p className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{user.email}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[11px] font-mono" style={{ color: 'var(--linus-green)' }}>{user.convCount} conv{user.convCount !== 1 ? 's' : ''}</p>
                    <p className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{user.msgCount} msgs</p>
                  </div>
                  <span className="text-[9px] font-mono flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>{timeAgo(user.lastActive)}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Model config */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="glass-card glass-card--linus p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Zap size={14} style={{ color: 'var(--linus-green)' }} />
            Model Configuration
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Provider', value: modelConfig ? (PROVIDER_LABELS[modelConfig.provider] || modelConfig.provider) : '...' },
              { label: 'Model', value: modelConfig?.model || '...' },
              { label: 'Mode', value: modelConfig?.mode === 'api' ? 'API Key' : (modelConfig?.mode || '...') },
              { label: 'Status', value: modelConfig ? (modelConfig.provider === 'mock' ? 'Demo Mode' : 'Active') : '...' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.label}</span>
                <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent conversations */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="glass-card glass-card--linus p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <MessageSquare size={14} style={{ color: 'var(--linus-green)' }} />
            Recent Conversations
            <button onClick={fetchConversations} className="ml-auto" style={{ color: 'var(--text-tertiary)' }}>
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          </h3>
          {conversations.length === 0 ? (
            <div className="flex items-center justify-center py-12 gap-3" style={{ color: 'var(--text-tertiary)' }}>
              <Bot size={24} style={{ opacity: 0.3, color: 'var(--linus-green)' }} />
              <div>
                <p className="text-sm">{loading ? 'Loading...' : 'No conversations yet'}</p>
                <p className="text-[11px] mt-0.5">{loading ? '' : 'Conversations appear here after users chat with Linus'}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {conversations.slice(0, 15).map(conv => (
                <div key={conv.id} className="p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono" style={{ color: 'var(--linus-green)' }}>
                      {conv.user_name || conv.email}
                    </span>
                    <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>
                      {timeAgo(conv.created_at)} — {conv.message_count} msgs
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{conv.summary}</p>
                  {conv.topics.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {conv.topics.map(topic => (
                        <span key={topic} className="px-1.5 py-0.5 rounded text-[9px]"
                          style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--linus-green)', border: '1px solid rgba(34,197,94,0.2)' }}>
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Command stats */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="glass-card glass-card--linus p-6">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Terminal size={14} style={{ color: 'var(--linus-green)' }} />
          Slash Command Usage
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {['/scan', '/fix-bpm', '/playlist', '/automix', '/filter', '/health', '/key-detect', '/suggest-next', '/recommend', '/catalog'].map((cmd, i) => (
            <motion.div key={cmd} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 + i * 0.03 }}
              className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
              <span className="text-xs font-mono" style={{ color: 'var(--linus-green)' }}>{cmd}</span>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>0</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
