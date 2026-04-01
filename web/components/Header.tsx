'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { SettingsIcon } from '@/components/ui/settings'
import { Flag } from 'lucide-react'

interface HeaderProps {
  languageFilter: string | null
  onOpenSetup: () => void
  onOpenStream?: () => void
  isLive?: boolean
}

export function Header({ languageFilter, onOpenSetup, onOpenStream, isLive }: HeaderProps) {
  return (
    <motion.header
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 30 }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', background: '#0d0d16', borderBottom: '1px solid #2a2a3e',
        flexShrink: 0, height: 54, gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <motion.div whileHover={{ scale: 1.12, rotate: 10 }} whileTap={{ scale: 0.95 }} transition={{ type: 'spring', stiffness: 320 }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="videoDJ.Studio logo" width={26} height={30} />
        </motion.div>
        <div>
          <div style={{ fontWeight: 900, fontSize: 17, letterSpacing: '-0.5px', lineHeight: 1 }}>
            video<span style={{ color: '#ffff00' }}>DJ</span>.Studio
          </div>
          <div style={{ fontSize: 9, color: '#555570', fontFamily: 'var(--font-mono)', marginTop: 1, letterSpacing: 1 }}>v1.0.0</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AnimatePresence>
          {languageFilter === 'nl' && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 999,
                background: 'rgba(255,255,0,0.06)', border: '1px solid rgba(255,255,0,0.25)',
                color: '#ffff00', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
              }}
            >
              <Flag size={10} />
              NL Filter Active
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <motion.button
          onClick={onOpenStream}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 10,
            color: isLive ? '#ef4444' : '#555570',
            fontFamily: 'var(--font-mono)', letterSpacing: 1,
            background: isLive ? 'rgba(239,68,68,0.1)' : 'transparent',
            border: isLive ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent',
            borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
          }}
        >
          <motion.div style={{ width: 6, height: 6, borderRadius: '50%', background: isLive ? '#ef4444' : '#555570' }}
            animate={isLive ? { opacity: [1, 0.25, 1] } : {}} transition={{ duration: 1, repeat: Infinity }}/>
          {isLive ? 'LIVE' : 'STREAM'}
        </motion.button>
        <motion.button onClick={onOpenSetup} whileHover={{ scale: 1.08, rotate: 22 }} whileTap={{ scale: 0.92 }}
          title="Open settings / video library"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#555570', padding: 4, display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#ffff00')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#555570')}>
          <SettingsIcon size={17} />
        </motion.button>
      </div>
    </motion.header>
  )
}
