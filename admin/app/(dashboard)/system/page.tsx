'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Server, Cpu, HardDrive, Wifi, Activity, Brain, Zap, Database, Clock, X, AlertTriangle, CheckCircle } from 'lucide-react'
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter'
import { useGhostHealth } from '@/app/hooks/useGhostHealth'

interface SystemApiResponse {
  node: {
    version: string
    uptime: number
    memory: { rss: number; heapTotal: number; heapUsed: number; external: number }
  }
  db: {
    connected: boolean
    tables: Record<string, number>
  }
  timestamp: string
}

interface OllamaStats {
  ollamaStatus: string
  ollamaModel: string
  ollamaVersion: string
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB'
  return (bytes / 1048576).toFixed(0) + ' MB'
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
  const [systemData, setSystemData] = useState<SystemApiResponse | null>(null)
  const [ollama, setOllama] = useState<OllamaStats>({
    ollamaStatus: 'running', ollamaModel: 'qwen2.5-coder:7b', ollamaVersion: '0.20.2',
  })
  const [loading, setLoading] = useState(true)
  const [expandedGauge, setExpandedGauge] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSystem() {
      try {
        const res = await fetch('/api/system')
        if (res.ok) {
          const data = await res.json()
          setSystemData(data)
          // If the API also returns ollama info, use it
          if (data.ollamaStatus) {
            setOllama({
              ollamaStatus: data.ollamaStatus,
              ollamaModel: data.ollamaModel || ollama.ollamaModel,
              ollamaVersion: data.ollamaVersion || ollama.ollamaVersion,
            })
          }
        }
      } catch { /* use defaults */ }
      setLoading(false)
    }
    fetchSystem()
  }, [])

  // Derive gauge values from real API data
  const heapUsedMB = systemData ? systemData.node.memory.heapUsed / 1048576 : 0
  const heapTotalMB = systemData ? systemData.node.memory.heapTotal / 1048576 : 1
  const rssMB = systemData ? systemData.node.memory.rss / 1048576 : 0
  const externalMB = systemData ? systemData.node.memory.external / 1048576 : 0

  const dbConnected = systemData?.db.connected ?? false
  const tableCounts = systemData?.db.tables ?? {}
  const nodeVersion = systemData?.node.version ?? '—'
  const uptime = systemData?.node.uptime ?? 0

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold glow-blue" style={{ color: 'var(--system-blue)' }}>System Health</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>KVM4 VPS — Manchester, UK</p>
      </motion.div>

      {/* Gauges — clickable */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { id: 'heap', label: 'Heap Memory', value: heapUsedMB, max: heapTotalMB, icon: Activity, unit: 'MB' },
          { id: 'rss', label: 'RSS Memory', value: rssMB, max: rssMB + 100, icon: Cpu, unit: 'MB' },
          { id: 'external', label: 'External', value: externalMB, max: Math.max(externalMB * 2, 10), icon: HardDrive, unit: 'MB' },
        ].map((gauge, i) => (
          <motion.div
            key={gauge.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            className="glass-card glass-card--system p-6 flex flex-col items-center relative cursor-pointer"
            onClick={() => setExpandedGauge(expandedGauge === gauge.id ? null : gauge.id)}
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
              {gauge.value.toFixed(1)} / {gauge.max.toFixed(1)} {gauge.unit}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Expanded gauge detail */}
      <AnimatePresence>
        {expandedGauge === 'heap' && systemData && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="glass-card glass-card--system p-5 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--system-blue)' }}>
                <Activity size={14} /> Heap Memory Detail
              </h4>
              <button onClick={() => setExpandedGauge(null)} style={{ color: 'var(--text-tertiary)' }}><X size={14} /></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="px-3 py-3 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Heap Used</span>
                <p className="text-lg font-bold font-mono" style={{ color: 'var(--system-blue)' }}>{formatBytes(systemData.node.memory.heapUsed)}</p>
              </div>
              <div className="px-3 py-3 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Heap Total</span>
                <p className="text-lg font-bold font-mono" style={{ color: 'var(--text-secondary)' }}>{formatBytes(systemData.node.memory.heapTotal)}</p>
              </div>
              <div className="px-3 py-3 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Usage</span>
                <p className="text-lg font-bold font-mono" style={{ color: heapUsedMB / heapTotalMB > 0.9 ? 'var(--status-red)' : heapUsedMB / heapTotalMB > 0.7 ? 'var(--status-amber)' : 'var(--status-green)' }}>
                  {((heapUsedMB / heapTotalMB) * 100).toFixed(1)}%
                </p>
              </div>
              <div className="px-3 py-3 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Free</span>
                <p className="text-lg font-bold font-mono" style={{ color: 'var(--status-green)' }}>{formatBytes(systemData.node.memory.heapTotal - systemData.node.memory.heapUsed)}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-[10px]" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
              {heapUsedMB / heapTotalMB > 0.9
                ? <><AlertTriangle size={12} style={{ color: 'var(--status-red)' }} /> <span style={{ color: 'var(--status-red)' }}>Critical: Heap usage above 90%. Consider restarting the service or increasing memory.</span></>
                : heapUsedMB / heapTotalMB > 0.7
                ? <><AlertTriangle size={12} style={{ color: 'var(--status-amber)' }} /> <span style={{ color: 'var(--status-amber)' }}>Warning: Heap usage above 70%. Monitor for potential memory pressure.</span></>
                : <><CheckCircle size={12} style={{ color: 'var(--status-green)' }} /> <span style={{ color: 'var(--status-green)' }}>Healthy: Heap memory usage is within normal range.</span></>
              }
            </div>
          </motion.div>
        )}

        {expandedGauge === 'rss' && systemData && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="glass-card glass-card--system p-5 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--system-blue)' }}>
                <Cpu size={14} /> RSS Memory Detail
              </h4>
              <button onClick={() => setExpandedGauge(null)} style={{ color: 'var(--text-tertiary)' }}><X size={14} /></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="px-3 py-3 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Resident Set Size</span>
                <p className="text-lg font-bold font-mono" style={{ color: 'var(--system-blue)' }}>{formatBytes(systemData.node.memory.rss)}</p>
              </div>
              <div className="px-3 py-3 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Heap Portion</span>
                <p className="text-lg font-bold font-mono" style={{ color: 'var(--text-secondary)' }}>{formatBytes(systemData.node.memory.heapTotal)}</p>
              </div>
              <div className="px-3 py-3 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Non-Heap (Native + C++)</span>
                <p className="text-lg font-bold font-mono" style={{ color: 'var(--status-amber)' }}>{formatBytes(systemData.node.memory.rss - systemData.node.memory.heapTotal)}</p>
              </div>
            </div>
            <div className="mt-3 px-3 py-2 rounded-lg text-[10px]" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-tertiary)' }}>
              RSS (Resident Set Size) is the total physical memory used by the Node.js process, including heap, stack, and native C++ allocations. RSS &gt; Heap Total indicates native memory usage from dependencies like pg, image processing, etc.
            </div>
          </motion.div>
        )}

        {expandedGauge === 'external' && systemData && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="glass-card glass-card--system p-5 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--system-blue)' }}>
                <HardDrive size={14} /> External Memory Detail
              </h4>
              <button onClick={() => setExpandedGauge(null)} style={{ color: 'var(--text-tertiary)' }}><X size={14} /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="px-3 py-3 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>External V8 Memory</span>
                <p className="text-lg font-bold font-mono" style={{ color: 'var(--system-blue)' }}>{formatBytes(systemData.node.memory.external)}</p>
              </div>
              <div className="px-3 py-3 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>% of Total RSS</span>
                <p className="text-lg font-bold font-mono" style={{ color: 'var(--text-secondary)' }}>
                  {systemData.node.memory.rss > 0 ? ((systemData.node.memory.external / systemData.node.memory.rss) * 100).toFixed(1) : 0}%
                </p>
              </div>
            </div>
            <div className="mt-3 px-3 py-2 rounded-lg text-[10px]" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-tertiary)' }}>
              External memory is allocated outside V8&apos;s heap by C++ objects backed by JavaScript (like Buffers, TypedArrays). Common sources: file I/O buffers, crypto operations, database driver buffers, HTTP request/response bodies.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Node Info + DB Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Node.js Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card glass-card--system p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} style={{ color: 'var(--system-blue)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Node.js Runtime</span>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Version', value: nodeVersion },
              { label: 'Uptime', value: loading ? '—' : formatUptime(uptime) },
              { label: 'Heap Used', value: loading ? '—' : formatBytes(systemData?.node.memory.heapUsed ?? 0) },
              { label: 'Heap Total', value: loading ? '—' : formatBytes(systemData?.node.memory.heapTotal ?? 0) },
              { label: 'RSS', value: loading ? '—' : formatBytes(systemData?.node.memory.rss ?? 0) },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-2"
                style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.label}</span>
                <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Database Tables */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass-card glass-card--system p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Database size={16} style={{ color: 'var(--system-blue)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Database</span>
            <span className="ml-auto flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full"
                style={{ background: loading ? 'var(--status-amber)' : dbConnected ? 'var(--status-green)' : 'var(--status-red)' }} />
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                {loading ? 'checking' : dbConnected ? 'connected' : 'disconnected'}
              </span>
            </span>
          </div>
          <div className="space-y-3">
            {Object.keys(tableCounts).length > 0 ? (
              Object.entries(tableCounts).map(([table, count]) => (
                <div key={table} className="flex items-center justify-between py-2"
                  style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>{table}</span>
                  <span className="text-xs font-mono font-bold" style={{ color: 'var(--text-secondary)' }}>
                    {count.toLocaleString()} rows
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {loading ? 'Loading...' : 'No table data available'}
              </p>
            )}
          </div>
        </motion.div>
      </div>

      {/* Ollama + Services */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ollama */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card glass-card--system p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Brain size={16} style={{ color: 'var(--system-blue)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Ollama</span>
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-md font-mono"
              style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--status-green)' }}>
              {ollama.ollamaStatus}
            </span>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Model', value: ollama.ollamaModel },
              { label: 'Version', value: ollama.ollamaVersion },
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
          transition={{ delay: 0.35 }}
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
              { name: 'PostgreSQL', domain: 'ghost-db:5432', status: loading ? 'checking' : dbConnected ? 'online' : 'offline' },
              { name: 'Ollama', domain: 'localhost:11434', status: ollama.ollamaStatus === 'running' ? 'online' : 'offline' },
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
