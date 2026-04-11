'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, Check, X } from 'lucide-react'

interface CategoryDef {
  tag: string
  label: string
  color: string
}

interface ContactFormProps {
  apiEndpoint?: string
  brandColor?: string
  categories?: CategoryDef[]
  collectHiddenFields?: boolean
  onSuccess?: () => void
}

const DEFAULT_CATEGORIES: CategoryDef[] = [
  { tag: '#support', label: 'General Support', color: '#3b82f6' },
  { tag: '#subscription', label: 'Finance Support', color: '#22c55e' },
  { tag: '#recover', label: 'Recover Support', color: '#f97316' },
]

interface HiddenMeta {
  ip: string
  country: string
  timezone: string
  os: string
}

export function ContactForm({
  apiEndpoint = '/api/contact',
  brandColor = '#ffff00',
  categories = DEFAULT_CATEGORIES,
  collectHiddenFields = true,
  onSuccess,
}: ContactFormProps) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [subjectText, setSubjectText] = useState('')
  const [rawInput, setRawInput] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [ticketNumber, setTicketNumber] = useState<string | null>(null)
  const [meta, setMeta] = useState<HiddenMeta | null>(null)

  const subjectInputRef = useRef<HTMLInputElement>(null)

  // Collect hidden fields on mount
  useEffect(() => {
    if (!collectHiddenFields) return
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(data => {
        setMeta({
          ip: data.ip,
          country: data.country_name,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          os: navigator.platform || navigator.userAgent,
        })
      })
      .catch(() => {
        setMeta({
          ip: 'unknown',
          country: 'unknown',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          os: navigator.platform || navigator.userAgent,
        })
      })
  }, [collectHiddenFields])

  const activeCategory = tag ? categories.find(c => c.tag === tag) : null

  function checkAndSetTag(value: string) {
    const lower = value.toLowerCase()
    for (const cat of categories) {
      if (
        lower.startsWith(cat.tag) &&
        (value.length === cat.tag.length || [' ', ',', '\t'].includes(value[cat.tag.length]))
      ) {
        setTag(cat.tag)
        setSubjectText(value.slice(cat.tag.length).replace(/^[,\s]+/, ''))
        setRawInput('')
        return true
      }
    }
    return false
  }

  function handleSubjectChange(value: string) {
    if (tag) {
      setSubjectText(value)
      return
    }
    if (!checkAndSetTag(value)) {
      setRawInput(value)
    }
  }

  function handleSubjectKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (tag) return
    if (e.key === 'Tab') {
      const lower = rawInput.toLowerCase()
      for (const cat of categories) {
        if (lower === cat.tag) {
          e.preventDefault()
          setTag(cat.tag)
          setSubjectText('')
          setRawInput('')
          return
        }
      }
    }
    // Backspace on empty with tag removes tag
    if (e.key === 'Backspace' && tag && subjectText === '') {
      setTag(null)
      setRawInput('')
    }
  }

  function handleSubjectKeyDownWithTag(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && subjectText === '' && tag) {
      setTag(null)
      setRawInput('')
    }
  }

  function removeTag() {
    setTag(null)
    setRawInput('')
    setTimeout(() => subjectInputRef.current?.focus(), 0)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName || !email || !message) return
    const subject = tag
      ? `${activeCategory?.label || tag}: ${tag ? subjectText : rawInput}`
      : rawInput
    if (!subject && !tag) return

    setSubmitting(true)
    try {
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          subject: tag ? `[${activeCategory?.label}] ${subjectText}` : rawInput,
          message,
          category: activeCategory?.label || null,
          meta,
        }),
      })
      const data = await res.json()
      if (data.ticketNumber) setTicketNumber(data.ticketNumber)
      setSubmitted(true)
      onSuccess?.()
    } catch {
      // silent fail
    }
    setSubmitting(false)
  }

  // Shared input styles
  const inputStyle: React.CSSProperties = {
    background: 'rgba(20, 20, 35, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#f0f0f8',
    borderRadius: 12,
    padding: '12px 16px',
    fontSize: 14,
    outline: 'none',
    width: '100%',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 500,
    marginBottom: 8,
    color: '#6a6a8a',
  }

  if (submitted) {
    return (
      <div
        style={{
          background: 'rgba(14, 14, 28, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: 20,
          padding: 48,
          textAlign: 'center',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'rgba(34, 197, 94, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}
        >
          <Check size={28} style={{ color: '#22c55e' }} />
        </div>
        <h2 style={{ color: '#f0f0f8', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          {ticketNumber ? `Ticket Created — ${ticketNumber}` : 'Message Sent'}
        </h2>
        <p style={{ color: '#9898b8', fontSize: 14 }}>
          We typically respond within 24 hours.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: 'rgba(14, 14, 28, 0.6)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: 20,
        padding: 32,
        backdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      {/* Row 1: First Name + Last Name */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle}>First Name</label>
          <input
            type="text"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            required
            placeholder="First name"
            style={inputStyle}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
          />
        </div>
        <div>
          <label style={labelStyle}>Last Name</label>
          <input
            type="text"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            placeholder="Last name"
            style={inputStyle}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
          />
        </div>
      </div>

      {/* Row 2: Email */}
      <div>
        <label style={labelStyle}>Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="your@email.com"
          style={inputStyle}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
        />
      </div>

      {/* Row 3: Subject with smart tag */}
      <div>
        <label style={labelStyle}>
          Subject
          <span style={{ color: '#4a4a6a', fontWeight: 400, marginLeft: 8 }}>
            type #support, #subscription, or #recover for a ticket
          </span>
        </label>
        <div
          style={{
            ...inputStyle,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: tag ? '8px 12px' : '12px 16px',
            cursor: 'text',
          }}
          onClick={() => subjectInputRef.current?.focus()}
        >
          {activeCategory && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: activeCategory.color,
                color: '#fff',
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {activeCategory.label}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); removeTag() }}
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 2,
                  color: '#fff',
                  lineHeight: 0,
                }}
              >
                <X size={12} />
              </button>
            </span>
          )}
          <input
            ref={subjectInputRef}
            type="text"
            value={tag ? subjectText : rawInput}
            onChange={e => handleSubjectChange(e.target.value)}
            onKeyDown={tag ? handleSubjectKeyDownWithTag : handleSubjectKeyDown}
            required={!tag}
            placeholder={tag ? 'Describe your issue...' : 'Subject or type # for a ticket'}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f0f0f8',
              fontSize: 14,
              flex: 1,
              minWidth: 0,
              padding: 0,
              fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      {/* Row 4: Message */}
      <div>
        <label style={labelStyle}>Message</label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          required
          rows={6}
          placeholder="Tell us what's on your mind..."
          style={{
            ...inputStyle,
            resize: 'none',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
        />
      </div>

      {/* Row 5: Submit */}
      <button
        type="submit"
        disabled={submitting}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '14px 32px',
          borderRadius: 16,
          fontSize: 14,
          fontWeight: 600,
          border: 'none',
          cursor: submitting ? 'not-allowed' : 'pointer',
          background: brandColor,
          color: '#0a0a14',
          opacity: submitting ? 0.7 : 1,
          transition: 'transform 0.15s, opacity 0.15s',
          alignSelf: 'flex-start',
          fontFamily: 'inherit',
        }}
        onMouseEnter={e => { if (!submitting) e.currentTarget.style.transform = 'scale(1.05)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        {submitting ? 'Sending...' : 'Send Message'}
        {!submitting && <Send size={16} />}
      </button>
    </form>
  )
}
