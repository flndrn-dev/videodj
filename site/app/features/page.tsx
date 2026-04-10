'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import Link from 'next/link'
import {
  Brain, Wifi, Disc3, Music, Headphones, Radio, Layers,
  Sliders, Repeat, Zap, Gauge, Bot, ArrowRight, Activity,
  Volume2, Clock, Search, Tag, ListMusic, Video, MessageCircle,
} from 'lucide-react'

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

function FeatureDetail({ icon: Icon, title, description, delay = 0 }: {
  icon: typeof Disc3; title: string; description: string; delay?: number
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className="flex gap-4"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--brand-yellow-dim)', border: '1px solid rgba(255,255,0,0.15)' }}
      >
        <Icon size={18} style={{ color: 'var(--brand-yellow)' }} strokeWidth={1.5} />
      </div>
      <div>
        <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h4>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{description}</p>
      </div>
    </motion.div>
  )
}

function FeatureSection({ label, title, description, children, reverse = false }: {
  label: string; title: string; description: string; children: React.ReactNode; reverse?: boolean
}) {
  return (
    <Section className="py-24 px-6">
      <div className={`max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-start ${reverse ? 'md:[direction:rtl] md:[&>*]:[direction:ltr]' : ''}`}>
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] mb-3 block" style={{ color: 'var(--brand-yellow)' }}>
            {label}
          </span>
          <h2 className="text-3xl font-bold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h2>
          <p className="text-base leading-relaxed mb-8" style={{ color: 'var(--text-secondary)' }}>
            {description}
          </p>
        </div>
        <div className="space-y-5">
          {children}
        </div>
      </div>
    </Section>
  )
}

export default function FeaturesPage() {
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
            <Link href="/features" className="text-xs" style={{ color: 'var(--brand-yellow)' }}>Features</Link>
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
              Features
            </span>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6" style={{ color: 'var(--text-primary)' }}>
              Built for{' '}
              <span style={{ color: 'var(--brand-yellow)', textShadow: '0 0 40px rgba(255,255,0,0.2)' }}>
                Video DJs
              </span>
            </h1>
            <p className="text-lg max-w-xl mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Every tool you need to mix music videos, powered by AI. Professional-grade features in a browser-based application.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="section-divider" />

      {/* AI Agents */}
      <FeatureSection
        label="AI Agents"
        title="Two AI agents powering your performance"
        description="videoDJ.Studio ships with two dedicated AI agents that handle everything from track selection to self-healing error recovery."
      >
        <div className="glass p-6 space-y-5">
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(175,255,146,0.12)', border: '1px solid rgba(175,255,146,0.2)' }}>
              <Brain size={18} style={{ color: '#afff92' }} />
            </div>
            <div>
              <h3 className="text-base font-semibold mb-1" style={{ color: '#afff92' }}>Linus — Your AI DJ Assistant</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                30+ slash commands for library management, playlist building, metadata fixing, and mixing suggestions. Ask Linus to build a set, find compatible tracks, fix BPM/key data, or manage your entire library. Runs on Ollama/Qwen on our servers — your data never leaves our infrastructure.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.2)' }}>
              <Wifi size={18} style={{ color: '#a78bfa' }} />
            </div>
            <div>
              <h3 className="text-base font-semibold mb-1" style={{ color: '#a78bfa' }}>Ghost — Self-Healing Background Agent</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Silent background agent that monitors system health, detects anomalies, and auto-fixes issues before you notice them. Ghost learns from every error, builds a knowledge base, and continuously improves. You never interact with it — it just works.
              </p>
            </div>
          </div>
        </div>
      </FeatureSection>

      <div className="section-divider" />

      {/* Dual Deck Engine */}
      <FeatureSection
        label="Dual Deck Engine"
        title="Professional dual video decks"
        description="Two fully independent video decks with real-time audio visualization, vinyl simulation, and frame-accurate playback."
        reverse
      >
        <FeatureDetail icon={Disc3} title="Vinyl Visualization" description="Animated vinyl discs that spin in sync with playback. Visual feedback for scratching and cueing." delay={0} />
        <FeatureDetail icon={Activity} title="Real-Time Waveform" description="Live animated waveform per deck using Web Audio API AnalyserNode. Bars bounce to the beat. Click anywhere to seek." delay={0.05} />
        <FeatureDetail icon={Video} title="Dual Video Playback" description="Both decks render video simultaneously with opacity-based visual mixing. Active deck at 15% opacity, inactive at 8%." delay={0.1} />
        <FeatureDetail icon={Volume2} title="Web Audio API" description="Full audio graph with AnalyserNode, GainNode, and BiquadFilterNode per deck. No latency, no compromises." delay={0.15} />
      </FeatureSection>

      <div className="section-divider" />

      {/* Smart Mixing */}
      <FeatureSection
        label="Smart Mixing"
        title="AI-powered mixing engine"
        description="Automix uses BPM, musical key, genre, and energy analysis to create seamless transitions that sound like a real DJ."
      >
        <FeatureDetail icon={Gauge} title="BPM Matching" description="Automatic BPM detection and matching within +/-8% range. Beatmatching via playbackRate adjustment for seamless tempo alignment." delay={0} />
        <FeatureDetail icon={Music} title="Camelot Key Compatibility" description="Musical key detection using Krumhansl-Schmuckler chromagram analysis. Camelot wheel compatibility scoring for harmonic mixing." delay={0.05} />
        <FeatureDetail icon={Zap} title="Energy Curve Management" description="Five energy modes: Build, Peak, Cooldown, Wave, and Natural. The automix engine manages your set's energy flow automatically." delay={0.1} />
        <FeatureDetail icon={Clock} title="BPM-Adaptive Crossfade" description="Crossfade duration adjusts based on BPM — faster tracks get shorter transitions, slower tracks get longer blends." delay={0.15} />
        <FeatureDetail icon={Repeat} title="Autoplay Mode" description="Simple random BPM-matched playback with 3.5s crossfade. For when you want hands-free mixing without the complexity." delay={0.2} />
      </FeatureSection>

      <div className="section-divider" />

      {/* Pro DJ Controls */}
      <FeatureSection
        label="Pro DJ Controls"
        title="Full professional control surface"
        description="Everything you'd find on a CDJ/controller, right in your browser. No plugins, no downloads."
        reverse
      >
        <FeatureDetail icon={Sliders} title="3-Band EQ" description="High, Mid, and Low frequency bands per deck with kill switches. Shape your sound in real-time." delay={0} />
        <FeatureDetail icon={Headphones} title="Effects Rack" description="Filter, Delay, Reverb, and Flanger effects with wet/dry control. Stack effects for creative transitions." delay={0.05} />
        <FeatureDetail icon={Repeat} title="Loop System" description="1, 2, 4, and 8 bar loops with beat-accurate in/out points. Perfect for extending build-ups and breakdowns." delay={0.1} />
        <FeatureDetail icon={Zap} title="4 Hot Cues" description="Set up to 4 hot cue points per track. Instant jump to any saved position. Persisted across sessions." delay={0.15} />
        <FeatureDetail icon={Gauge} title="Tempo Sync & Gain" description="Manual tempo adjustment, sync lock between decks, and per-deck gain/trim control with auto-gain option." delay={0.2} />
      </FeatureSection>

      <div className="section-divider" />

      {/* Live Streaming */}
      <FeatureSection
        label="Live Streaming"
        title="Stream to Twitch & YouTube"
        description="Go live directly from videoDJ.Studio. Canvas compositor blends both decks, adds overlays, and streams via RTMP."
      >
        <FeatureDetail icon={Radio} title="RTMP Output" description="Stream to Twitch (rtmp://live.twitch.tv/app/) or YouTube (rtmp://a.rtmp.youtube.com/live2/) at 720p or 1080p." delay={0} />
        <FeatureDetail icon={Layers} title="Now Playing Overlay" description="Configurable overlay showing current track title, artist, BPM, and key. Position it anywhere on the stream." delay={0.05} />
        <FeatureDetail icon={MessageCircle} title="Chat Integration" description="Twitch IRC chat client built-in. Read and interact with your audience without leaving the DJ interface." delay={0.1} />
        <FeatureDetail icon={Video} title="Canvas Compositor" description="Real-time canvas blending of both video decks with crossfade transitions. MediaRecorder captures to WebSocket for FFmpeg processing." delay={0.15} />
      </FeatureSection>

      <div className="section-divider" />

      {/* Library Management */}
      <FeatureSection
        label="Library Management"
        title="Your entire video library, organized"
        description="Upload, analyze, tag, and organize your music video collection. Everything is stored in your browser's IndexedDB and backed up to our servers."
        reverse
      >
        <FeatureDetail icon={Gauge} title="Auto BPM Detection" description="ID3 tag extraction with Web Audio peak interval analysis fallback. Accurate BPM detection for any audio format." delay={0} />
        <FeatureDetail icon={Music} title="Musical Key Detection" description="Krumhansl-Schmuckler chromagram analysis for automatic key detection. Results in Camelot notation (1A-12B) for harmonic mixing." delay={0.05} />
        <FeatureDetail icon={Tag} title="Metadata Extraction" description="Pulls artist, album, genre, language, duration, and generates video thumbnails automatically on upload." delay={0.1} />
        <FeatureDetail icon={Search} title="Smart Search" description="Search across title, artist, album, genre, remixer, and language. Filter your library instantly." delay={0.15} />
        <FeatureDetail icon={ListMusic} title="Smart Playlists" description="AI-curated playlists with energy management. Linus builds sets based on genre, BPM range, key compatibility, and vibe." delay={0.2} />
      </FeatureSection>

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
              Ready to mix?
            </h2>
            <p className="text-base mb-8" style={{ color: 'var(--text-secondary)' }}>
              Start with a 7-day free trial. No credit card required.
            </p>
            <Link
              href="/pricing"
              className="cta-glow inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold transition-transform hover:scale-105"
              style={{ background: 'var(--brand-yellow)', color: 'var(--bg-primary)' }}
            >
              View Pricing
              <ArrowRight size={18} />
            </Link>
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
