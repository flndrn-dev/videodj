'use client'

import { motion } from 'framer-motion'
import { AnimatedCounter } from './AnimatedCounter'
import { useRouter } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  subtitle: string
  icon: LucideIcon
  accent: string
  accentDim: string
  glowClass?: string
  delay?: number
  href?: string
}

export function MetricCard({
  title,
  value,
  prefix,
  suffix,
  decimals,
  subtitle,
  icon: Icon,
  accent,
  accentDim,
  glowClass = '',
  delay = 0,
  href,
}: MetricCardProps) {
  const router = useRouter()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={href ? { scale: 1.02, y: -2 } : undefined}
      whileTap={href ? { scale: 0.98 } : undefined}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      onClick={href ? () => router.push(href) : undefined}
      className={`glass-card ${glowClass} p-6 ${href ? 'cursor-pointer' : 'cursor-default'}`}
      style={href ? { transition: 'border-color 0.2s' } : undefined}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="p-2.5 rounded-xl"
          style={{
            background: accentDim,
            border: `1px solid ${accent}30`,
          }}
        >
          <Icon size={20} style={{ color: accent }} strokeWidth={1.5} />
        </div>
        <span
          className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md"
          style={{
            background: accentDim,
            color: accent,
          }}
        >
          Live
        </span>
      </div>

      <p
        className="text-xs font-medium uppercase tracking-wider mb-1"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {title}
      </p>

      <p className="text-3xl font-bold tracking-tight" style={{ color: accent }}>
        <AnimatedCounter value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </p>

      <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
        {subtitle}
      </p>
    </motion.div>
  )
}
