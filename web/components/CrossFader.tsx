'use client'
import { useCallback, useRef } from 'react'
import { motion } from 'framer-motion'

interface CrossFaderProps {
  value: number      // 0 (full A) … 100 (full B)
  onChange: (v: number) => void
}

const SNAP_RANGE = 5

export function CrossFader({ value, onChange }: CrossFaderProps) {
  const volA = value <= 50 ? 100 : Math.round(100 - (value - 50) * 2)
  const volB = value >= 50 ? 100 : Math.round(value * 2)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const getValueFromX = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return value
    const rect = track.getBoundingClientRect()
    const x = clientX - rect.left
    const ratio = Math.max(0, Math.min(1, x / rect.width))
    return Math.round(ratio * 100)
  }, [value])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    onChange(getValueFromX(e.clientX))
  }, [onChange, getValueFromX])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    onChange(getValueFromX(e.clientX))
  }, [onChange, getValueFromX])

  const handlePointerUp = useCallback(() => {
    dragging.current = false
    // Snap to center
    if (Math.abs(value - 50) <= SNAP_RANGE) {
      onChange(50)
    }
  }, [value, onChange])

  // Colors: left side = blue (Deck A), right side = red (Deck B)
  // The filled portion follows the thumb: blue from left to thumb, red from thumb to right
  // When at 50: no color on either side (both decks active)
  const thumbPercent = value

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.22, type: 'spring', stiffness: 280, damping: 28 }}
      style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
    >
      <span style={{
        fontSize: 7, fontFamily: 'var(--font-mono)', color: '#333348',
        letterSpacing: 2, textTransform: 'uppercase',
      }}>
        Crossfader
      </span>

      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#45b1e8', fontFamily: 'var(--font-mono)' }}>A</span>
          <span style={{ fontSize: 8, color: volA === 100 ? '#45b1e8' : '#555570', fontFamily: 'var(--font-mono)' }}>{volA}%</span>
        </div>
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#333348' }}>
          {Math.round(value)}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>B</span>
          <span style={{ fontSize: 8, color: volB === 100 ? '#ef4444' : '#555570', fontFamily: 'var(--font-mono)' }}>{volB}%</span>
        </div>
      </div>

      {/* Custom crossfader track + thumb */}
      <div style={{
        width: '100%', display: 'flex', alignItems: 'center',
        padding: '8px 0', cursor: 'pointer', userSelect: 'none',
      }}>
        {/* Left arrow */}
        <span style={{ fontSize: 12, color: '#333348', marginRight: 6, lineHeight: 1 }}>&lt;</span>

        {/* Track */}
        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            flex: 1, height: 3, borderRadius: 2,
            position: 'relative',
            background: '#1a1a2e',
          }}
        >
          {/* Blue fill — from center to thumb, only when slider is left of center */}
          {value < 50 && (
            <div style={{
              position: 'absolute', left: `${thumbPercent}%`, top: 0, height: '100%',
              width: `${50 - thumbPercent}%`,
              background: '#45b1e8',
              borderRadius: 2,
            }} />
          )}

          {/* Red fill — from center to thumb, only when slider is right of center */}
          {value > 50 && (
            <div style={{
              position: 'absolute', left: '50%', top: 0, height: '100%',
              width: `${thumbPercent - 50}%`,
              background: '#ef4444',
              borderRadius: 2,
            }} />
          )}

          {/* Thumb */}
          <div style={{
            position: 'absolute',
            left: `${thumbPercent}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 14,
            height: 22,
            borderRadius: 3,
            background: '#2a2a3e',
            border: '1px solid #3a3a50',
            boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
            cursor: 'grab',
            zIndex: 2,
          }} />
        </div>

        {/* Right arrow */}
        <span style={{ fontSize: 12, color: '#333348', marginLeft: 6, lineHeight: 1 }}>&gt;</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
        <span style={{ fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)' }}>DECK A</span>
        <span style={{ fontSize: 8, color: '#333348', fontFamily: 'var(--font-mono)' }}>DECK B</span>
      </div>
    </motion.div>
  )
}
