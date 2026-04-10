'use client'

import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'

interface HeartbeatProps {
  status: 'green' | 'amber' | 'red'
  uptime: number
  connections: number
}

export function Heartbeat({ status, uptime, connections }: HeartbeatProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const colors = {
      green: '#22c55e',
      amber: '#f59e0b',
      red: '#ef4444',
    }
    const color = colors[status]
    let offset = 0
    let animId: number

    function draw() {
      if (!ctx || !canvas) return
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      // Draw ECG-style line
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.shadowColor = color
      ctx.shadowBlur = 8

      const mid = h / 2
      for (let x = 0; x < w; x++) {
        const t = (x + offset) % 120
        let y = mid

        if (t > 40 && t < 45) y = mid - 4
        else if (t > 45 && t < 48) y = mid + 20
        else if (t > 48 && t < 50) y = mid - 30
        else if (t > 50 && t < 53) y = mid + 15
        else if (t > 53 && t < 56) y = mid - 3
        else if (t > 56 && t < 60) y = mid

        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      // Trailing fade
      const gradient = ctx.createLinearGradient(0, 0, w, 0)
      gradient.addColorStop(0, 'rgba(20, 20, 31, 0.9)')
      gradient.addColorStop(0.15, 'rgba(20, 20, 31, 0)')
      gradient.addColorStop(0.85, 'rgba(20, 20, 31, 0)')
      gradient.addColorStop(1, 'rgba(20, 20, 31, 0.9)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, w, h)

      offset += status === 'red' ? 2 : 1
      animId = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animId)
  }, [status])

  const uptimeStr = uptime > 3600
    ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
    : `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`

  const pulseClass = status === 'green' ? 'pulse-green' : status === 'amber' ? 'pulse-amber' : 'pulse-red'
  const colors = { green: 'var(--status-green)', amber: 'var(--status-amber)', red: 'var(--status-red)' }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="glass-card glass-card--ghost p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${pulseClass}`}
            style={{ background: colors[status] }}
          />
          <span className="text-sm font-semibold" style={{ color: colors[status] }}>
            {status === 'green' ? 'All Systems Nominal' : status === 'amber' ? 'Degraded' : 'Critical'}
          </span>
        </div>
        <div className="flex items-center gap-4">
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

      <canvas
        ref={canvasRef}
        width={600}
        height={60}
        className="w-full h-[60px]"
        style={{ opacity: 0.9 }}
      />
    </motion.div>
  )
}
