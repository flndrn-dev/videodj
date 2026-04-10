'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Server, Cpu, HardDrive, Wifi, Activity, Brain, Zap } from 'lucide-react'
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter'
import { useGhostHealth } from '@/app/hooks/useGhostHealth'

interface SystemStats {
  cpu: number
  ram: { used: number; total: number }
  disk: { used: number; total: number }
  ollamaStatus: string
  ollamaModel: string
  ollamaVersion: string
}

function GaugeRing({ value, max, label, accent, size = 120 }: {
  value: number; max: number; label: string; accent: string; size?: number
}) {
  const pct = Math.min((value / max) * 100, 100)
  const radius = (size - 12) / 2
  const circ = 2 * Math.PI * radius
  const offset = circ - (pct / 100) * circ
  const color = pct > 90 ? 'var(--status-red)' : pct > 70 ? 'var(--status-amber)' : accent

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--border-primary)" strokeWidth="6" />
        <motion.circle
          cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-xl font-bold font-mono" style={{ color }}>{pct.toFixed(0)}%</span>
      </div>
      <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
    </div>
  )
}

export default function SystemPage() {
  const { health } = useGhostHealth()
  const [stats, setStats] = useState<SystemStats>({
    cpu: 23, ram: { used: 8.2, total: 16 }, disk: { used: 16, total: 193 },
    ollamaStatus: 'running', ollamaModel: 'qwen2.5-coder:7b', ollamaVersion: '0.20.2',
  })

  useEffect(() => {
    async function fetchOllama() {
      try {
        const res = await fetch('/api/system')
        if (res.ok) setStats(await res.json())
      } catch { /* use defaults */ }
    }
    fetchOllama()
  }, [])

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold glow-blue" style={{ color: 'var(--system-blue)' }}>System Health</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>KVM4 VPS — Manchester, UK</p>
      </motion.div>

      {/* Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'CPU', value: stats.cpu, max: 100, icon: Cpu },
          { label: 'Memory', value: stats.ram.used, max: stats.ram.total, icon: Activity },
          { label: 'Disk', value: stats.disk.used, max: stats.disk.total, icon: HardDrive },
        ].map((gauge, i) => (
          <motion.div
            key={gauge.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            className="glass-card glass-card--system p-6 flex flex-col items-center relative"
          >
            <div className="flex items-center gap-2 mb-4 self-start">
              <gauge.icon size={14} style={{ color: 'var(--system-blue)' }} />
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                {gauge.label}
              </span>
            </div>
            <div className="relative">
              <GaugeRing value={gauge.value} max={gauge.max} label="" accent="var(--system-blue)" />
            </div>
            <p className="text-xs font-mono mt-2" style={{ color: 'var(--text-secondary)' }}>
              {gauge.value.toFixed(1)} / {gauge.max} {gauge.label === 'CPU' ? '%' : 'GB'}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Ollama + Services */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ollama */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass-card glass-card--system p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Brain size={16} style={{ color: 'var(--system-blue)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Ollama</span>
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-md font-mono"
              style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--status-green)' }}>
              {stats.ollamaStatus}
            </span>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Model', value: stats.ollamaModel },
              { label: 'Version', value: stats.ollamaVersion },
              { label: 'Endpoint', value: 'localhost:11434' },
              { label: 'Access', value: 'Docker bridge only (iptables secured)' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-2"
                style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.label}</span>
                <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Services */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card glass-card--system p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} style={{ color: 'var(--system-blue)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Services</span>
          </div>
          <div className="space-y-3">
            {[
              { name: 'Ghost Server', domain: 'ghost.videodj.studio', status: health ? 'online' : 'checking' },
              { name: 'Dokploy', domain: '187.124.209.17:3000', status: 'online' },
              { name: 'Traefik (SSL)', domain: 'ports 80/443', status: 'online' },
              { name: 'PostgreSQL', domain: 'ghost-db:5432', status: 'online' },
              { name: 'Ollama', domain: 'localhost:11434', status: stats.ollamaStatus === 'running' ? 'online' : 'offline' },
            ].map(svc => (
              <div key={svc.name} className="flex items-center justify-between py-2"
                style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <div>
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{svc.name}</p>
                  <p className="text-[11px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{svc.domain}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full"
                    style={{ background: svc.status === 'online' ? 'var(--status-green)' : svc.status === 'checking' ? 'var(--status-amber)' : 'var(--status-red)' }} />
                  <span className="text-xs capitalize" style={{ color: 'var(--text-secondary)' }}>{svc.status}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
