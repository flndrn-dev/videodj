'use client'

import { useState } from 'react'
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

  const reset = () => {
    setCategory(null)
    setSubject('')
    setMessage('')
    setSubmitted(false)
  }

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
          category: category || 'General Support',
          email: userEmail,
          name: userName,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      setSubmitted(true)
      setTimeout(() => {
        setOpen(false)
        reset()
      }, 3000)
    } catch {
      // keep form open on error
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Floating help button */}
      {!open && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          whileHover={{ scale: 1.1 }}
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            bottom: 140,
            left: 20,
            zIndex: 1000,
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'rgba(10, 10, 20, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#a0a0b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          }}
          title="Help & Support"
        >
          <HelpCircle size={20} />
        </motion.button>
      )}

      {/* Expanded panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed',
              bottom: 140,
              left: 20,
              zIndex: 1000,
              width: 320,
              background: 'rgba(10, 10, 20, 0.95)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(26, 26, 46, 0.8)',
              borderRadius: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <span style={{ color: '#e0e0f0', fontSize: 14, fontWeight: 600 }}>Need Help?</span>
              <button
                onClick={() => { setOpen(false); reset() }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#a0a0b8',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {submitted ? (
              /* Success state */
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 24px',
                gap: 12,
              }}>
                <CheckCircle size={36} color="#22c55e" />
                <span style={{ color: '#e0e0f0', fontSize: 14, textAlign: 'center' }}>
                  Submitted! We'll get back to you.
                </span>
              </div>
            ) : (
              /* Form */
              <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Category pills */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {categories.map((cat) => {
                    const selected = category === cat.label
                    return (
                      <button
                        key={cat.label}
                        onClick={() => setCategory(selected ? null : cat.label)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 500,
                          border: `1px solid ${selected ? cat.color : 'rgba(255,255,255,0.1)'}`,
                          background: selected ? `${cat.color}20` : 'transparent',
                          color: selected ? cat.color : '#a0a0b8',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {cat.label}
                      </button>
                    )
                  })}
                </div>

                {/* Subject */}
                <input
                  type="text"
                  placeholder="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 13,
                    color: '#e0e0f0',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />

                {/* Message */}
                <textarea
                  placeholder="Describe your issue..."
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 13,
                    color: '#e0e0f0',
                    outline: 'none',
                    resize: 'vertical',
                    minHeight: 80,
                    width: '100%',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />

                {/* Context note */}
                <span style={{ fontSize: 11, color: '#606078' }}>
                  System info will be attached automatically
                </span>

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={!subject.trim() || !message.trim() || submitting}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: (!subject.trim() || !message.trim()) ? 'rgba(255,255,0,0.15)' : '#ffff00',
                    color: (!subject.trim() || !message.trim()) ? '#888' : '#0a0a14',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: (!subject.trim() || !message.trim() || submitting) ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease',
                    width: '100%',
                  }}
                >
                  <Send size={14} />
                  {submitting ? 'Sending...' : 'Submit'}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
