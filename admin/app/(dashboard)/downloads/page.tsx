'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Download, Monitor, Apple, Terminal, Package, CheckCircle2, ChevronDown } from 'lucide-react'

// ---------------------------------------------------------------------------
// Build config
// ---------------------------------------------------------------------------

const VERSION = '1.0.2'
const BASE_URL = 'https://github.com/flndrn-dev/videodj/releases/download'

interface Build {
  platform: 'mac-arm64' | 'mac-x64' | 'win' | 'linux-appimage' | 'linux-deb'
  os: 'mac' | 'win' | 'linux'
  label: string
  subLabel: string
  fileName: string
  icon: typeof Monitor
  accent: string
}

const builds: Build[] = [
  { platform: 'mac-arm64', os: 'mac', label: 'macOS', subLabel: 'Apple Silicon (M1/M2/M3/M4)', fileName: `videoDJ.Studio-${VERSION}-arm64.dmg`, icon: Apple, accent: '#a78bfa' },
  { platform: 'mac-x64', os: 'mac', label: 'macOS', subLabel: 'Intel', fileName: `videoDJ.Studio-${VERSION}.dmg`, icon: Apple, accent: '#a78bfa' },
  { platform: 'win', os: 'win', label: 'Windows', subLabel: 'x64 Installer', fileName: `videoDJ.Studio-${VERSION}.exe`, icon: Monitor, accent: '#60a5fa' },
  { platform: 'linux-appimage', os: 'linux', label: 'Linux', subLabel: 'AppImage', fileName: `videoDJ.Studio-${VERSION}.AppImage`, icon: Terminal, accent: '#f97316' },
  { platform: 'linux-deb', os: 'linux', label: 'Linux', subLabel: '.deb Package', fileName: `videoDJ.Studio-${VERSION}.deb`, icon: Terminal, accent: '#f97316' },
]

// ---------------------------------------------------------------------------
// OS detection
// ---------------------------------------------------------------------------

type DetectedOS = 'mac' | 'win' | 'linux' | 'unknown'

function detectOS(): { os: DetectedOS; arch: string } {
  if (typeof navigator === 'undefined') return { os: 'unknown', arch: '' }
  const ua = navigator.userAgent.toLowerCase()
  const platform = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform?.toLowerCase() || navigator.platform?.toLowerCase() || ''

  let os: DetectedOS = 'unknown'
  if (platform.includes('mac') || ua.includes('macintosh')) os = 'mac'
  else if (platform.includes('win') || ua.includes('windows')) os = 'win'
  else if (platform.includes('linux') || ua.includes('linux')) os = 'linux'

  // Detect Apple Silicon
  let arch = ''
  if (os === 'mac') {
    // Check for ARM via WebGL renderer or assume arm64 for recent macOS
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl')
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
        if (debugInfo) {
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          arch = renderer.includes('Apple') ? 'arm64' : 'x64'
        }
      }
    } catch { /* fallback */ }
    if (!arch) arch = 'arm64' // Default to ARM for modern Macs
  }

  return { os, arch }
}

function getRecommendedBuild(os: DetectedOS, arch: string): Build | null {
  if (os === 'mac') return builds.find(b => b.platform === (arch === 'arm64' ? 'mac-arm64' : 'mac-x64')) || null
  if (os === 'win') return builds.find(b => b.platform === 'win') || null
  if (os === 'linux') return builds.find(b => b.platform === 'linux-appimage') || null
  return null
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DownloadsPage() {
  const [detected, setDetected] = useState<{ os: DetectedOS; arch: string }>({ os: 'unknown', arch: '' })
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    setDetected(detectOS())
  }, [])

  const recommended = getRecommendedBuild(detected.os, detected.arch)
  const otherBuilds = builds.filter(b => b !== recommended)

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold" style={{ color: 'var(--brand-yellow)' }}>
          Desktop Downloads
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Download videoDJ.Studio for your platform — v{VERSION}
        </p>
      </motion.div>

      {/* Recommended download — big hero card */}
      {recommended && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-8 flex flex-col items-center gap-5"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} style={{ color: 'var(--status-green)' }} />
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--status-green)' }}>
              Detected: {detected.os === 'mac' ? `macOS ${detected.arch === 'arm64' ? '(Apple Silicon)' : '(Intel)'}` : detected.os === 'win' ? 'Windows' : 'Linux'}
            </span>
          </div>

          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{ background: `${recommended.accent}15`, border: `1px solid ${recommended.accent}30` }}
          >
            <recommended.icon size={36} style={{ color: recommended.accent }} />
          </div>

          <div className="text-center">
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {recommended.label}
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {recommended.subLabel}
            </p>
            <p className="text-[10px] font-mono mt-2" style={{ color: 'var(--text-tertiary)' }}>
              {recommended.fileName}
            </p>
          </div>

          <a
            href={`${BASE_URL}/v${VERSION}/${recommended.fileName}`}
            download
            className="px-8 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
            style={{
              background: recommended.accent,
              color: '#000',
              textDecoration: 'none',
            }}
            onMouseOver={e => { e.currentTarget.style.opacity = '0.85' }}
            onMouseOut={e => { e.currentTarget.style.opacity = '1' }}
          >
            <Download size={16} />
            Download for {recommended.label}
          </a>

          <p className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>
            Not code-signed yet — right-click &gt; Open on first launch (macOS) or allow in SmartScreen (Windows)
          </p>
        </motion.div>
      )}

      {/* Show all platforms toggle */}
      <button
        onClick={() => setShowAll(!showAll)}
        className="flex items-center gap-2 mx-auto text-xs transition-colors"
        style={{ color: 'var(--text-tertiary)' }}
        onMouseOver={e => { e.currentTarget.style.color = 'var(--brand-yellow)' }}
        onMouseOut={e => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
      >
        {showAll ? 'Hide' : 'Show'} all platforms
        <ChevronDown size={12} style={{ transform: showAll ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {/* All platforms grid */}
      {showAll && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {otherBuilds.map((build, i) => (
            <motion.div
              key={build.platform}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass-card p-5 flex flex-col items-center gap-3"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: `${build.accent}15`, border: `1px solid ${build.accent}30` }}
              >
                <build.icon size={22} style={{ color: build.accent }} />
              </div>
              <div className="text-center">
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{build.label}</h3>
                <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{build.subLabel}</p>
              </div>
              <a
                href={`${BASE_URL}/v${VERSION}/${build.fileName}`}
                download
                className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                style={{
                  background: 'var(--bg-tertiary)',
                  color: build.accent,
                  border: `1px solid ${build.accent}30`,
                  textDecoration: 'none',
                }}
                onMouseOver={e => { e.currentTarget.style.background = `${build.accent}20` }}
                onMouseOut={e => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
              >
                <Download size={12} />
                Download
              </a>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Version info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-center"
      >
        <p className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
          v{VERSION} — The desktop app wraps the same web interface with native file system access
        </p>
      </motion.div>
    </div>
  )
}
