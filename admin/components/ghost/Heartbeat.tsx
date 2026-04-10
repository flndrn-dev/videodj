'use client'

import { motion } from 'framer-motion'

interface HeartbeatProps {
  status: 'green' | 'amber' | 'red'
  uptime: number
  connections: number
}

export function Heartbeat({ status, uptime, connections }: HeartbeatProps) {
  const uptimeStr = uptime > 3600
    ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
    : `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`

  const colors = { green: 'var(--status-green)', amber: 'var(--status-amber)', red: 'var(--status-red)' }
  const rawColors = { green: '#22c55e', amber: '#f59e0b', red: '#ef4444' }
  const color = colors[status]
  const rawColor = rawColors[status]

  // Heart beat interval based on status
  const beatDuration = status === 'green' ? 1.2 : status === 'amber' ? 0.8 : 0.5

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="glass-card glass-card--ghost p-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Beating heart */}
          <div className="relative flex items-center justify-center" style={{ width: 48, height: 48 }}>
            {/* Glow ring */}
            <motion.div
              animate={{
                scale: [1, 1.6, 1],
                opacity: [0.3, 0, 0.3],
              }}
              transition={{
                duration: beatDuration,
                repeat: Infinity,
                ease: 'easeOut',
              }}
              style={{
                position: 'absolute',
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: `radial-gradient(circle, ${rawColor}40, transparent 70%)`,
              }}
            />
            {/* Heart SVG */}
            <motion.svg
              viewBox="0 0 24 24"
              width={28}
              height={28}
              animate={{
                scale: [1, 1.2, 1, 1.08, 1],
              }}
              transition={{
                duration: beatDuration,
                repeat: Infinity,
                ease: 'easeInOut',
                times: [0, 0.15, 0.35, 0.45, 0.6],
              }}
              style={{ filter: `drop-shadow(0 0 6px ${rawColor})` }}
            >
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                fill={rawColor}
                opacity={0.9}
              />
            </motion.svg>
          </div>

          <div>
            <span className="text-sm font-semibold" style={{ color }}>
              {status === 'green' ? 'All Systems Nominal' : status === 'amber' ? 'Degraded Performance' : 'Critical — Attention Required'}
            </span>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Ghost agent {status === 'green' ? 'healthy and monitoring' : status === 'amber' ? 'responding slowly' : 'unreachable'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Uptime
            </p>
            <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
              {uptimeStr}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Clients
            </p>
            <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
              {connections}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
