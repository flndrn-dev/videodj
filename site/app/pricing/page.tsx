'use client'

import { useState, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import {
  Disc3, Headphones, Crown, Check, X, ArrowRight, Sparkles, Zap,
  Music, Sliders, Repeat, Gauge, Bot, ListMusic, Radio, Video,
  Clock, MessageCircle,
} from 'lucide-react'
import Link from 'next/link'

type BillingCycle = 'monthly' | 'annual'

const tiers = [
  {
    id: 'trial',
    name: '7-Day Trial',
    tagline: 'Try everything free',
    icon: Disc3,
    monthlyPrice: 0,
    annualPrice: 0,
    accent: '#9898b8',
    accentDim: 'rgba(152,152,184,0.1)',
    accentBorder: 'rgba(152,152,184,0.15)',
    cta: 'Start Free Trial',
    ctaStyle: 'outline' as const,
    highlight: false,
    badge: null as string | null,
    features: [
      { text: 'Full Fun User features for 7 days', included: true, icon: Clock },
      { text: '14 days free for early subscribers', included: true, icon: Sparkles },
      { text: 'No credit card required', included: true, icon: Check },
      { text: 'Unlimited track uploads', included: true, icon: Music },
      { text: 'Auto crossfade + BPM detection', included: true, icon: Gauge },
      { text: 'Effects: filter + delay', included: true, icon: Sliders },
      { text: '2 hotcue slots', included: true, icon: Zap },
      { text: 'Linus AI: 5 commands/day', included: true, icon: Bot },
      { text: 'Automix engine', included: false, icon: Repeat },
      { text: 'Live streaming', included: false, icon: Radio },
      { text: 'Mix recording', included: false, icon: Video },
    ],
  },
  {
    id: 'fun',
    name: 'Fun User',
    tagline: 'For casual music video lovers',
    icon: Headphones,
    monthlyPrice: 9.99,
    annualPrice: 99.99,
    accent: '#ffff00',
    accentDim: 'rgba(255,255,0,0.1)',
    accentBorder: 'rgba(255,255,0,0.2)',
    cta: 'Get Fun User',
    ctaStyle: 'solid' as const,
    highlight: true,
    badge: 'Most Popular',
    features: [
      { text: 'Unlimited track uploads', included: true, icon: Music },
      { text: 'Dual decks + auto crossfade', included: true, icon: Disc3 },
      { text: 'Auto BPM & key detection', included: true, icon: Gauge },
      { text: '3-band EQ with kill switches', included: true, icon: Sliders },
      { text: 'Effects: filter + delay', included: true, icon: Sliders },
      { text: '2 hotcue slots', included: true, icon: Zap },
      { text: 'Autoplay mode', included: true, icon: Repeat },
      { text: 'Linus AI: 5 commands/day', included: true, icon: Bot },
      { text: '5 playlists', included: true, icon: ListMusic },
      { text: 'Email support', included: true, icon: MessageCircle },
      { text: 'Automix engine', included: false, icon: Repeat },
      { text: 'Live streaming', included: false, icon: Radio },
      { text: 'Mix recording', included: false, icon: Video },
    ],
  },
  {
    id: 'dj',
    name: 'DJ User',
    tagline: 'The full professional toolkit',
    icon: Crown,
    monthlyPrice: 19.99,
    annualPrice: 199.99,
    accent: '#a78bfa',
    accentDim: 'rgba(167,139,250,0.1)',
    accentBorder: 'rgba(167,139,250,0.2)',
    cta: 'Go Pro',
    ctaStyle: 'solid' as const,
    highlight: false,
    badge: null,
    features: [
      { text: 'Everything in Fun User', included: true, icon: Check },
      { text: 'Full effects rack (6 effects)', included: true, icon: Sliders },
      { text: '4 hotcue slots (A-D) + loops', included: true, icon: Zap },
      { text: 'Automix with energy curves', included: true, icon: Repeat },
      { text: 'Linus AI: unlimited commands', included: true, icon: Bot },
      { text: 'Unlimited playlists', included: true, icon: ListMusic },
      { text: 'Live stream to Twitch + YouTube', included: true, icon: Radio },
      { text: 'Mix recording (audio + video)', included: true, icon: Video },
      { text: 'Set history with tracklists', included: true, icon: Clock },
      { text: 'AI beatmatching + tempo sync', included: true, icon: Gauge },
      { text: 'Priority support', included: true, icon: MessageCircle },
    ],
  },
]

function PricingCard({ tier, billing, delay }: { tier: typeof tiers[0]; billing: BillingCycle; delay: number }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-40px' })
  const price = billing === 'monthly' ? tier.monthlyPrice : tier.annualPrice
  const perMonth = billing === 'annual' && tier.annualPrice > 0
    ? (tier.annualPrice / 12).toFixed(2)
    : null
  const Icon = tier.icon

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-3xl p-px h-full"
      style={{
        background: tier.highlight
          ? `linear-gradient(135deg, ${tier.accentBorder}, transparent 50%, ${tier.accentBorder})`
          : 'transparent',
      }}
    >
      {/* Badge */}
      {tier.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <span
            className="px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
            style={{ background: tier.accent, color: '#0a0a14' }}
          >
            {tier.badge}
          </span>
        </div>
      )}

      <div
        className="rounded-3xl p-8 h-full flex flex-col relative overflow-hidden"
        style={{
          background: tier.highlight
            ? 'linear-gradient(135deg, rgba(20,20,31,0.98), rgba(16,16,28,0.95))'
            : 'linear-gradient(135deg, rgba(22,22,42,0.6), rgba(18,18,30,0.4))',
          border: tier.highlight ? 'none' : `1px solid ${tier.accentBorder}`,
        }}
      >
        {/* Ambient glow for highlighted */}
        {tier.highlight && (
          <div className="absolute inset-0 pointer-events-none" style={{
            background: `radial-gradient(ellipse 60% 40% at 50% 0%, ${tier.accentDim}, transparent 70%)`,
          }} />
        )}

        {/* Header */}
        <div className="relative mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: tier.accentDim, border: `1px solid ${tier.accentBorder}` }}
            >
              <Icon size={20} style={{ color: tier.accent }} />
            </div>
            <div>
              <h3 className="text-lg font-bold" style={{ color: tier.accent }}>{tier.name}</h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{tier.tagline}</p>
            </div>
          </div>
        </div>

        {/* Price */}
        <div className="relative mb-8">
          <div className="flex items-baseline gap-1">
            {tier.monthlyPrice === 0 ? (
              <span className="text-4xl font-bold" style={{ color: 'var(--text-primary)' }}>Free</span>
            ) : (
              <>
                <span className="text-lg" style={{ color: 'var(--text-muted)' }}>€</span>
                <span className="text-4xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  {billing === 'monthly' ? price.toFixed(2) : perMonth}
                </span>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>/mo</span>
              </>
            )}
          </div>
          {billing === 'annual' && tier.annualPrice > 0 && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              €{tier.annualPrice.toFixed(2)}/year — <span style={{ color: '#22c55e' }}>save 17%</span>
            </p>
          )}
          {tier.monthlyPrice === 0 && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              7 days · no credit card needed
            </p>
          )}
        </div>

        {/* CTA */}
        <Link
          href={tier.monthlyPrice === 0 ? '/login' : '/#subscribe'}
          className="block w-full py-3.5 rounded-2xl text-sm font-semibold text-center transition-all duration-200 mb-8"
          style={tier.ctaStyle === 'solid' ? {
            background: tier.accent,
            color: '#0a0a14',
            boxShadow: tier.highlight ? `0 0 30px ${tier.accentDim}` : 'none',
          } : {
            background: 'transparent',
            color: tier.accent,
            border: `1px solid ${tier.accentBorder}`,
          }}
        >
          {tier.cta} <ArrowRight size={14} className="inline ml-1" />
        </Link>

        {/* Features */}
        <div className="flex-1 space-y-3">
          {tier.features.map((feat) => {
            const FeatIcon = feat.icon
            return (
              <div key={feat.text} className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {feat.included ? (
                    <Check size={14} style={{ color: '#22c55e' }} />
                  ) : (
                    <X size={14} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                  )}
                </div>
                <span
                  className="text-sm leading-relaxed"
                  style={{ color: feat.included ? 'var(--text-secondary)' : 'var(--text-muted)', opacity: feat.included ? 1 : 0.5 }}
                >
                  {feat.text}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

export default function PricingPage() {
  const [billing, setBilling] = useState<BillingCycle>('monthly')

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Nav */}
      <nav className="px-6 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-sm font-bold" style={{ color: '#ffff00' }}>videoDJ.Studio</Link>
          <div className="flex items-center gap-6">
            <Link href="/#features" className="text-xs" style={{ color: 'var(--text-secondary)' }}>Features</Link>
            <Link href="/pricing" className="text-xs font-medium" style={{ color: '#ffff00' }}>Pricing</Link>
            <Link href="/login" className="text-xs px-3 py-1.5 rounded-lg"
              style={{ background: '#ffff00', color: '#0a0a14' }}>Sign In</Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="pt-16 pb-8 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="text-xs font-semibold uppercase tracking-[0.2em] mb-4 block" style={{ color: '#ffff00' }}>
            Pricing
          </span>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
            Start mixing for free
          </h1>
          <p className="text-lg max-w-lg mx-auto mb-10" style={{ color: 'var(--text-secondary)' }}>
            7-day free trial, no credit card. Upgrade when you're ready.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-1 p-1 rounded-2xl" style={{ background: 'rgba(22,22,42,0.6)', border: '1px solid rgba(42,42,62,0.5)' }}>
            <button
              onClick={() => setBilling('monthly')}
              className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: billing === 'monthly' ? 'rgba(255,255,0,0.12)' : 'transparent',
                color: billing === 'monthly' ? '#ffff00' : 'var(--text-muted)',
              }}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('annual')}
              className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
              style={{
                background: billing === 'annual' ? 'rgba(255,255,0,0.12)' : 'transparent',
                color: billing === 'annual' ? '#ffff00' : 'var(--text-muted)',
              }}
            >
              Annual
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                -17%
              </span>
            </button>
          </div>
        </motion.div>
      </section>

      {/* Pricing cards */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {tiers.map((tier, i) => (
            <PricingCard key={tier.id} tier={tier} billing={billing} delay={i * 0.1} />
          ))}
        </div>
      </section>

      {/* Early access banner */}
      <section className="px-6 pb-24">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-3xl p-8 text-center relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,0,0.06), rgba(255,255,0,0.02))',
              border: '1px solid rgba(255,255,0,0.12)',
            }}
          >
            <Sparkles size={24} className="mx-auto mb-4" style={{ color: '#ffff00' }} />
            <h3 className="text-xl font-bold mb-2" style={{ color: '#ffff00' }}>Early Subscriber Perk</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              Sign up now and get <strong style={{ color: 'var(--text-primary)' }}>14 days free</strong> instead of 7 when we launch. No credit card required.
            </p>
            <Link
              href="/#subscribe"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl text-sm font-semibold"
              style={{ background: '#ffff00', color: '#0a0a14', boxShadow: '0 0 20px rgba(255,255,0,0.1)' }}
            >
              Get Early Access <ArrowRight size={16} />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8" style={{ borderTop: '1px solid rgba(42,42,62,0.5)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            &copy; {new Date().getFullYear()} videoDJ.Studio by{' '}
            <span style={{ color: '#fbe731' }}>flndrn</span>
            <img src="/flndrn-icon.svg" alt="flndrn" className="size-6 inline-block" />
            . All rights reserved.
          </p>
          <Link href="/" className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Back to home
          </Link>
        </div>
      </footer>
    </div>
  )
}
