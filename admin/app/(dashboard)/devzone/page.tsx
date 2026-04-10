'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lightbulb, Plus, X, GripVertical, Loader2 } from 'lucide-react'

interface DevCard {
  id: string
  title: string
  description: string
  column: 'ideas' | 'todo' | 'in_progress' | 'testing' | 'done'
  priority: 'low' | 'medium' | 'high'
  tags: string[]
  sort_order: number
  created_by: string
  created_at: string
  updated_at: string
}

const columns = [
  { id: 'ideas' as const, label: 'Ideas', emoji: '💡' },
  { id: 'todo' as const, label: 'To Do', emoji: '📋' },
  { id: 'in_progress' as const, label: 'In Progress', emoji: '🔨' },
  { id: 'testing' as const, label: 'Testing', emoji: '🧪' },
  { id: 'done' as const, label: 'Done', emoji: '✅' },
]

const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: 'rgba(34,197,94,0.1)', text: 'var(--status-green)', border: 'rgba(34,197,94,0.2)' },
  medium: { bg: 'rgba(245,158,11,0.1)', text: 'var(--status-amber)', border: 'rgba(245,158,11,0.2)' },
  high: { bg: 'rgba(239,68,68,0.1)', text: 'var(--status-red)', border: 'rgba(239,68,68,0.2)' },
}

export default function DevZonePage() {
  const [cards, setCards] = useState<DevCard[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [newColumn, setNewColumn] = useState<DevCard['column']>('ideas')
  const [newTags, setNewTags] = useState('')
  const [draggedCard, setDraggedCard] = useState<string | null>(null)

  const fetchCards = useCallback(async () => {
    try {
      const res = await fetch('/api/devzone')
      const data = await res.json()
      setCards(data.cards || [])
    } catch (err) {
      console.error('Failed to fetch dev cards:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCards() }, [fetchCards])

  const handleAdd = async () => {
    if (!newTitle) return
    try {
      const res = await fetch('/api/devzone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          description: newDesc,
          column: newColumn,
          priority: newPriority,
          tags: newTags.split(',').map(t => t.trim()).filter(Boolean),
          created_by: 'DJ Bodhi',
        }),
      })
      const data = await res.json()
      if (data.card) {
        setCards(prev => [...prev, data.card])
      }
    } catch (err) {
      console.error('Failed to create card:', err)
    }
    setNewTitle('')
    setNewDesc('')
    setNewTags('')
    setShowNew(false)
  }

  const handleDrop = async (column: DevCard['column']) => {
    if (!draggedCard) return
    // Optimistic update
    setCards(prev => prev.map(c => c.id === draggedCard ? { ...c, column } : c))
    const cardId = draggedCard
    setDraggedCard(null)
    try {
      await fetch('/api/devzone', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cardId, column }),
      })
    } catch (err) {
      console.error('Failed to update card:', err)
      fetchCards() // Revert on failure
    }
  }

  const handleDeleteCard = async (id: string) => {
    // Optimistic update
    setCards(prev => prev.filter(c => c.id !== id))
    try {
      await fetch(`/api/devzone?id=${id}`, { method: 'DELETE' })
    } catch (err) {
      console.error('Failed to delete card:', err)
      fetchCards() // Revert on failure
    }
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold glow-yellow" style={{ color: 'var(--brand-yellow)' }}>Dev Zone</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {cards.length} cards — drag to move between columns
          </p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
          style={{ background: 'var(--brand-yellow)', color: 'var(--bg-primary)' }}>
          <Plus size={16} /> New Idea
        </button>
      </motion.div>

      {/* Kanban board */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
        </div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 min-h-[40vh] xl:min-h-[60vh]">
        {columns.map((col, ci) => (
          <motion.div
            key={col.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: ci * 0.05 }}
            className="flex flex-col rounded-2xl p-3"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
            onDragOver={e => e.preventDefault()}
            onDrop={() => handleDrop(col.id)}
          >
            <div className="flex items-center gap-2 px-2 py-2 mb-3">
              <span className="text-sm">{col.emoji}</span>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                {col.label}
              </span>
              <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
                {cards.filter(c => c.column === col.id).length}
              </span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto">
              <AnimatePresence>
                {cards.filter(c => c.column === col.id).map(card => (
                  <motion.div
                    key={card.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    draggable
                    onDragStart={() => setDraggedCard(card.id)}
                    className="glass-card p-3 cursor-grab active:cursor-grabbing group"
                    style={{ borderLeft: `3px solid ${priorityColors[card.priority].text}` }}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <p className="text-sm font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>
                        {card.title}
                      </p>
                      <button onClick={() => handleDeleteCard(card.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                        style={{ color: 'var(--text-tertiary)' }}>
                        <X size={12} />
                      </button>
                    </div>
                    {card.description && (
                      <p className="text-[11px] leading-relaxed mb-2" style={{ color: 'var(--text-tertiary)' }}>
                        {card.description.slice(0, 80)}{card.description.length > 80 ? '...' : ''}
                      </p>
                    )}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold"
                        style={{ background: priorityColors[card.priority].bg, color: priorityColors[card.priority].text }}>
                        {card.priority}
                      </span>
                      {card.tags.map(tag => (
                        <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        ))}
      </div>
      )}

      {/* New card modal */}
      <AnimatePresence>
        {showNew && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowNew(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--brand-yellow)' }}>New Idea</h3>
                <button onClick={() => setShowNew(false)} style={{ color: 'var(--text-tertiary)' }}><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Title"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }} />
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" rows={3}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }} />
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>Priority</label>
                  <div className="flex gap-2">
                    {(['low', 'medium', 'high'] as const).map(p => (
                      <button key={p} onClick={() => setNewPriority(p)}
                        className="flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-all"
                        style={{
                          background: newPriority === p ? priorityColors[p].bg : 'var(--bg-tertiary)',
                          color: newPriority === p ? priorityColors[p].text : 'var(--text-tertiary)',
                          border: `1px solid ${newPriority === p ? priorityColors[p].border : 'var(--border-primary)'}`,
                        }}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>Column</label>
                  <div className="flex gap-2 flex-wrap">
                    {columns.map(col => (
                      <button key={col.id} onClick={() => setNewColumn(col.id)}
                        className="px-3 py-2 rounded-xl text-xs font-medium transition-all"
                        style={{
                          background: newColumn === col.id ? 'var(--brand-yellow-dim)' : 'var(--bg-tertiary)',
                          color: newColumn === col.id ? 'var(--brand-yellow)' : 'var(--text-tertiary)',
                          border: `1px solid ${newColumn === col.id ? 'rgba(255,255,0,0.2)' : 'var(--border-primary)'}`,
                        }}>
                        {col.emoji} {col.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input type="text" value={newTags} onChange={e => setNewTags(e.target.value)} placeholder="Tags (comma separated)"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }} />
                <button onClick={handleAdd} disabled={!newTitle}
                  className="w-full px-4 py-3 rounded-xl text-sm font-medium mt-2"
                  style={{
                    background: newTitle ? 'var(--brand-yellow)' : 'var(--bg-elevated)',
                    color: newTitle ? 'var(--bg-primary)' : 'var(--text-tertiary)',
                    cursor: newTitle ? 'pointer' : 'not-allowed',
                  }}>
                  Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
