'use client'

import { useEffect, useState } from 'react'

// Desktop App-only sign-up. Identical behaviour to /desktop/login except it
// sends mode: 'signup' and talks about activating an account.
export default function DesktopSignupPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hover, setHover] = useState(false)
  const [isElectron, setIsElectron] = useState<boolean | null>(null)

  useEffect(() => {
    setIsElectron(!!(window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron)
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!email) return
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/magic-link/desktop', {
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
    <div style={shellStyle}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
          <div style={logoBadge}><span style={{ color: '#ffff00', fontSize: 28, fontWeight: 800, lineHeight: 1 }}>V</span></div>
          <p style={{ color: '#8a8aa5', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 6px 0' }}>Desktop App</p>
          <h1 style={{ color: '#ffff00', fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>videoDJ.Studio</h1>
          <p style={{ color: '#8a8aa5', fontSize: 13, margin: '6px 0 0 0' }}>
            {sent ? 'Check your email' : 'Create your Desktop App account'}
          </p>
        </div>

        {isElectron === false ? (
          <NotElectron />
        ) : sent ? (
          <SentCard email={email} onReset={() => { setSent(false); setEmail('') }} />
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={labelStyle}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              required
              autoFocus
              placeholder="your@email.com"
              style={inputStyle(focused)}
            />
            {error && <p style={errorStyle}>{error}</p>}
            <button
              type="submit"
              disabled={disabled}
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
              style={primaryButtonStyle(disabled, hover)}
            >
              {loading ? 'Creating account…' : 'Get started'}
            </button>
            <p style={{ textAlign: 'center', fontSize: 11, color: '#6a6a85', margin: '16px 0 0 0' }}>
              We&apos;ll email you a link that opens the Desktop App directly. No web fallback.
            </p>
          </form>
        )}

        <div style={footerStyle}>
          <p style={{ textAlign: 'center', fontSize: 11, color: '#6a6a85', margin: 0 }}>
            Already have an account?{' '}
            <a href="/desktop/login" style={{ color: '#ffff00', textDecoration: 'none' }}>Sign in</a>
          </p>
        </div>
      </div>
    </div>
  )
}

function SentCard({ email, onReset }: { email: string; onReset: () => void }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={sentIconStyle}>✉</div>
      <p style={{ fontSize: 14, color: '#e8e8f2', margin: '0 0 6px 0' }}>We sent a Desktop App activation link to</p>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#ffff00', margin: '0 0 16px 0', wordBreak: 'break-all' }}>
        {email}
      </p>
      <p style={{ fontSize: 12, color: '#6a6a85', margin: '0 0 24px 0', lineHeight: 1.6 }}>
        Click the button in your email. It will open the Desktop App.<br />The link expires in 15 minutes.
      </p>
      <button onClick={onReset} style={resetLinkStyle}>Use a different email</button>
    </div>
  )
}

function NotElectron() {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 14, color: '#e8e8f2', margin: '0 0 12px 0' }}>
        This sign-up page is only usable inside the Desktop App.
      </p>
      <p style={{ fontSize: 12, color: '#8a8aa5', margin: '0 0 24px 0', lineHeight: 1.6 }}>
        Download the Desktop App, or sign up through the Web App instead.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <a href="https://videodj.studio/download" style={primaryLinkStyle}>Get the Desktop App</a>
        <a href="/signup" style={secondaryLinkStyle}>Use the Web App</a>
      </div>
    </div>
  )
}

const shellStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 24,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  background:
    'radial-gradient(1200px 600px at 50% -10%, rgba(255,255,0,0.06), transparent 60%), radial-gradient(800px 500px at 80% 110%, rgba(69,177,232,0.05), transparent 60%), #0b0b14',
  color: '#e8e8f2',
}

const cardStyle: React.CSSProperties = {
  width: '100%', maxWidth: 420,
  padding: '40px 36px', borderRadius: 20,
  background: 'linear-gradient(180deg, rgba(28,28,48,0.85) 0%, rgba(20,20,32,0.85) 100%)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,0,0.04) inset',
  backdropFilter: 'blur(16px)',
}

const logoBadge: React.CSSProperties = {
  width: 56, height: 56, borderRadius: 16,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(255,255,0,0.1)',
  border: '1px solid rgba(255,255,0,0.25)',
  boxShadow: '0 0 40px rgba(255,255,0,0.15)',
  marginBottom: 16,
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: '#8a8aa5', marginBottom: 8,
}

const inputStyle = (focused: boolean): React.CSSProperties => ({
  width: '100%', boxSizing: 'border-box', padding: '14px 16px',
  borderRadius: 12, fontSize: 14,
  background: '#14141f',
  border: `1px solid ${focused ? 'rgba(255,255,0,0.5)' : 'rgba(255,255,255,0.08)'}`,
  color: '#e8e8f2', outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  boxShadow: focused ? '0 0 0 3px rgba(255,255,0,0.08)' : 'none',
})

const primaryButtonStyle = (disabled: boolean, hover: boolean): React.CSSProperties => ({
  width: '100%', marginTop: 20, padding: '14px 16px', borderRadius: 12,
  fontSize: 14, fontWeight: 700, border: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer',
  background: disabled ? '#2a2a3e' : '#ffff00',
  color: disabled ? '#6a6a85' : '#0b0b14',
  transition: 'transform 0.1s, box-shadow 0.2s, background 0.2s',
  transform: !disabled && hover ? 'translateY(-1px)' : 'none',
  boxShadow: !disabled && hover
    ? '0 10px 30px rgba(255,255,0,0.25)'
    : !disabled ? '0 4px 14px rgba(255,255,0,0.15)' : 'none',
})

const errorStyle: React.CSSProperties = {
  fontSize: 12, textAlign: 'center', color: '#ef4444',
  background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.2)',
  borderRadius: 10, padding: '10px 12px', margin: '16px 0 0 0',
}

const footerStyle: React.CSSProperties = {
  marginTop: 32, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)',
}

const sentIconStyle: React.CSSProperties = {
  width: 64, height: 64, margin: '0 auto 20px', borderRadius: 18,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 28,
  background: 'rgba(34,197,94,0.1)',
  border: '1px solid rgba(34,197,94,0.25)',
}

const resetLinkStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#8a8aa5',
  fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0,
}

const primaryLinkStyle: React.CSSProperties = {
  display: 'inline-block', padding: '12px 20px', borderRadius: 12,
  background: '#ffff00', color: '#0b0b14', fontSize: 13, fontWeight: 700,
  textDecoration: 'none',
}

const secondaryLinkStyle: React.CSSProperties = {
  display: 'inline-block', padding: '12px 20px', borderRadius: 12,
  background: 'transparent', color: '#8a8aa5', fontSize: 13, fontWeight: 600,
  textDecoration: 'none', border: '1px solid rgba(255,255,255,0.1)',
}
