'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import Link from 'next/link'
import {
  Sparkles, Sliders, Radio, Brain, Bot, Disc3, Tag,
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

const releases = [
  {
    version: 'v1.5',
    date: 'April 2026',
    title: 'Ghost Agent, Admin Dashboard & SaaS Website',
    icon: Sparkles,
    accent: '#a78bfa',
    latest: true,
    changes: [
      'Ghost self-healing background agent — monitors, detects, and auto-fixes issues',
      'Full Admin Dashboard for ops: Ghost, Linus, System, Users, Support, Dev Zone, Finance, DB management',
      'SaaS marketing website with pricing, features, changelog, FAQ, and legal pages',
      'Ollama/Qwen integration on self-hosted KVM8 server',
      'Multi-app AI serving: videoDJ, mavifinans ecosystem, live support agent',
    ],
  },
  {
    version: 'v1.4',
    date: 'March 2026',
    title: 'Pro DJ Features',
    icon: Sliders,
    accent: '#45b1e8',
    latest: false,
    changes: [
      '3-band EQ (High/Mid/Low) with kill switches per deck',
      'Effects rack: Filter, Delay, Reverb, Flanger with wet/dry control',
      'Loop system: 1, 2, 4, 8 bar loops with beat-accurate points',
      '4 hot cue slots per track, persisted across sessions',
      'Tempo sync between decks with manual adjustment',
      'Per-deck gain/trim control with auto-gain option',
      'Key lock (master tempo) — change speed without pitch shift',
      'Frequency-domain waveform visualization',
      'Video transition effects between decks',
      'Monitor/cue mute for headphone pre-listening',
    ],
  },
  {
    version: 'v1.3',
    date: 'March 2026',
    title: 'Live Streaming',
    icon: Radio,
    accent: '#ef4444',
    latest: false,
    changes: [
      'RTMP streaming to Twitch and YouTube',
      'Canvas compositor for real-time video blending',
      'Now Playing overlay with configurable position',
      'Twitch IRC chat client integration',
      'YouTube Live Chat polling support',
      'Stream Dashboard with platform selection, resolution, bitrate controls',
      'Stream key stored locally (never sent to API)',
      '720p and 1080p output support at 2500-6000 kbps',
    ],
  },
  {
    version: 'v1.2',
    date: 'February 2026',
    title: 'Automix Engine',
    icon: Brain,
    accent: '#afff92',
    latest: false,
    changes: [
      'Smart track selection using BPM, Camelot key, genre, and energy analysis',
      'Five energy curve modes: Build, Peak, Cooldown, Wave, Natural',
      'BPM matching within +/-8% range via playbackRate adjustment',
      'BPM-adaptive crossfade duration',
      'Play history tracking — no repeated tracks',
      'Queue preview showing next 5 upcoming tracks',
      'Genre coherence scoring for natural set flow',
    ],
  },
  {
    version: 'v1.1',
    date: 'January 2026',
    title: 'Linus AI Agent',
    icon: Bot,
    accent: '#ffff00',
    latest: false,
    changes: [
      'Linus AI DJ assistant with 30+ slash commands',
      'Library management: search, filter, sort, batch edit metadata',
      'Playlist building: energy-based, genre-based, BPM-range sets',
      'Mixing suggestions: compatible tracks, harmonic transitions',
      'Memory system for learning user preferences',
      'Claude CLI, Claude API, and mock fallback support',
      'Confirmation flow for batch metadata changes',
    ],
  },
  {
    version: 'v1.0',
    date: 'December 2025',
    title: 'Initial Release',
    icon: Disc3,
    accent: '#9898b8',
    latest: false,
    changes: [
      'Dual video decks with vinyl visualization',
      'Custom crossfader with auto-slide and center snap',
      'Real-time waveform visualization using Web Audio API',
      'Video playback with opacity-based mixing',
      'Beatport-style playlist browser with inline editing',
      'BPM detection from ID3 tags and audio analysis',
      'Musical key detection (Camelot notation) via chromagram analysis',
      'Metadata extraction: artist, album, genre, language, thumbnails',
      'IndexedDB persistence for video blobs and metadata',
      'Duplicate detection by filename',
      'Search across title, artist, album, genre, remixer, language',
      'Autoplay mode with random BPM-matched playback',
    ],
  },
]

export default function ChangelogPage() {
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
      <section className="relative pt-32 pb-16 px-6 overflow-hidden">
        <div className="hero-glow absolute inset-0" />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-xs font-semibold uppercase tracking-[0.2em] mb-4 block" style={{ color: 'var(--brand-yellow)' }}>
              Changelog
            </span>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6" style={{ color: 'var(--text-primary)' }}>
              What&apos;s{' '}
              <span style={{ color: 'var(--brand-yellow)', textShadow: '0 0 40px rgba(255,255,0,0.2)' }}>
                New
              </span>
            </h1>
            <p className="text-lg max-w-xl mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Every update, feature, and improvement to videoDJ.Studio.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="section-divider" />

      {/* Timeline */}
      <Section className="py-24 px-6">
        <div className="max-w-3xl mx-auto relative">
          {/* Timeline line */}
          <div
            className="absolute left-6 md:left-8 top-0 bottom-0 w-px"
            style={{ background: 'linear-gradient(180deg, var(--border) 0%, transparent 100%)' }}
          />

          <div className="space-y-12">
            {releases.map((release, i) => (
              <motion.div
                key={release.version}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.5 }}
                viewport={{ once: true }}
                className="relative pl-16 md:pl-20"
              >
                {/* Timeline dot */}
                <div
                  className="absolute left-3.5 md:left-5.5 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{
                    background: release.latest ? release.accent : 'var(--bg-secondary)',
                    border: `2px solid ${release.accent}`,
                    boxShadow: release.latest ? `0 0 12px ${release.accent}40` : 'none',
                  }}
                />

                <div className="glass p-6 md:p-8">
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: `${release.accent}18`, border: `1px solid ${release.accent}30` }}
                    >
                      <release.icon size={16} style={{ color: release.accent }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold font-mono" style={{ color: release.accent }}>{release.version}</span>
                        {release.latest && (
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                            style={{ background: `${release.accent}20`, color: release.accent }}
                          >
                            Latest
                          </span>
                        )}
                      </div>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{release.date}</p>
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    {release.title}
                  </h3>

                  <ul className="space-y-2">
                    {release.changes.map((change, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <Tag size={12} className="mt-1 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>
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
