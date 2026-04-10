'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import Link from 'next/link'

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

function LegalSection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <Section className="mb-10">
      <h2 className="text-xl font-semibold mb-4 flex items-baseline gap-3">
        <span className="text-sm font-mono" style={{ color: 'var(--brand-yellow)' }}>{number}</span>
        <span style={{ color: 'var(--text-primary)' }}>{title}</span>
      </h2>
      <div className="text-sm leading-relaxed space-y-3" style={{ color: 'var(--text-secondary)' }}>
        {children}
      </div>
    </Section>
  )
}

export default function TermsPage() {
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
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
              Terms of Service
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Last updated: April 6, 2026
            </p>
          </motion.div>
        </div>
      </section>

      <div className="section-divider" />

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Section className="mb-10">
          <div className="glass p-6 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p>
              These Terms of Service (&quot;Terms&quot;) govern your access to and use of videoDJ.Studio, a product operated by <strong style={{ color: 'var(--text-primary)' }}>flndrn</strong> (&quot;Company&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). By accessing or using our Service, you agree to be bound by these Terms. If you do not agree to these Terms, do not use the Service.
            </p>
          </div>
        </Section>

        <LegalSection number="01" title="Acceptance of Terms">
          <p>By creating an account or using videoDJ.Studio, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. You must be at least 16 years of age to use the Service. If you are using the Service on behalf of an organization, you represent that you have authority to bind that organization to these Terms.</p>
        </LegalSection>

        <LegalSection number="02" title="Account Registration">
          <p>To access certain features, you must create an account. You agree to provide accurate, current, and complete information during registration and to keep your account information updated. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.</p>
          <p>You must notify us immediately at <a href="mailto:support@videodj.studio" style={{ color: 'var(--brand-yellow)' }}>support@videodj.studio</a> if you suspect unauthorized access to your account. We reserve the right to suspend or terminate accounts that violate these Terms.</p>
        </LegalSection>

        <LegalSection number="03" title="Subscriptions & Billing">
          <p>videoDJ.Studio offers subscription plans including a free 7-day trial, Fun User, and DJ User tiers. Paid subscriptions are billed monthly or annually through our payment processor (Mavi Pay, powered by Stripe). Annual billing provides a discount compared to monthly billing.</p>
          <p>Your subscription will automatically renew at the end of each billing period unless you cancel before the renewal date. You may cancel your subscription at any time through your account settings. Cancellation takes effect at the end of your current billing period. No refunds are provided for partial billing periods.</p>
          <p>We reserve the right to change pricing with 30 days advance notice. Price changes will not affect your current billing period.</p>
        </LegalSection>

        <LegalSection number="04" title="Content & Uploads">
          <p>You retain all ownership rights to content you upload to videoDJ.Studio, including music videos, metadata, and playlists. By uploading content, you grant us a limited, non-exclusive license to store, process, and serve that content back to you through the Service.</p>
          <p>You represent and warrant that you have the right to upload and use all content you provide, and that your content does not infringe on any third-party intellectual property rights. You are solely responsible for ensuring you have proper licenses for any copyrighted music videos you upload and stream.</p>
          <p>We do not monitor or review user-uploaded content for copyright compliance. We will respond to valid DMCA takedown notices in accordance with applicable law.</p>
        </LegalSection>

        <LegalSection number="05" title="AI Features">
          <p>videoDJ.Studio includes AI-powered features such as the Linus AI assistant, Ghost self-healing agent, and Automix engine. These features use machine learning models hosted on our own servers (Ollama/Qwen) to process your library metadata and provide recommendations.</p>
          <p>AI-generated suggestions (track selection, BPM detection, key analysis, mixing recommendations) are provided as-is and may not always be accurate. You should verify AI-generated metadata before relying on it for professional performances or broadcasts.</p>
          <p>Your content is processed on our servers and is not shared with third-party AI providers. We do not use your content to train AI models.</p>
        </LegalSection>

        <LegalSection number="06" title="Live Streaming">
          <p>videoDJ.Studio enables live streaming to third-party platforms including Twitch and YouTube via RTMP. You are solely responsible for complying with the terms of service of any platform you stream to, including content policies, music licensing requirements, and community guidelines.</p>
          <p>Stream keys are stored locally in your browser and are never transmitted to our servers. We are not responsible for any actions taken by streaming platforms regarding your content or account.</p>
          <p>You acknowledge that live streaming copyrighted music videos may subject you to copyright claims, DMCA strikes, or account suspension on streaming platforms. We strongly recommend obtaining proper licenses for any content you stream publicly.</p>
        </LegalSection>

        <LegalSection number="07" title="Privacy & Data">
          <p>Your privacy is important to us. Please review our <Link href="/privacy" style={{ color: 'var(--brand-yellow)' }}>Privacy Policy</Link> for details on how we collect, use, and protect your personal information. By using the Service, you consent to the data practices described in our Privacy Policy.</p>
        </LegalSection>

        <LegalSection number="08" title="Termination">
          <p>We may suspend or terminate your access to the Service at any time, with or without cause, and with or without notice. Grounds for termination include but are not limited to: violation of these Terms, non-payment of fees, fraudulent activity, or conduct that we determine is harmful to other users or the Service.</p>
          <p>Upon termination, your right to use the Service ceases immediately. We will make reasonable efforts to allow you to export your data within 30 days of termination. After that period, we may delete your data from our servers.</p>
          <p>You may terminate your account at any time by contacting us at <a href="mailto:support@videodj.studio" style={{ color: 'var(--brand-yellow)' }}>support@videodj.studio</a>.</p>
        </LegalSection>

        <LegalSection number="09" title="Limitation of Liability">
          <p>To the maximum extent permitted by applicable law, videoDJ.Studio and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or goodwill, arising out of or in connection with your use of the Service.</p>
          <p>Our total liability for any claim arising from or related to the Service shall not exceed the amount you paid us in the 12 months preceding the claim. The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either express or implied.</p>
          <p>We do not warrant that the Service will be uninterrupted, error-free, or free of harmful components. We are not responsible for any damage to your computer system or loss of data resulting from your use of the Service.</p>
        </LegalSection>

        <LegalSection number="10" title="Changes to These Terms">
          <p>We reserve the right to modify these Terms at any time. We will notify you of material changes by posting the updated Terms on our website and updating the &quot;Last updated&quot; date. Your continued use of the Service after changes become effective constitutes your acceptance of the revised Terms.</p>
          <p>For material changes that affect your rights or obligations, we will provide at least 30 days notice via email or in-app notification before the changes take effect.</p>
        </LegalSection>

        <Section className="mt-16">
          <div className="glass p-6 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p className="mb-2"><strong style={{ color: 'var(--text-primary)' }}>Contact</strong></p>
            <p>
              If you have questions about these Terms, contact us at{' '}
              <a href="mailto:support@videodj.studio" style={{ color: 'var(--brand-yellow)' }}>support@videodj.studio</a>.
            </p>
            <p className="mt-2">
              videoDJ.Studio by flndrn
            </p>
          </div>
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
            <Link href="/terms" className="text-xs" style={{ color: 'var(--brand-yellow)' }}>Terms</Link>
            <Link href="/privacy" className="text-xs" style={{ color: 'var(--text-muted)' }}>Privacy</Link>
            <Link href="/contact" className="text-xs" style={{ color: 'var(--text-muted)' }}>Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
