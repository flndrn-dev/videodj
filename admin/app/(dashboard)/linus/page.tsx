'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Bot, MessageSquare, Zap, Terminal, TrendingUp, RefreshCw } from 'lucide-react'
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

export default function LinusPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/linus/conversations?limit=50')
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
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

  const totalMessages = conversations.reduce((sum, c) => sum + c.message_count, 0)

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold glow-green" style={{ color: 'var(--linus-green)' }}>Linus AI Agent</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Conversation history, API usage, and model configuration
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Conversations', value: conversations.length, icon: MessageSquare, accent: 'var(--linus-green)' },
          { label: 'Total Messages', value: totalMessages, icon: Terminal, accent: 'var(--linus-green)' },
          { label: 'Avg Messages/Conv', value: conversations.length > 0 ? Math.round(totalMessages / conversations.length) : 0, icon: Zap, accent: 'var(--status-amber)' },
          { label: 'Active Users', value: new Set(conversations.map(c => c.user_id)).size, icon: TrendingUp, accent: 'var(--status-green)' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}
            className="glass-card glass-card--linus p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={14} style={{ color: stat.accent }} />
              <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-tertiary)' }}>{stat.label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: stat.accent }}>
              <AnimatedCounter value={stat.value} />
            </p>
          </motion.div>
        ))}
      </div>

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
              { label: 'Provider', value: 'Anthropic (Claude API)' },
              { label: 'Model', value: 'claude-sonnet-4-20250514' },
              { label: 'Mode', value: 'API Key' },
              { label: 'Fallback', value: 'Ollama/Qwen 2.5 (after KVM8 migration)' },
              { label: 'Status', value: 'Active' },
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
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {conversations.slice(0, 10).map(conv => (
                <div key={conv.id} className="p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono" style={{ color: 'var(--linus-green)' }}>
                      {conv.user_name || conv.email}
                    </span>
                    <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(conv.created_at).toLocaleString()} — {conv.message_count} msgs
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
          {['/scan', '/fix-bpm', '/playlist', '/automix', '/filter', '/health', '/key-detect', '/suggest-next'].map((cmd, i) => (
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
