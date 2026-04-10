'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, useInView, useScroll, useTransform } from 'framer-motion'
import {
  Disc3, Zap, Radio, Brain, Music, Monitor, Headphones, Layers,
  ArrowRight, Download, Check, ChevronDown, Play, Wifi,
} from 'lucide-react'
import { FaTwitch, FaTiktok, FaInstagram } from 'react-icons/fa'
import { FaXTwitter } from 'react-icons/fa6'

// ---- Animated Waveform ----

function HeroWaveform() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth * 2
    canvas.height = canvas.offsetHeight * 2
    ctx.scale(2, 2)

    let offset = 0
    let animId: number

    function draw() {
      if (!ctx || !canvas) return
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      ctx.clearRect(0, 0, w, h)

      const barWidth = 3
      const gap = 2
      const totalBars = Math.ceil(w / (barWidth + gap))
      const mid = h / 2

      for (let i = 0; i < totalBars; i++) {
        const x = i * (barWidth + gap)
        const freq = Math.sin((i + offset) * 0.08) * 0.5 +
                     Math.sin((i + offset) * 0.03) * 0.3 +
                     Math.sin((i + offset) * 0.15) * 0.2
        const height = Math.abs(freq) * mid * 0.7 + 2

        const alpha = 0.08 + Math.abs(freq) * 0.12
        ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`
        ctx.fillRect(x, mid - height, barWidth, height * 2)
      }

      offset += 0.3
      animId = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animId)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.6 }}
    />
  )
}

// ---- Vinyl Disc ----

function VinylDisc({ color, size = 120 }: { color: string; size?: number }) {
  return (
    <div className="vinyl-spin" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r="48" fill="none" stroke={color} strokeWidth="0.5" opacity="0.3" />
        <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="0.3" opacity="0.2" />
        <circle cx="50" cy="50" r="32" fill="none" stroke={color} strokeWidth="0.3" opacity="0.15" />
        <circle cx="50" cy="50" r="24" fill="none" stroke={color} strokeWidth="0.3" opacity="0.1" />
        <circle cx="50" cy="50" r="8" fill={color} opacity="0.15" />
        <circle cx="50" cy="50" r="3" fill={color} opacity="0.3" />
      </svg>
    </div>
  )
}

// ---- Section wrapper ----

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className={`relative ${className}`}
    >
      {children}
    </motion.section>
  )
}

// ---- Feature Card ----

function FeatureCard({ icon: Icon, title, description, delay = 0 }: {
  icon: typeof Disc3; title: string; description: string; delay?: number
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className="glass p-8 group"
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 transition-all duration-300 group-hover:scale-110"
        style={{ background: 'var(--brand-yellow-dim)', border: '1px solid rgba(255,255,0,0.15)' }}
      >
        <Icon size={22} style={{ color: 'var(--brand-yellow)' }} strokeWidth={1.5} />
      </div>
      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{description}</p>
    </motion.div>
  )
}

// ---- Main Page ----

export default function LandingPage() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { scrollYProgress } = useScroll()
  const headerOpacity = useTransform(scrollYProgress, [0, 0.05], [0, 1])

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) setSubscribed(true)
    } catch { /* silent */ }
    setSubmitting(false)
  }

  return (
    <div className="relative">
      {/* Sticky nav */}
      <motion.nav
        style={{ opacity: headerOpacity }}
        className="fixed top-0 left-0 right-0 z-50 px-6 py-4"
      >
        <div
          className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3 rounded-2xl"
          style={{ background: 'rgba(10,10,20,0.85)', backdropFilter: 'blur(16px)', border: '1px solid var(--border)' }}
        >
          <span className="text-sm font-bold" style={{ color: 'var(--brand-yellow)' }}>videoDJ.Studio</span>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-xs" style={{ color: 'var(--text-secondary)' }}>Features</a>
            <a href="/pricing" className="text-xs" style={{ color: 'var(--text-secondary)' }}>Pricing</a>
            <a href="#download" className="text-xs" style={{ color: 'var(--text-secondary)' }}>Download</a>
            <a href="#subscribe" className="text-xs px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--brand-yellow)', color: 'var(--bg-primary)' }}>
              Get Early Access
            </a>
          </div>
        </div>
      </motion.nav>

      {/* ===== HERO ===== */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
        <div className="hero-glow absolute inset-0" />
        <HeroWaveform />

        {/* Floating vinyls */}
        <div className="absolute top-1/4 left-[10%] opacity-30">
          <VinylDisc color="var(--deck-blue)" size={160} />
        </div>
        <div className="absolute top-1/3 right-[8%] opacity-20">
          <VinylDisc color="var(--deck-red)" size={120} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 text-center max-w-3xl"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8 text-xs font-medium"
            style={{ background: 'var(--brand-yellow-dim)', color: 'var(--brand-yellow)', border: '1px solid rgba(255,255,0,0.2)' }}
          >
            <Zap size={12} />
            AI-Powered Video DJ
          </motion.div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            <span style={{ color: 'var(--text-primary)' }}>Mix Videos.</span>
            <br />
            <span style={{ color: 'var(--brand-yellow)', textShadow: '0 0 40px rgba(255,255,0,0.2)' }}>
              Like a DJ.
            </span>
          </h1>

          <p className="text-lg md:text-xl mb-10 max-w-xl mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            The intelligent Video DJ application with AI-powered beatmatching, smart playlists, and live streaming to Twitch & YouTube.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="#subscribe"
              className="cta-glow flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold transition-transform hover:scale-105"
              style={{ background: 'var(--brand-yellow)', color: 'var(--bg-primary)' }}>
              Get Early Access
              <ArrowRight size={18} />
            </a>
            <a href="#features"
              className="flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-medium transition-all"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              <Play size={16} />
              See Features
            </a>
          </div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            <ChevronDown size={24} style={{ color: 'var(--text-muted)' }} />
          </motion.div>
        </motion.div>
      </section>

      <div className="section-divider" />

      {/* ===== FEATURES ===== */}
      <Section className="py-32 px-6" >
        <div className="max-w-6xl mx-auto" id="features">
          <div className="text-center mb-20">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] mb-4 block" style={{ color: 'var(--brand-yellow)' }}>
              Features
            </span>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
              Everything a Video DJ Needs
            </h2>
            <p className="text-lg max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Professional mixing tools powered by AI, built for music video DJs
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard icon={Brain} title="AI Automix" description="Smart track selection using BPM, musical key (Camelot), genre, and energy curves. Ghost-level beatmatching." delay={0} />
            <FeatureCard icon={Disc3} title="Dual Video Decks" description="Two synchronized video decks with real-time waveforms, vinyl visualization, and smooth crossfade transitions." delay={0.05} />
            <FeatureCard icon={Radio} title="Live Streaming" description="Stream directly to Twitch and YouTube with Now Playing overlays, chat integration, and RTMP output." delay={0.1} />
            <FeatureCard icon={Music} title="Smart Playlists" description="AI-curated playlists with energy management — warm up, build, peak, cool down. Your sets flow naturally." delay={0.15} />
            <FeatureCard icon={Headphones} title="Pro DJ Controls" description="3-band EQ, effects rack, loop system, hot cues, tempo sync, and gain control. Everything you'd expect." delay={0.2} />
            <FeatureCard icon={Layers} title="BPM & Key Detection" description="Automatic BPM analysis and musical key detection (Camelot notation) from audio. No manual tagging needed." delay={0.25} />
          </div>
        </div>
      </Section>

      <div className="section-divider" />

      {/* ===== AI AGENTS ===== */}
      <Section className="py-32 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] mb-4 block" style={{ color: 'var(--brand-yellow)' }}>
                AI Agents
              </span>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-6" style={{ color: 'var(--text-primary)' }}>
                Two AI agents working<br />for your performance
              </h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(175,255,146,0.12)', border: '1px solid rgba(175,255,146,0.2)' }}>
                    <Brain size={18} style={{ color: '#afff92' }} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold mb-1" style={{ color: '#afff92' }}>Linus — Your AI DJ</h3>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      30+ slash commands for library management, playlist building, and mixing suggestions. Linus handles the work so you focus on the performance.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.2)' }}>
                    <Wifi size={18} style={{ color: '#a78bfa' }} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold mb-1" style={{ color: '#a78bfa' }}>Ghost — Self-Healing Agent</h3>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      Silent background agent that monitors, detects, and auto-fixes issues. Learns from every error. You never see it — it just works.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual */}
            <div className="relative flex items-center justify-center">
              <div className="glass p-12 w-full aspect-square flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 wave-bg opacity-30" />
                <div className="relative">
                  <VinylDisc color="var(--brand-yellow)" size={200} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <div className="section-divider" />

      {/* ===== DOWNLOAD ===== */}
      <Section className="py-32 px-6" >
        <div className="max-w-4xl mx-auto text-center" id="download">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] mb-4 block" style={{ color: 'var(--brand-yellow)' }}>
            Download
          </span>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
            Available on All Platforms
          </h2>
          <p className="text-lg mb-12" style={{ color: 'var(--text-secondary)' }}>
            Web app runs in your browser. Desktop apps coming soon.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto">
            {[
              { label: 'macOS', ext: '.dmg', icon: Monitor },
              { label: 'Windows', ext: '.exe', icon: Monitor },
              { label: 'Linux', ext: '.AppImage', icon: Monitor },
            ].map((platform, i) => (
              <motion.div
                key={platform.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="glass p-6 text-center relative overflow-hidden"
              >
                {/* Coming soon overlay */}
                <div className="absolute inset-0 flex items-center justify-center z-10"
                  style={{ background: 'rgba(10,10,20,0.7)', backdropFilter: 'blur(2px)' }}>
                  <span className="text-xs font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full"
                    style={{ background: 'var(--brand-yellow-dim)', color: 'var(--brand-yellow)', border: '1px solid rgba(255,255,0,0.2)' }}>
                    Coming Soon
                  </span>
                </div>

                <platform.icon size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{platform.label}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{platform.ext}</p>
                <button disabled className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 rounded-xl text-xs opacity-50 cursor-not-allowed"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <Download size={14} />
                  Download
                </button>
              </motion.div>
            ))}
          </div>

          <p className="text-sm mt-8" style={{ color: 'var(--text-muted)' }}>
            Use the{' '}
            <a href="https://app.videodj.studio" className="underline" style={{ color: 'var(--brand-yellow)' }}>
              web app
            </a>
            {' '}in the meantime — no download needed.
          </p>
        </div>
      </Section>

      <div className="section-divider" />

      {/* ===== PRE-SUBSCRIBE ===== */}
      <Section className="py-32 px-6">
        <div className="max-w-2xl mx-auto text-center" id="subscribe">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="glass p-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4"
              style={{ color: 'var(--brand-yellow)', textShadow: '0 0 30px rgba(255,255,0,0.15)' }}>
              Get Early Access
            </h2>
            <p className="text-base mb-4" style={{ color: 'var(--text-secondary)' }}>
              Be the first to know when videoDJ.Studio launches.
            </p>
            <p className="text-sm font-semibold mb-8 px-4 py-2 rounded-full inline-block"
              style={{ background: 'rgba(255,255,0,0.08)', color: 'var(--brand-yellow)', border: '1px solid rgba(255,255,0,0.15)' }}>
              Early subscribers get 14 days free access at launch
            </p>

            {subscribed ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center justify-center gap-3 py-4"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(34,197,94,0.15)' }}>
                  <Check size={20} style={{ color: '#22c55e' }} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold" style={{ color: '#22c55e' }}>You're on the list!</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Check your email — you'll get 14 days free when we launch.</p>
                </div>
              </motion.div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="flex-1 px-5 py-4 rounded-2xl text-sm outline-none"
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="cta-glow px-8 py-4 rounded-2xl text-sm font-semibold flex items-center gap-2 justify-center transition-transform hover:scale-105"
                  style={{
                    background: 'var(--brand-yellow)',
                    color: 'var(--bg-primary)',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? 'Subscribing...' : 'Subscribe'}
                  {!submitting && <ArrowRight size={16} />}
                </button>
              </form>
            )}
          </motion.div>
        </div>
      </Section>

      {/* ===== FOOTER ===== */}
      <footer className="py-16 px-6" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            {/* Brand */}
            <div className="md:col-span-2">
              <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--brand-yellow)' }}>videoDJ.Studio</h3>
              <p className="text-sm leading-relaxed max-w-sm" style={{ color: 'var(--text-secondary)' }}>
                AI-powered Video DJ & Auto-Mixing application. Built for DJs who mix music videos and stream live.
              </p>
              {/* Social icons */}
              <div className="flex items-center gap-4 mt-6">
                {[
                  { icon: FaXTwitter, label: 'X' },
                  { icon: FaTwitch, label: 'Twitch' },
                  { icon: FaTiktok, label: 'TikTok' },
                  { icon: FaInstagram, label: 'Instagram' },
                ].map(social => (
                  <a key={social.label} href="#" title={social.label}
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <social.icon size={16} />
                  </a>
                ))}
              </div>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Product</h4>
              <div className="space-y-2">
                {[
                  { label: 'Features', href: '/features' },
                  { label: 'Download', href: '/download' },
                  { label: 'Pricing', href: '/pricing' },
                  { label: 'Changelog', href: '/changelog' },
                  { label: 'FAQ', href: '/faq' },
                ].map(link => (
                  <a key={link.label} href={link.href} className="block text-sm transition-colors" style={{ color: 'var(--text-secondary)' }}>
                    {link.label}
                  </a>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Legal & Support</h4>
              <div className="space-y-2">
                {[
                  { label: 'Terms of Service', href: '/terms' },
                  { label: 'Privacy Policy', href: '/privacy' },
                  { label: 'Contact', href: '/contact' },
                ].map(link => (
                  <a key={link.label} href={link.href} className="block text-sm transition-colors" style={{ color: 'var(--text-secondary)' }}>
                    {link.label}
                  </a>
                ))}
                <a href="mailto:support@videodj.studio" className="block text-sm" style={{ color: 'var(--text-secondary)' }}>
                  support@videodj.studio
                </a>
              </div>
            </div>
          </div>

          <div className="section-divider mb-6" />

          <div className="flex items-center justify-between">
            <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              &copy; {new Date().getFullYear()} videoDJ.Studio by{' '}
              <span className="inline-flex items-center gap-1">
                <span style={{ color: '#fbe731' }}>flndrn</span>
                <img src="/flndrn-icon.svg" alt="flndrn" className="size-6 inline-block" />
              </span>
              . All rights reserved.
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Made with <span style={{ color: 'var(--brand-yellow)' }}>&#9829;</span> for DJs
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
