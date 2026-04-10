'use client'

import { useState } from 'react'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hover, setHover] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!email) return
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, mode: 'signup' }),
      })
      const data = await res.json()
      if (res.ok) setSent(true)
      else setError(data.error || 'Failed to create account')
    } catch {
      setError('Connection failed')
    }
    setLoading(false)
  }

  const disabled = loading || !email

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        background:
          'radial-gradient(1200px 600px at 50% -10%, rgba(255,255,0,0.06), transparent 60%), radial-gradient(800px 500px at 80% 110%, rgba(69,177,232,0.05), transparent 60%), #0b0b14',
        color: '#e8e8f2',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '40px 36px',
          borderRadius: '20px',
          background: 'linear-gradient(180deg, rgba(28,28,48,0.85) 0%, rgba(20,20,32,0.85) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,0,0.04) inset',
          backdropFilter: 'blur(16px)',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,0,0.1)',
              border: '1px solid rgba(255,255,0,0.25)',
              boxShadow: '0 0 40px rgba(255,255,0,0.15)',
              marginBottom: '16px',
            }}
          >
            <span style={{ color: '#ffff00', fontSize: '28px', fontWeight: 800, lineHeight: 1 }}>V</span>
          </div>
          <h1 style={{ color: '#ffff00', fontSize: '20px', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
            videoDJ.Studio
          </h1>
          <p style={{ color: '#8a8aa5', fontSize: '13px', margin: '6px 0 0 0' }}>
            {sent ? 'Check your email' : 'Create your account'}
          </p>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                margin: '0 auto 20px',
                borderRadius: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(34,197,94,0.25)',
              }}
            >
              ✉
            </div>
            <p style={{ fontSize: '14px', color: '#e8e8f2', margin: '0 0 6px 0' }}>We sent an activation link to</p>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#ffff00', margin: '0 0 16px 0', wordBreak: 'break-all' }}>
              {email}
            </p>
            <p style={{ fontSize: '12px', color: '#6a6a85', margin: '0 0 24px 0', lineHeight: 1.6 }}>
              Click the link in your email to activate your account.<br />The link expires in 15 minutes.
            </p>
            <button
              onClick={() => { setSent(false); setEmail('') }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8a8aa5',
                fontSize: '12px',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label
              style={{
                display: 'block',
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#8a8aa5',
                marginBottom: '8px',
              }}
            >
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              required
              autoFocus
              placeholder="your@email.com"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '14px 16px',
                borderRadius: '12px',
                fontSize: '14px',
                background: '#14141f',
                border: `1px solid ${focused ? 'rgba(255,255,0,0.5)' : 'rgba(255,255,255,0.08)'}`,
                color: '#e8e8f2',
                outline: 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                boxShadow: focused ? '0 0 0 3px rgba(255,255,0,0.08)' : 'none',
              }}
            />

            {error && (
              <p
                style={{
                  fontSize: '12px',
                  textAlign: 'center',
                  color: '#ef4444',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  margin: '16px 0 0 0',
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={disabled}
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
              style={{
                width: '100%',
                marginTop: '20px',
                padding: '14px 16px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 700,
                border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                background: disabled ? '#2a2a3e' : '#ffff00',
                color: disabled ? '#6a6a85' : '#0b0b14',
                transition: 'transform 0.1s, box-shadow 0.2s, background 0.2s',
                transform: !disabled && hover ? 'translateY(-1px)' : 'none',
                boxShadow: !disabled && hover
                  ? '0 10px 30px rgba(255,255,0,0.25)'
                  : !disabled ? '0 4px 14px rgba(255,255,0,0.15)' : 'none',
              }}
            >
              {loading ? 'Creating account…' : 'Get started'}
            </button>

            <p style={{ textAlign: 'center', fontSize: '11px', color: '#6a6a85', margin: '16px 0 0 0' }}>
              We&apos;ll send you a magic link — no password needed
            </p>
          </form>
        )}

        <div style={{ marginTop: '32px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ textAlign: 'center', fontSize: '11px', color: '#6a6a85', margin: 0 }}>
            Already have an account?{' '}
            <a href="/login" style={{ color: '#ffff00', textDecoration: 'none' }}>Sign in</a>
          </p>
        </div>
      </div>
    </div>
  )
}
