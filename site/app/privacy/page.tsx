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

export default function PrivacyPage() {
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
              Privacy Policy
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
              At <strong style={{ color: 'var(--text-primary)' }}>videoDJ.Studio</strong> (operated by flndrn), we take your privacy seriously. This Privacy Policy explains what data we collect, how we use it, and what rights you have. We are committed to transparency and to protecting your personal information in accordance with the General Data Protection Regulation (GDPR) and applicable data protection laws.
            </p>
          </div>
        </Section>

        <LegalSection number="01" title="Data We Collect">
          <p><strong style={{ color: 'var(--text-primary)' }}>Account Information:</strong> When you create an account, we collect your email address, display name, and password (hashed, never stored in plaintext). If you sign up via social login, we receive your name and email from the identity provider.</p>
          <p><strong style={{ color: 'var(--text-primary)' }}>Uploaded Content:</strong> Music video files you upload, along with extracted metadata (BPM, musical key, artist, album, genre, language, duration, thumbnails). Video files are stored on our S3-compatible object storage (MinIO).</p>
          <p><strong style={{ color: 'var(--text-primary)' }}>Usage Data:</strong> We collect anonymized usage analytics including feature usage, session duration, tracks played, and error logs. This data is used solely to improve the Service and is not linked to your identity.</p>
          <p><strong style={{ color: 'var(--text-primary)' }}>Payment Information:</strong> Payment details are processed directly by our payment processor (Stripe, via Mavi Pay). We do not store your credit card number, CVC, or full card details on our servers. We retain only a payment reference ID and billing history.</p>
          <p><strong style={{ color: 'var(--text-primary)' }}>Communications:</strong> When you contact us via email or the contact form, we collect your name, email, and message content to respond to your inquiry.</p>
        </LegalSection>

        <LegalSection number="02" title="How We Use Your Data">
          <p>We use your data for the following purposes:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Providing and maintaining the Service, including video storage, playback, and mixing features</li>
            <li>Processing your subscription payments and managing your account</li>
            <li>AI-powered features: BPM detection, key analysis, track recommendations, and automated mixing</li>
            <li>Improving the Service based on anonymized usage patterns</li>
            <li>Communicating with you about your account, billing, and important updates</li>
            <li>Preventing fraud, abuse, and ensuring security of the platform</li>
          </ul>
          <p>We will never sell your personal data to third parties. We do not use your uploaded content for advertising or marketing purposes.</p>
        </LegalSection>

        <LegalSection number="03" title="Storage & Security">
          <p><strong style={{ color: 'var(--text-primary)' }}>Self-Hosted Infrastructure:</strong> All data is stored on our self-hosted servers located in Manchester, United Kingdom. We do not use third-party cloud providers (AWS, Google Cloud, Azure) for storing your files or personal data.</p>
          <p><strong style={{ color: 'var(--text-primary)' }}>Database:</strong> User accounts and metadata are stored in a self-hosted PostgreSQL database with encryption at rest.</p>
          <p><strong style={{ color: 'var(--text-primary)' }}>File Storage:</strong> Uploaded video files and generated thumbnails are stored on our self-hosted MinIO S3-compatible object storage with server-side encryption.</p>
          <p><strong style={{ color: 'var(--text-primary)' }}>Client-Side Storage:</strong> The web application uses IndexedDB in your browser for local caching of video data and metadata. This data never leaves your device unless you explicitly sync it to our servers.</p>
          <p><strong style={{ color: 'var(--text-primary)' }}>Security Measures:</strong> All data in transit is encrypted via TLS 1.3. Access to servers is restricted via SSH key authentication and firewall rules. We perform regular security audits and maintain automated monitoring via our Ghost agent.</p>
        </LegalSection>

        <LegalSection number="04" title="AI Processing">
          <p><strong style={{ color: 'var(--text-primary)' }}>On-Premise AI:</strong> All AI processing is performed on our own servers using Ollama with Qwen models. Your music metadata, library data, and AI interactions are processed entirely within our infrastructure.</p>
          <p><strong style={{ color: 'var(--text-primary)' }}>No Third-Party AI:</strong> We do not send your data to OpenAI, Anthropic, Google, or any other third-party AI provider. The Linus AI agent and Ghost self-healing agent both run on our self-hosted hardware.</p>
          <p><strong style={{ color: 'var(--text-primary)' }}>No Training on Your Data:</strong> We do not use your uploaded content, metadata, or interactions to train AI models. Your data is used solely to provide you with AI-powered features within the Service.</p>
        </LegalSection>

        <LegalSection number="05" title="Cookies">
          <p>We use the following cookies:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong style={{ color: 'var(--text-primary)' }}>Essential cookies:</strong> Session authentication, CSRF protection. These are required for the Service to function and cannot be disabled.</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>Preference cookies:</strong> UI settings, theme preferences, last used deck configuration. Stored locally.</li>
          </ul>
          <p>We do not use advertising cookies, tracking pixels, or third-party analytics cookies. We do not participate in any ad networks or cross-site tracking.</p>
        </LegalSection>

        <LegalSection number="06" title="Third-Party Services">
          <p>We use a limited number of third-party services:</p>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li><strong style={{ color: 'var(--text-primary)' }}>Resend</strong> — Email delivery for account verification, password resets, and important notifications. Resend processes your email address to deliver messages. <a href="https://resend.com/privacy" style={{ color: 'var(--brand-yellow)' }}>Resend Privacy Policy</a></li>
            <li><strong style={{ color: 'var(--text-primary)' }}>Stripe (via Mavi Pay)</strong> — Payment processing for subscriptions. Stripe processes your payment information directly. We never see or store your full card details. <a href="https://stripe.com/privacy" style={{ color: 'var(--brand-yellow)' }}>Stripe Privacy Policy</a></li>
          </ul>
          <p>If you use the live streaming feature, your stream data is sent directly from your browser to the streaming platform (Twitch/YouTube) via RTMP. This data does not pass through our servers. Your stream key is stored only in your browser&apos;s localStorage.</p>
        </LegalSection>

        <LegalSection number="07" title="Your Rights (GDPR)">
          <p>Under the GDPR, you have the following rights regarding your personal data:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong style={{ color: 'var(--text-primary)' }}>Right of Access:</strong> You can request a copy of all personal data we hold about you.</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>Right to Rectification:</strong> You can request correction of inaccurate or incomplete data.</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>Right to Erasure:</strong> You can request deletion of your personal data (&quot;right to be forgotten&quot;).</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>Right to Restrict Processing:</strong> You can request that we limit how we process your data.</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>Right to Data Portability:</strong> You can request your data in a structured, machine-readable format.</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>Right to Object:</strong> You can object to processing based on legitimate interests.</li>
          </ul>
          <p>To exercise any of these rights, contact us at <a href="mailto:support@videodj.studio" style={{ color: 'var(--brand-yellow)' }}>support@videodj.studio</a>. We will respond within 30 days. You also have the right to lodge a complaint with a supervisory authority (ICO in the UK).</p>
        </LegalSection>

        <LegalSection number="08" title="Data Retention">
          <p><strong style={{ color: 'var(--text-primary)' }}>Active Accounts:</strong> We retain your data for as long as your account is active. Uploaded video files and metadata are kept as long as you maintain an active subscription.</p>
          <p><strong style={{ color: 'var(--text-primary)' }}>Cancelled Accounts:</strong> After subscription cancellation, we retain your data for 90 days in case you wish to reactivate. After 90 days, uploaded video files are permanently deleted from our storage. Account metadata (email, name) is retained for an additional 12 months for legal and billing purposes.</p>
          <p><strong style={{ color: 'var(--text-primary)' }}>Account Deletion:</strong> Upon explicit account deletion request, we will delete all your personal data and uploaded content within 30 days, except where retention is required by law (e.g., billing records for tax purposes, retained for up to 7 years).</p>
          <p><strong style={{ color: 'var(--text-primary)' }}>Backups:</strong> Encrypted backups may retain your data for up to 30 days after deletion from primary storage.</p>
        </LegalSection>

        <LegalSection number="09" title="Children&apos;s Privacy">
          <p>videoDJ.Studio is not intended for users under the age of 16. We do not knowingly collect personal data from children under 16. If we become aware that we have collected data from a child under 16, we will take steps to delete that information promptly. If you believe a child has provided us with personal data, please contact us at <a href="mailto:support@videodj.studio" style={{ color: 'var(--brand-yellow)' }}>support@videodj.studio</a>.</p>
        </LegalSection>

        <LegalSection number="10" title="Changes to This Policy">
          <p>We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on our website and, where appropriate, by sending you an email notification. We encourage you to review this policy periodically.</p>
        </LegalSection>

        <Section className="mt-16">
          <div className="glass p-6 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p className="mb-2"><strong style={{ color: 'var(--text-primary)' }}>Contact</strong></p>
            <p>
              For privacy-related inquiries, data requests, or concerns, contact us at{' '}
              <a href="mailto:support@videodj.studio" style={{ color: 'var(--brand-yellow)' }}>support@videodj.studio</a>.
            </p>
            <p className="mt-2">
              videoDJ.Studio by flndrn<br />
              Data Controller under GDPR
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
            <Link href="/terms" className="text-xs" style={{ color: 'var(--text-muted)' }}>Terms</Link>
            <Link href="/privacy" className="text-xs" style={{ color: 'var(--brand-yellow)' }}>Privacy</Link>
            <Link href="/contact" className="text-xs" style={{ color: 'var(--text-muted)' }}>Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
