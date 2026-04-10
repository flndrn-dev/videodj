'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'

interface AnimatedCounterProps {
  value: number
  duration?: number
  prefix?: string
  suffix?: string
  decimals?: number
}

export function AnimatedCounter({
  value,
  duration = 1.2,
  prefix = '',
  suffix = '',
  decimals = 0,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true })
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    if (!isInView) return

    const start = 0
    const end = value
    const startTime = performance.now()
    const durationMs = duration * 1000

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / durationMs, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = start + (end - start) * eased

      setDisplayValue(current)

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }, [isInView, value, duration])

  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {prefix}{displayValue.toFixed(decimals)}{suffix}
    </motion.span>
  )
}
