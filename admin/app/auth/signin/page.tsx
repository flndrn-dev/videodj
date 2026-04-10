'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        toast.success('Welcome back!', { description: `Signed in as ${data.user?.name || email}` })
        // Use window.location for a hard redirect to ensure cookies are picked up
        window.location.href = '/'
      } else {
        toast.error('Sign in failed', {
          description: data.error || 'Invalid email or password',
          icon: <AlertCircle size={16} />,
        })
      }
    } catch {
      toast.error('Connection error', {
        description: 'Could not reach the server. Please try again.',
        icon: <AlertCircle size={16} />,
      })
    }

    setLoading(false)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* Background ambient */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 50% 30% at 50% 0%, rgba(255,255,0,0.04) 0%, transparent 70%)',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="glass-card w-full max-w-sm p-8 relative z-10"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold mb-4"
            style={{
              background: 'var(--brand-yellow-dim)',
              color: 'var(--brand-yellow)',
              border: '1px solid rgba(255, 255, 0, 0.2)',
              boxShadow: '0 0 40px rgba(255, 255, 0, 0.08)',
            }}
          >
            V
          </motion.div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--brand-yellow)' }}>
            videoDJ.Studio
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Admin Dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-2" style={{ color: 'var(--text-tertiary)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-colors"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-primary)',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,0,0.3)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-primary)' }}
              placeholder="admin@videodj.studio"
            />
          </div>

          {/* Password with eye toggle */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-2" style={{ color: 'var(--text-tertiary)' }}>
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3.5 pr-12 rounded-xl text-sm outline-none transition-colors"
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,0,0.3)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-primary)' }}
                placeholder="••••••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
            style={{
              background: email && password ? 'var(--brand-yellow)' : 'var(--bg-elevated)',
              color: email && password ? 'var(--bg-primary)' : 'var(--text-tertiary)',
              opacity: loading ? 0.7 : 1,
              cursor: !email || !password ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? (
              'Signing in...'
            ) : (
              <>
                <LogIn size={16} />
                Sign In
              </>
            )}
          </button>
        </form>

        <p className="text-center text-[10px] mt-6" style={{ color: 'var(--text-tertiary)' }}>
          Admin access only — credentials provided by system admin
        </p>
      </motion.div>
    </div>
  )
}
