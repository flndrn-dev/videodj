'use client'

import { useState, useRef } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { ChevronDown, ArrowRight } from 'lucide-react'

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

const faqs = [
  {
    question: 'What is videoDJ.Studio?',
    answer: 'videoDJ.Studio is an AI-powered video DJ application for mixing music videos. It features dual video decks with real-time waveform visualization, AI-powered beatmatching, smart playlists, and live streaming to Twitch and YouTube. Think of it as a professional DJ setup, but for music videos — all running in your browser.',
  },
  {
    question: 'How does the free trial work?',
    answer: 'Every new user gets a 7-day free trial with full access to Fun User features. No credit card is required to start. Early subscribers who signed up before launch receive 14 days free instead. After the trial ends, you can choose a paid plan or your account will be limited to basic playback.',
  },
  {
    question: 'What AI features are included?',
    answer: 'videoDJ.Studio includes three AI-powered systems. Linus is your AI DJ assistant with 30+ slash commands for library management, playlist building, metadata fixing, and mixing suggestions. Ghost is a self-healing background agent that monitors, detects, and auto-fixes issues silently. The Automix engine uses BPM, musical key (Camelot), genre, and energy analysis to create seamless transitions between tracks.',
  },
  {
    question: 'Can I stream to Twitch and YouTube?',
    answer: 'Yes, the DJ User plan includes live streaming via RTMP to both Twitch and YouTube. The stream pipeline uses a canvas compositor that blends both video decks in real-time, with a configurable Now Playing overlay showing track info. Twitch IRC chat integration is built-in so you can read chat without leaving the DJ interface. Stream at 720p or 1080p with bitrates from 2500 to 6000 kbps.',
  },
  {
    question: 'What video formats are supported?',
    answer: 'videoDJ.Studio supports MP4, WebM, and MKV video files. When you upload a video, the application automatically extracts the audio track for BPM detection, musical key analysis, and waveform generation. Metadata (artist, album, genre, language) is extracted from file tags when available, with AI-powered fallback analysis.',
  },
  {
    question: 'Where is my data stored?',
    answer: 'All data is stored on our self-hosted servers in Manchester, UK. Video files are stored on our S3-compatible MinIO storage with server-side encryption. User accounts and metadata are in a self-hosted PostgreSQL database. We do not use AWS, Google Cloud, or Azure for your files. The web app also uses IndexedDB in your browser for local caching, so your videos load instantly after the first play.',
  },
  {
    question: 'How does billing work?',
    answer: 'Subscriptions are billed monthly or annually through Mavi Pay (powered by Stripe). Annual billing saves you approximately 17% compared to monthly. You can cancel anytime from your account settings — cancellation takes effect at the end of your current billing period. No refunds for partial periods. We accept all major credit and debit cards.',
  },
  {
    question: 'Can I use my own music videos?',
    answer: 'Absolutely. videoDJ.Studio is built for your personal music video library. Upload your own video files and the system automatically detects BPM, musical key (in Camelot notation), genre, artist, album, language, and generates thumbnails. You can also edit metadata manually or use Linus AI to batch-fix your library.',
  },
  {
    question: 'Is there a desktop app?',
    answer: 'Desktop apps for macOS, Windows, and Linux are coming soon. They will wrap the same web codebase with native file system access for better performance with large local libraries. In the meantime, the web app at app.videodj.studio is fully featured and works in Chrome, Firefox, Safari, and Edge.',
  },
  {
    question: 'How do I get support?',
    answer: 'You can reach us through the contact form on this website, by emailing support@videodj.studio, or in-app via the Linus AI agent (type /help for available commands). We typically respond to support inquiries within 24 hours. For urgent issues, email is the fastest way to reach us.',
  },
]

function FAQItem({ question, answer, index }: { question: string; answer: string; index: number }) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.04, duration: 0.5 }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left glass p-6 cursor-pointer group"
        style={{ borderRadius: isOpen ? '20px 20px 0 0' : '20px' }}
      >
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-base font-semibold" style={{ color: isOpen ? 'var(--brand-yellow)' : 'var(--text-primary)' }}>
            {question}
          </h3>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0"
          >
            <ChevronDown size={18} style={{ color: isOpen ? 'var(--brand-yellow)' : 'var(--text-muted)' }} />
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
              className="px-6 pb-6 text-sm leading-relaxed"
              style={{
                color: 'var(--text-secondary)',
                background: 'linear-gradient(135deg, rgba(22, 22, 42, 0.8) 0%, rgba(18, 18, 30, 0.6) 100%)',
                borderLeft: '1px solid var(--border)',
                borderRight: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
                borderRadius: '0 0 20px 20px',
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
      <section className="relative pt-32 pb-16 px-6">
        <div className="hero-glow absolute inset-0" />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-xs font-semibold uppercase tracking-[0.2em] mb-4 block" style={{ color: 'var(--brand-yellow)' }}>
              FAQ
            </span>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6" style={{ color: 'var(--text-primary)' }}>
              Frequently Asked{' '}
              <span style={{ color: 'var(--brand-yellow)', textShadow: '0 0 40px rgba(255,255,0,0.2)' }}>
                Questions
              </span>
            </h1>
            <p className="text-lg max-w-xl mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Everything you need to know about videoDJ.Studio.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="section-divider" />

      {/* FAQ List */}
      <div className="max-w-3xl mx-auto px-6 py-20">
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <FAQItem key={i} question={faq.question} answer={faq.answer} index={i} />
          ))}
        </div>

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
