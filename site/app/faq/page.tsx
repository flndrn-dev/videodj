'use client'

import { useState, useRef, useMemo } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { ChevronDown, ArrowRight, Search, X } from 'lucide-react'

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

type FAQEntry = {
  question: string
  answer: string
}

type FAQCategory = {
  name: string
  emoji: string
  entries: FAQEntry[]
}

const categories: FAQCategory[] = [
  {
    name: 'Getting Started',
    emoji: '🚀',
    entries: [
      {
        question: 'What is videoDJ.Studio?',
        answer: 'videoDJ.Studio is an AI-powered video DJ application for mixing music videos. It features dual video decks with real-time waveform visualization, AI-powered beatmatching, smart playlists, and live streaming to Twitch and YouTube. Think of it as a professional DJ setup, but for music videos — all running in your browser.',
      },
      {
        question: 'How do I upload my music library?',
        answer: 'Open the app, click the settings icon in the header, and select your music folder. The app scans for video files and automatically extracts metadata like BPM, musical key, genre, language, artist, and album. You can also drag and drop files directly onto the playlist panel.',
      },
      {
        question: 'What file formats are supported?',
        answer: 'videoDJ.Studio supports MP4, MKV, AVI, MOV, WebM, and M4V video files. When you upload a video, the application automatically extracts the audio track for BPM detection, musical key analysis (Camelot notation), and waveform generation. Metadata is extracted from file tags when available, with AI-powered fallback analysis.',
      },
      {
        question: 'Do I need an account?',
        answer: 'You can try the app free for 7 days with full access to Fun User features — no credit card required. After the trial ends, choose a Fun User or DJ User plan to continue. Early subscribers who signed up before launch receive 14 days free instead.',
      },
      {
        question: 'Is there a desktop app?',
        answer: 'Desktop apps for macOS, Windows, and Linux are coming soon. They will wrap the same web codebase with native file system access for better performance with large local libraries. In the meantime, the web app at app.videodj.studio is fully featured and works in Chrome, Firefox, Safari, and Edge.',
      },
    ],
  },
  {
    name: 'Library & Uploads',
    emoji: '📚',
    entries: [
      {
        question: 'Why is my upload slow?',
        answer: 'The app extracts BPM, musical key, loudness, and other metadata from each file during upload, which takes processing time. Files already in your library are detected and skipped automatically. For very large libraries (1000+ files), uploading in batches of a few hundred at a time gives the best experience.',
      },
      {
        question: 'How does duplicate detection work?',
        answer: 'Files are matched by filename, artist+title combination, and duration. If a match is found during scanning, the duplicate is skipped automatically so you never end up with double entries in your library.',
      },
      {
        question: 'What metadata is extracted?',
        answer: 'The app extracts BPM, musical key (displayed in Camelot notation like 8A, 11B), genre, language, artist, album, duration, loudness (for auto-gain matching), and effective start/end times (so silence and credits are skipped). Thumbnails are also generated from video frames.',
      },
      {
        question: 'Can I use my own music videos?',
        answer: 'Absolutely. videoDJ.Studio is built for your personal music video library. Upload your own video files and the system automatically detects everything. You can also edit metadata manually or use the Linus AI agent to batch-fix your library with slash commands.',
      },
      {
        question: 'Where is my data stored?',
        answer: 'All data is stored on our self-hosted servers in Manchester, UK. Video files are stored on S3-compatible MinIO storage with server-side encryption. User accounts and metadata are in a self-hosted PostgreSQL database. We do not use AWS, Google Cloud, or Azure for your files. The web app also uses IndexedDB in your browser for local caching, so your videos load instantly after the first play.',
      },
    ],
  },
  {
    name: 'Mixing & Autoplay',
    emoji: '🎛️',
    entries: [
      {
        question: "What's the difference between Autoplay and Automix?",
        answer: 'Autoplay does smart random playback with BPM-matched track selection and smooth 3-second crossfades between tracks. It detects where the music actually ends (skipping silence and credits) and auto-skips broken files. Automix is a full DJ engine — it uses BPM matching (within 8%), Camelot key compatibility, genre coherence, and energy curve management (build/peak/cooldown/wave) to create seamless, professional-sounding transitions with beatmatching.',
      },
      {
        question: 'How does key matching work?',
        answer: 'The app uses the Camelot wheel system, the industry standard for harmonic mixing. Compatible keys — same number, plus or minus one, or switching between the inner (minor) and outer (major) ring — create smooth harmonic transitions. The Automix engine automatically selects tracks with compatible keys to keep your mix sounding musical.',
      },
      {
        question: 'What AI features are included?',
        answer: 'videoDJ.Studio includes three AI-powered systems. Linus is your AI DJ assistant with 30+ slash commands for library management, playlist building, metadata fixing, and mixing suggestions. Ghost is a self-healing background agent that monitors and auto-fixes issues silently. The Automix engine uses BPM, musical key, genre, and energy analysis to create seamless transitions between tracks.',
      },
    ],
  },
  {
    name: 'Streaming',
    emoji: '📡',
    entries: [
      {
        question: 'How do I stream to Twitch?',
        answer: 'Click the STREAM button in the header to open the Stream Dashboard. Select Twitch as your platform, enter your stream key, choose your resolution (720p or 1080p) and bitrate (2500-6000 kbps), then click GO LIVE. The stream pipeline blends both video decks in real-time with a configurable Now Playing overlay. Twitch IRC chat is built in so you can read chat without leaving the DJ interface.',
      },
      {
        question: 'Can I stream to YouTube?',
        answer: 'Yes. In the Stream Dashboard, select YouTube as the platform and enter your stream key and API credentials. YouTube Live Chat polling is also integrated into the unified chat panel alongside Twitch chat.',
      },
    ],
  },
  {
    name: 'Account & Billing',
    emoji: '💳',
    entries: [
      {
        question: 'How does the free trial work?',
        answer: 'Every new user gets a 7-day free trial with full access to Fun User features. No credit card is required to start. Early subscribers who signed up before launch receive 14 days free instead. After the trial ends, you can choose a paid plan or your account will be limited to basic playback.',
      },
      {
        question: 'How do I change my subscription?',
        answer: 'Go to your Profile page inside the app and click Manage Subscription. From there you can upgrade, downgrade, or cancel your plan. Changes take effect at the start of your next billing period.',
      },
      {
        question: "What's included in each tier?",
        answer: 'Free Trial: full Fun User features for 7 days. Fun User: up to 500 tracks, autoplay, AI metadata extraction, cloud backup. DJ User: unlimited tracks, Automix engine, live streaming to Twitch and YouTube, priority support, and desktop app access when available.',
      },
      {
        question: 'How does billing work?',
        answer: 'Subscriptions are billed monthly or annually through Mavi Pay (powered by Stripe). Annual billing saves you approximately 17% compared to monthly. You can cancel anytime from your account settings — cancellation takes effect at the end of your current billing period. We accept all major credit and debit cards.',
      },
    ],
  },
  {
    name: 'Troubleshooting',
    emoji: '🔧',
    entries: [
      {
        question: 'The app crashed during upload',
        answer: 'This is usually a browser memory issue when uploading very large libraries all at once. Try uploading in smaller batches (100-200 files at a time). If the problem persists, try clearing your browser cache and reloading the app. Chrome tends to handle large libraries best.',
      },
      {
        question: 'My tracks show as broken',
        answer: 'Run the /health command in the Linus AI chat to scan for broken files. Common causes include corrupt video files, missing audio tracks, or files that were moved/deleted from cloud storage. Broken files are flagged with a reason and automatically skipped during autoplay so they never interrupt your mix.',
      },
      {
        question: "I can't hear audio",
        answer: 'Check the headphone/audio output selector in the header bar — make sure the correct output device is selected. The app auto-detects wired, Bluetooth, and USB audio devices. If device names show as generic labels, allow microphone permission when prompted to unlock full device names. Also check that the crossfader is not pushed fully to one side while the other deck is playing.',
      },
      {
        question: 'How do I get support?',
        answer: 'You can reach us through the contact form on this website, by emailing support@videodj.studio, or in-app via the Linus AI agent (type /help for available commands). We typically respond within 24 hours. For urgent issues, email is the fastest way to reach us.',
      },
    ],
  },
]

function FAQItem({ question, answer, index, isOpen, onToggle }: {
  question: string
  answer: string
  index: number
  isOpen: boolean
  onToggle: () => void
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.03, duration: 0.5 }}
    >
      <button
        onClick={onToggle}
        className="w-full text-left glass p-5 cursor-pointer group"
        style={{ borderRadius: isOpen ? '16px 16px 0 0' : '16px' }}
      >
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold" style={{ color: isOpen ? 'var(--brand-yellow)' : 'var(--text-primary)' }}>
            {question}
          </h3>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0"
          >
            <ChevronDown size={16} style={{ color: isOpen ? 'var(--brand-yellow)' : 'var(--text-muted)' }} />
          </motion.div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div
              className="px-5 pb-5 text-sm leading-relaxed"
              style={{
                color: 'var(--text-secondary)',
                background: 'linear-gradient(135deg, rgba(22, 22, 42, 0.8) 0%, rgba(18, 18, 30, 0.6) 100%)',
                borderLeft: '1px solid var(--border)',
                borderRight: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
                borderRadius: '0 0 16px 16px',
              }}
            >
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function FAQPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())

  const toggleItem = (key: string) => {
    setOpenItems(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const filteredCategories = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()

    return categories
      .filter(cat => !activeCategory || cat.name === activeCategory)
      .map(cat => ({
        ...cat,
        entries: query
          ? cat.entries.filter(
              e =>
                e.question.toLowerCase().includes(query) ||
                e.answer.toLowerCase().includes(query)
            )
          : cat.entries,
      }))
      .filter(cat => cat.entries.length > 0)
  }, [searchQuery, activeCategory])

  const totalResults = filteredCategories.reduce((sum, cat) => sum + cat.entries.length, 0)

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
      <section className="relative pt-32 pb-12 px-6">
        <div className="hero-glow absolute inset-0" />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-xs font-semibold uppercase tracking-[0.2em] mb-4 block" style={{ color: 'var(--brand-yellow)' }}>
              Knowledge Base
            </span>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6" style={{ color: 'var(--text-primary)' }}>
              Frequently Asked{' '}
              <span style={{ color: 'var(--brand-yellow)', textShadow: '0 0 40px rgba(255,255,0,0.2)' }}>
                Questions
              </span>
            </h1>
            <p className="text-lg max-w-xl mx-auto leading-relaxed mb-10" style={{ color: 'var(--text-secondary)' }}>
              Everything you need to know about videoDJ.Studio.
            </p>

            {/* Search Bar */}
            <div className="max-w-lg mx-auto relative">
              <div
                className="flex items-center gap-3 px-5 py-3.5 rounded-2xl"
                style={{
                  background: 'rgba(22, 22, 42, 0.8)',
                  border: '1px solid var(--border)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <Search size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search questions..."
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: 'var(--text-primary)' }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="flex-shrink-0 p-0.5 rounded-md hover:opacity-80 transition-opacity"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              {searchQuery && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs mt-3"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {totalResults} result{totalResults !== 1 ? 's' : ''} found
                </motion.p>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Category Filter Pills */}
      <div className="max-w-4xl mx-auto px-6 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex flex-wrap justify-center gap-2"
        >
          <button
            onClick={() => setActiveCategory(null)}
            className="px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200"
            style={{
              background: !activeCategory ? 'var(--brand-yellow)' : 'rgba(22, 22, 42, 0.6)',
              color: !activeCategory ? 'var(--bg-primary)' : 'var(--text-secondary)',
              border: `1px solid ${!activeCategory ? 'var(--brand-yellow)' : 'var(--border)'}`,
            }}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(activeCategory === cat.name ? null : cat.name)}
              className="px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200"
              style={{
                background: activeCategory === cat.name ? 'var(--brand-yellow)' : 'rgba(22, 22, 42, 0.6)',
                color: activeCategory === cat.name ? 'var(--bg-primary)' : 'var(--text-secondary)',
                border: `1px solid ${activeCategory === cat.name ? 'var(--brand-yellow)' : 'var(--border)'}`,
              }}
            >
              {cat.emoji} {cat.name}
            </button>
          ))}
        </motion.div>
      </div>

      <div className="section-divider" />

      {/* FAQ Categories */}
      <div className="max-w-3xl mx-auto px-6 py-16">
        {filteredCategories.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <p className="text-base mb-2" style={{ color: 'var(--text-secondary)' }}>
              No results found for &ldquo;{searchQuery}&rdquo;
            </p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Try a different search term or{' '}
              <button
                onClick={() => { setSearchQuery(''); setActiveCategory(null) }}
                className="underline"
                style={{ color: 'var(--brand-yellow)' }}
              >
                clear filters
              </button>
            </p>
          </motion.div>
        ) : (
          <div className="space-y-14">
            {filteredCategories.map(cat => (
              <Section key={cat.name}>
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-xl">{cat.emoji}</span>
                  <h2 className="text-lg font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    {cat.name}
                  </h2>
                  <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: 'rgba(255,255,0,0.08)', color: 'var(--brand-yellow)' }}>
                    {cat.entries.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {cat.entries.map((entry, i) => {
                    const key = `${cat.name}-${i}`
                    return (
                      <FAQItem
                        key={key}
                        question={entry.question}
                        answer={entry.answer}
                        index={i}
                        isOpen={openItems.has(key)}
                        onToggle={() => toggleItem(key)}
                      />
                    )
                  })}
                </div>
              </Section>
            ))}
          </div>
        )}

        {/* CTA */}
        <Section className="mt-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="glass p-12 text-center"
          >
            <h2 className="text-2xl font-bold tracking-tight mb-3" style={{ color: 'var(--text-primary)' }}>
              Still have questions?
            </h2>
            <p className="text-base mb-8" style={{ color: 'var(--text-secondary)' }}>
              We&apos;re here to help. Reach out and we&apos;ll get back to you within 24 hours.
            </p>
            <Link
              href="/contact"
              className="cta-glow inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold transition-transform hover:scale-105"
              style={{ background: 'var(--brand-yellow)', color: 'var(--bg-primary)' }}
            >
              Contact Us
              <ArrowRight size={18} />
            </Link>
          </motion.div>
        </Section>
      </div>

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
