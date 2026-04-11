'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HelpCircle, X, Send, CheckCircle } from 'lucide-react'

interface HelpWidgetProps {
  userEmail?: string
  userName?: string
}

const categories = [
  { label: 'General Support', color: '#3b82f6' },
  { label: 'Finance Support', color: '#22c55e' },
  { label: 'Recover Support', color: '#f97316' },
] as const

export default function HelpWidget({ userEmail, userName }: HelpWidgetProps) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const reset = () => {
    setCategory(null)
    setSubject('')
    setMessage('')
    setSubmitted(false)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
          category,
          email: userEmail,
          name: userName,
        }),
      })
      if (res.ok) {
        setSubmitted(true)
        setTimeout(() => { setOpen(false); reset() }, 3000)
      }
    } catch { /* silent */ }
    setSubmitting(false)
  }

  return (
    <div style={{ position: 'relative' }} ref={panelRef} className="app-no-drag">
      {/* Help button — inline in header */}
      <motion.button
        onClick={() => { setOpen(!open); if (submitted) reset() }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        title="Help & Support"
        style={{
          background: open ? 'rgba(255,255,0,0.1)' : 'transparent',
          border: open ? '1px solid rgba(255,255,0,0.2)' : '1px solid transparent',
          borderRadius: 6, cursor: 'pointer', color: open ? '#ffff00' : '#555570',
          padding: 4, display: 'flex', alignItems: 'center',
          transition: 'color 0.2s, background 0.2s',
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLButtonElement).style.color = '#ffff00' }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLButtonElement).style.color = '#555570' }}
      >
        <HelpCircle size={17} />
      </motion.button>

      {/* Dropdown panel — opens downward */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
              marginTop: 8, width: 300, zIndex: 200,
              background: '#12121e', border: '1px solid #2a2a4e',
              borderRadius: 12, overflow: 'hidden',
              boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
            }}
          >
            {submitted ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <CheckCircle size={28} color="#4ade80" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>Submitted!</div>
                <div style={{ fontSize: 10, color: '#555570', marginTop: 4 }}>We&apos;ll get back to you.</div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #1a1a2e' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#e0e0f0' }}>Need Help?</span>
                  <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555570', padding: 2 }}>
                    <X size={14} />
                  </button>
                </div>

                <div style={{ padding: '12px 14px' }}>
                  {/* Category pills */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                    {categories.map(cat => (
                      <button key={cat.label} onClick={() => setCategory(category === cat.label ? null : cat.label)}
                        style={{
                          padding: '3px 8px', borderRadius: 6, fontSize: 9, fontWeight: 600, cursor: 'pointer',
                          background: category === cat.label ? `${cat.color}20` : '#1a1a2e',
                          color: category === cat.label ? cat.color : '#555570',
                          border: `1px solid ${category === cat.label ? `${cat.color}40` : '#2a2a4e'}`,
                        }}>
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Subject */}
                  <input
                    value={subject} onChange={e => setSubject(e.target.value)}
                    placeholder="Subject"
                    style={{
                      width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 11,
                      background: '#0a0a14', border: '1px solid #1a1a2e', color: '#e0e0f0',
                      outline: 'none', marginBottom: 8, boxSizing: 'border-box',
                    }}
                  />

                  {/* Message */}
                  <textarea
                    value={message} onChange={e => setMessage(e.target.value)}
                    placeholder="Describe your issue..."
                    rows={3}
                    style={{
                      width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 11,
                      background: '#0a0a14', border: '1px solid #1a1a2e', color: '#e0e0f0',
                      outline: 'none', resize: 'none', marginBottom: 8, boxSizing: 'border-box',
                    }}
                  />

                  <div style={{ fontSize: 8, color: '#333348', marginBottom: 8 }}>System info attached automatically</div>

                  {/* Submit */}
                  <button onClick={handleSubmit} disabled={!subject.trim() || !message.trim() || submitting}
                    style={{
                      width: '100%', padding: '8px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: subject.trim() && message.trim() ? '#ffff00' : '#1a1a2e',
                      color: subject.trim() && message.trim() ? '#0a0a14' : '#555570',
                      fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                    <Send size={12} />
                    {submitting ? 'Sending...' : 'Submit'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
