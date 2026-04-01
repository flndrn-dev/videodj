'use client'
import { motion } from 'framer-motion'
import { XIcon, type XIconHandle } from '@/components/ui/x'
import { useRef } from 'react'
import { LINUS_COMMANDS, CATEGORY_LABELS } from '@/app/lib/linusCommands'

interface CommandReferenceProps {
  onClose: () => void
  onSelectCommand: (cmd: string) => void
}

export function CommandReference({ onClose, onSelectCommand }: CommandReferenceProps) {
  const closeRef = useRef<XIconHandle>(null)
  const categories = ['library', 'playlist', 'mixing', 'streaming', 'help'] as const

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 400,
      }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        style={{
          background: '#12121e', border: '1px solid #2a2a3e', borderRadius: 16,
          width: 520, maxWidth: '95vw', maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '16px 20px', borderBottom: '1px solid #1a1a2e', flexShrink: 0,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/linus.svg" alt="Linus" width={24} height={24} style={{ borderRadius: 4 }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#e0e0f0' }}>Linus Commands</span>
            <span style={{ fontSize: 9, color: '#555570', marginLeft: 8, fontFamily: 'var(--font-mono)' }}>
              Type / in chat or click a command
            </span>
          </div>
          <motion.button
            onClick={onClose}
            onMouseEnter={() => closeRef.current?.startAnimation()}
            onMouseLeave={() => closeRef.current?.stopAnimation()}
            whileTap={{ scale: 0.9 }}
            style={{
              width: 24, height: 24, borderRadius: '50%',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#555570', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.2)'; e.currentTarget.style.color = '#ef4444' }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#555570' }}
          >
            <XIcon ref={closeRef} size={12} />
          </motion.button>
        </div>

        {/* Command list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
          {categories.map((cat) => {
            const cmds = LINUS_COMMANDS.filter(c => c.category === cat)
            if (cmds.length === 0) return null
            return (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 2, color: '#555570',
                  textTransform: 'uppercase', marginBottom: 8, paddingLeft: 4,
                }}>
                  {CATEGORY_LABELS[cat]}
                </div>
                {cmds.map((cmd) => (
                  <motion.button
                    key={cmd.command}
                    onClick={() => {
                      onSelectCommand(cmd.command + (cmd.args ? ' ' : ''))
                      onClose()
                    }}
                    whileHover={{ backgroundColor: 'rgba(255,255,0,0.04)' }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'baseline', gap: 8,
                      padding: '6px 8px', borderRadius: 6,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{
                      fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700,
                      color: '#ffff00', minWidth: 130, flexShrink: 0,
                    }}>
                      {cmd.command}
                      {cmd.args && (
                        <span style={{ color: '#555570', fontWeight: 400 }}> {cmd.args}</span>
                      )}
                    </span>
                    <span style={{ fontSize: 11, color: '#888', lineHeight: 1.4 }}>
                      {cmd.description}
                    </span>
                  </motion.button>
                ))}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 20px', borderTop: '1px solid #1a1a2e', flexShrink: 0,
          fontSize: 10, color: '#555570', textAlign: 'center',
        }}>
          You can also ask Linus anything in natural language — these are shortcuts.
        </div>
      </motion.div>
    </motion.div>
  )
}
