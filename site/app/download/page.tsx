'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import Link from 'next/link'
import {
  Monitor, Globe, Apple, Download, ArrowRight, Check, Cpu, HardDrive, Wifi,
} from 'lucide-react'

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

const platforms = [
  {
    name: 'Web App',
    description: 'Run directly in your browser. No installation needed.',
    icon: Globe,
    ext: 'Browser',
    available: true,
    link: 'https://app.videodj.studio',
    accent: 'var(--brand-yellow)',
    accentDim: 'var(--brand-yellow-dim)',
  },
  {
    name: 'macOS',
    description: 'Native desktop app for macOS 12+ (Monterey and later).',
    icon: Apple,
    ext: '.dmg',
    available: false,
    link: null,
    accent: 'var(--text-muted)',
    accentDim: 'rgba(90,90,120,0.1)',
  },
  {
    name: 'Windows',
    description: 'Desktop app for Windows 10/11 (64-bit).',
    icon: Monitor,
    ext: '.exe / .msi',
    available: false,
    link: null,
    accent: 'var(--text-muted)',
    accentDim: 'rgba(90,90,120,0.1)',
  },
  {
    name: 'Linux',
    description: 'Available as AppImage and .deb package.',
    icon: Monitor,
    ext: '.AppImage / .deb',
    available: false,
    link: null,
    accent: 'var(--text-muted)',
    accentDim: 'rgba(90,90,120,0.1)',
  },
]

const requirements = [
  { icon: Globe, label: 'Browser', value: 'Chrome 90+, Firefox 90+, Safari 16+, Edge 90+' },
  { icon: Cpu, label: 'Processor', value: 'Dual-core 2GHz+ recommended' },
  { icon: HardDrive, label: 'Storage', value: 'IndexedDB for local storage (browser), 500MB+ free disk for desktop' },
  { icon: Wifi, label: 'Network', value: 'Required for AI features and streaming. Offline playback supported.' },
]

export default function DownloadPage() {
  return (
    <div className="relative">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
        <div
          className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3 rounded-2xl"
          style={{ background: 'rgba(10,10,20,0.85)', backdropFilter: 'blur(16px)', border: '1px solid var(--border)' }}
        >
          <Link href="/" className="text-sm font-bold" style={{ color: '#ffff00' }}>videoDJ.Studio</Link>
          <div className="flex items-center gap-6">
            <Link href="/features" className="text-xs" style={{ color: 'var(--text-secondary)' }}>Features</Link>
            <Link href="/pricing" className="text-xs" style={{ color: 'var(--text-secondary)' }}>Pricing</Link>
            <Link href="/login" className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="hero-glow absolute inset-0" />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-xs font-semibold uppercase tracking-[0.2em] mb-4 block" style={{ color: 'var(--brand-yellow)' }}>
              Download
            </span>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6" style={{ color: 'var(--text-primary)' }}>
              Available{' '}
              <span style={{ color: 'var(--brand-yellow)', textShadow: '0 0 40px rgba(255,255,0,0.2)' }}>
                Everywhere
              </span>
            </h1>
            <p className="text-lg max-w-xl mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Start mixing in your browser today. Desktop apps for macOS, Windows, and Linux are coming soon.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="section-divider" />

      {/* Platform Cards */}
      <Section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {platforms.map((platform, i) => (
              <motion.div
                key={platform.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                viewport={{ once: true }}
                className={`glass p-8 relative overflow-hidden ${platform.available ? '' : 'opacity-70'}`}
              >
                {!platform.available && (
                  <div className="absolute top-4 right-4">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full"
                      style={{ background: 'var(--brand-yellow-dim)', color: 'var(--brand-yellow)', border: '1px solid rgba(255,255,0,0.2)' }}
                    >
                      Coming Soon
                    </span>
                  </div>
                )}

                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                  style={{ background: platform.accentDim, border: `1px solid rgba(255,255,0,0.1)` }}
                >
                  <platform.icon size={24} style={{ color: platform.accent }} strokeWidth={1.5} />
                </div>

                <h3 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{platform.name}</h3>
                <p className="text-xs font-mono mb-3" style={{ color: 'var(--text-muted)' }}>{platform.ext}</p>
                <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>{platform.description}</p>

                {platform.available ? (
                  <a
                    href={platform.link!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cta-glow inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-transform hover:scale-105"
                    style={{ background: 'var(--brand-yellow)', color: 'var(--bg-primary)' }}
                  >
                    Launch Web App
                    <ArrowRight size={16} />
                  </a>
                ) : (
                  <button
                    disabled
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm cursor-not-allowed"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                  >
                    <Download size={14} />
                    Download
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      <div className="section-divider" />

      {/* System Requirements */}
      <Section className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
              System Requirements
            </h2>
            <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
              videoDJ.Studio runs in any modern browser. Here is what you need.
            </p>
          </div>

          <div className="glass p-8 space-y-6">
            {requirements.map((req, i) => (
              <motion.div
                key={req.label}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                viewport={{ once: true }}
                className="flex items-start gap-4"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--brand-yellow-dim)', border: '1px solid rgba(255,255,0,0.1)' }}
                >
                  <req.icon size={18} style={{ color: 'var(--brand-yellow)' }} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>{req.label}</h4>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{req.value}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      <div className="section-divider" />

      {/* CTA */}
      <Section className="py-32 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="glass p-12"
          >
            <h2 className="text-3xl font-bold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
              No download needed
            </h2>
            <p className="text-base mb-8" style={{ color: 'var(--text-secondary)' }}>
              The web app is fully featured and ready to use right now. Start your 7-day free trial.
            </p>
            <a
              href="https://app.videodj.studio"
              target="_blank"
              rel="noopener noreferrer"
              className="cta-glow inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold transition-transform hover:scale-105"
              style={{ background: 'var(--brand-yellow)', color: 'var(--bg-primary)' }}
            >
              Try the Web App
              <ArrowRight size={18} />
            </a>
          </motion.div>
        </div>
      </Section>

      {/* Footer */}
      <footer className="py-12 px-6" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            &copy; {new Date().getFullYear()} videoDJ.Studio by{' '}
            <span className="inline-flex items-center gap-1">
              <span style={{ color: '#fbe731' }}>flndrn</span>
              <img src="/flndrn-icon.svg" alt="flndrn" className="size-6 inline-block" />
            </span>
            . All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="text-xs" style={{ color: 'var(--text-muted)' }}>Terms</Link>
            <Link href="/privacy" className="text-xs" style={{ color: 'var(--text-muted)' }}>Privacy</Link>
            <Link href="/contact" className="text-xs" style={{ color: 'var(--text-muted)' }}>Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
