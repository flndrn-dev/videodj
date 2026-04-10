'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Check, Mail, AlertTriangle } from 'lucide-react'

// Animated waveform background for login
function LoginWaveform() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth * 2
      canvas.height = window.innerHeight * 2
      ctx.scale(2, 2)
    }
    resize()
    window.addEventListener('resize', resize)

    let offset = 0
    let animId: number

    function draw() {
      if (!ctx || !canvas) return
      const w = window.innerWidth
      const h = window.innerHeight
      ctx.clearRect(0, 0, w, h)

      // Draw multiple wave layers
      for (let layer = 0; layer < 3; layer++) {
        const layerAlpha = 0.02 + layer * 0.01
        const layerSpeed = 0.15 + layer * 0.05
        const layerAmp = 30 + layer * 20

        ctx.beginPath()
        ctx.strokeStyle = `rgba(255, 255, 0, ${layerAlpha})`
        ctx.lineWidth = 1

        for (let x = 0; x < w; x++) {
          const y = h / 2 +
            Math.sin((x + offset * layerSpeed) * 0.008) * layerAmp +
            Math.sin((x + offset * layerSpeed * 1.3) * 0.015) * (layerAmp * 0.5) +
            Math.sin((x + offset * layerSpeed * 0.7) * 0.003) * (layerAmp * 1.5)

          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }

      // Vertical bars (subtle)
      const barWidth = 2
      const gap = 6
      const totalBars = Math.ceil(w / (barWidth + gap))
      const mid = h * 0.7

      for (let i = 0; i < totalBars; i++) {
        const x = i * (barWidth + gap)
        const freq = Math.sin((i + offset * 0.3) * 0.06) * 0.5 +
                     Math.sin((i + offset * 0.15) * 0.12) * 0.3
        const height = Math.abs(freq) * 40 + 1
        const alpha = 0.015 + Math.abs(freq) * 0.03

        ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`
        ctx.fillRect(x, mid - height / 2, barWidth, height)
      }

      offset += 0.5
      animId = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none" />
}

type LoginState = 'email' | 'sent' | 'denied'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<LoginState>('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!email) return
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (res.ok) {
        setState('sent')
      } else if (res.status === 403) {
        setState('denied')
      } else {
        setError(data.error || 'Something went wrong')
      }
    } catch {
      setError('Could not connect to server')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative" style={{ background: 'var(--bg-primary)' }}>
      <LoginWaveform />

      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 40% 35% at 50% 30%, rgba(255,255,0,0.05) 0%, transparent 70%)',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Glass card */}
        <div
          className="p-10 rounded-3xl relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(20,20,31,0.95) 0%, rgba(16,16,28,0.9) 100%)',
            border: '1px solid rgba(42,42,62,0.8)',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 0 80px rgba(255,255,0,0.03), 0 32px 64px rgba(0,0,0,0.4)',
          }}
        >
          {/* Logo */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="flex flex-col items-center mb-10"
          >
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center text-3xl font-bold mb-5"
              style={{
                background: 'rgba(255,255,0,0.1)',
                color: '#ffff00',
                border: '1px solid rgba(255,255,0,0.15)',
                boxShadow: '0 0 60px rgba(255,255,0,0.06)',
              }}
            >
              V
            </div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: '#ffff00' }}>
              videoDJ.Studio
            </h1>
          </motion.div>

          <AnimatePresence mode="wait">
            {/* ---- EMAIL INPUT ---- */}
            {state === 'email' && (
              <motion.div key="email" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <p className="text-center text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
                  Enter your email to sign in
                </p>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.15em] font-semibold block mb-2.5" style={{ color: 'var(--text-muted)' }}>
                      Email address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      autoComplete="email"
                      className="w-full px-5 py-4 rounded-2xl text-sm outline-none transition-all duration-200"
                      style={{
                        background: 'rgba(30,30,50,0.6)',
                        border: '1px solid rgba(42,42,62,0.8)',
                        color: 'var(--text-primary)',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255,255,0,0.3)'
                        e.currentTarget.style.boxShadow = '0 0 20px rgba(255,255,0,0.04)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(42,42,62,0.8)'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                      placeholder="your@email.com"
                    />
                  </div>

                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs text-center px-4 py-2.5 rounded-xl"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}
                    >
                      {error}
                    </motion.p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !email}
                    className="w-full py-4 rounded-2xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2"
                    style={{
                      background: email ? '#ffff00' : 'rgba(42,42,62,0.5)',
                      color: email ? '#0a0a14' : 'var(--text-muted)',
                      opacity: loading ? 0.7 : 1,
                      cursor: !email ? 'not-allowed' : 'pointer',
                      boxShadow: email ? '0 0 30px rgba(255,255,0,0.15)' : 'none',
                    }}
                  >
                    {loading ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        className="w-4 h-4 border-2 rounded-full"
                        style={{ borderColor: '#0a0a14', borderTopColor: 'transparent' }}
                      />
                    ) : (
                      <>
                        Continue
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>

                <p className="text-center text-[11px] mt-6 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  We'll send you a sign-in link — no password needed
                </p>
              </motion.div>
            )}

            {/* ---- EMAIL SENT ---- */}
            {state === 'sent' && (
              <motion.div key="sent" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                  className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-6"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.15)' }}
                >
                  <Mail size={28} style={{ color: '#22c55e' }} />
                </motion.div>

                <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Check your email
                </h2>
                <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                  We sent a sign-in link to
                </p>
                <p className="text-sm font-semibold mb-6" style={{ color: '#ffff00' }}>
                  {email}
                </p>
                <p className="text-xs mb-8 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Click the link in your email to access videoDJ.Studio.<br />
                  The link expires in 15 minutes.
                </p>

                <button
                  onClick={() => { setState('email'); setEmail('') }}
                  className="text-xs px-4 py-2 rounded-xl transition-colors"
                  style={{ color: 'var(--text-muted)', border: '1px solid rgba(42,42,62,0.5)' }}
                >
                  Use a different email
                </button>
              </motion.div>
            )}

            {/* ---- ACCESS DENIED ---- */}
            {state === 'denied' && (
              <motion.div key="denied" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                  className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-6"
                  style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.15)' }}
                >
                  <AlertTriangle size={28} style={{ color: '#f59e0b' }} />
                </motion.div>

                <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Not available yet
                </h2>
                <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  videoDJ.Studio is currently in private beta.<br />
                  Sign up for early access to get an invite.
                </p>

                <a
                  href="/#subscribe"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-semibold transition-all"
                  style={{
                    background: '#ffff00',
                    color: '#0a0a14',
                    boxShadow: '0 0 20px rgba(255,255,0,0.1)',
                  }}
                >
                  Get Early Access
                  <ArrowRight size={16} />
                </a>

                <div className="mt-6">
                  <button
                    onClick={() => { setState('email'); setEmail('') }}
                    className="text-xs px-4 py-2 rounded-xl transition-colors"
                    style={{ color: 'var(--text-muted)', border: '1px solid rgba(42,42,62,0.5)' }}
                  >
                    Try a different email
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] mt-6" style={{ color: 'var(--text-muted)' }}>
          &copy; {new Date().getFullYear()} videoDJ.Studio by <span style={{ color: '#fbe731' }}>flndrn</span> <img src="/flndrn-icon.svg" alt="flndrn" className="size-6 inline-block" /> — AI-Powered Video DJ
        </p>
      </motion.div>
    </div>
  )
}
