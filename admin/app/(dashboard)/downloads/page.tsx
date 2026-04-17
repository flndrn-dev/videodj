'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Monitor, Apple, Terminal, CheckCircle2, ChevronDown } from 'lucide-react'

// ---------------------------------------------------------------------------
// Downloads page — single recommended build for the user's OS, sourced from
// whatever the latest GitHub Release is right now. All other platforms are
// still shown behind a "Show all platforms" toggle.
// ---------------------------------------------------------------------------

const LATEST_RELEASE_API = 'https://api.github.com/repos/flndrn-dev/videodj/releases/latest'
const LATEST_RELEASE_PAGE = 'https://github.com/flndrn-dev/videodj/releases/latest'

type OSKey = 'mac-arm64' | 'mac-x64' | 'win' | 'linux-appimage' | 'linux-deb'

type Platform = {
  key: OSKey
  os: 'mac' | 'win' | 'linux'
  label: string
  subLabel: string
  icon: typeof Monitor
  accent: string
  match: (assetName: string) => boolean
}

const platforms: Platform[] = [
  { key: 'mac-arm64', os: 'mac',   label: 'macOS', subLabel: 'Apple Silicon (M1/M2/M3/M4)', icon: Apple,    accent: '#a78bfa', match: (n) => /arm64.*\.dmg$/i.test(n) },
  { key: 'mac-x64',   os: 'mac',   label: 'macOS', subLabel: 'Intel',                       icon: Apple,    accent: '#a78bfa', match: (n) => /\.dmg$/i.test(n) && !/arm64/i.test(n) },
  { key: 'win',       os: 'win',   label: 'Windows', subLabel: 'x64 Installer',             icon: Monitor,  accent: '#60a5fa', match: (n) => /\.exe$/i.test(n) },
  { key: 'linux-appimage', os: 'linux', label: 'Linux', subLabel: 'AppImage',               icon: Terminal, accent: '#f97316', match: (n) => /\.AppImage$/i.test(n) },
  { key: 'linux-deb', os: 'linux', label: 'Linux', subLabel: '.deb Package',                icon: Terminal, accent: '#f97316', match: (n) => /\.deb$/i.test(n) },
]

// ---------------------------------------------------------------------------

type DetectedOS = 'mac' | 'win' | 'linux' | 'unknown'

function detectOS(): { os: DetectedOS; arch: string } {
  if (typeof navigator === 'undefined') return { os: 'unknown', arch: '' }
  const ua = navigator.userAgent.toLowerCase()
  const platform =
    (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform?.toLowerCase() ||
    navigator.platform?.toLowerCase() || ''

  let os: DetectedOS = 'unknown'
  if (platform.includes('mac') || ua.includes('macintosh')) os = 'mac'
  else if (platform.includes('win') || ua.includes('windows')) os = 'win'
  else if (platform.includes('linux') || ua.includes('linux')) os = 'linux'

  let arch = ''
  if (os === 'mac') {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl')
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
        if (debugInfo) {
          const renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
          arch = renderer.includes('Apple') ? 'arm64' : 'x64'
        }
      }
    } catch { /* fallback */ }
    if (!arch) arch = 'arm64'
  }

  return { os, arch }
}

function recommendedKey(os: DetectedOS, arch: string): OSKey | null {
  if (os === 'mac') return arch === 'arm64' ? 'mac-arm64' : 'mac-x64'
  if (os === 'win') return 'win'
  if (os === 'linux') return 'linux-appimage'
  return null
}

type GithubAsset = { name: string; browser_download_url: string; size?: number }
type GithubRelease = { tag_name: string; assets: GithubAsset[]; html_url?: string }

// ---------------------------------------------------------------------------

export default function DownloadsPage() {
  const [detected, setDetected] = useState<{ os: DetectedOS; arch: string }>({ os: 'unknown', arch: '' })
  const [showAll, setShowAll] = useState(false)
  const [release, setRelease] = useState<GithubRelease | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setDetected(detectOS()) }, [])

  useEffect(() => {
    let cancelled = false
    fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((data) => { if (!cancelled) { setRelease(data); setLoading(false) } })
      .catch((e) => { if (!cancelled) { setError(String(e.message || e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const recKey = recommendedKey(detected.os, detected.arch)
  const recommendedPlatform = recKey ? platforms.find((p) => p.key === recKey) ?? null : null
  const recommendedAsset = recommendedPlatform && release
    ? release.assets.find((a) => recommendedPlatform.match(a.name)) ?? null
    : null

  const otherPlatforms = platforms.filter((p) => p !== recommendedPlatform)

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold" style={{ color: 'var(--brand-yellow)' }}>
          Desktop Downloads
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          {release ? `Latest release: ${release.tag_name}` : loading ? 'Checking for latest release…' : 'Could not reach GitHub Releases'}
        </p>
      </motion.div>

      {loading && (
        <div className="glass-card p-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Loading latest release from GitHub…
        </div>
      )}

      {error && (
        <div className="glass-card p-8 text-center text-sm" style={{ color: '#ef4444' }}>
          Could not fetch the latest release: {error}. <a href={LATEST_RELEASE_PAGE} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-yellow)' }}>Open releases on GitHub</a>
        </div>
      )}

      {release && recommendedPlatform && (
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

          <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: `${recommendedPlatform.accent}15`, border: `1px solid ${recommendedPlatform.accent}30` }}>
            <recommendedPlatform.icon size={36} style={{ color: recommendedPlatform.accent }} />
          </div>

          <div className="text-center">
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{recommendedPlatform.label}</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{recommendedPlatform.subLabel}</p>
            <p className="text-[10px] font-mono mt-2" style={{ color: 'var(--text-tertiary)' }}>
              {recommendedAsset?.name ?? 'No build published for this platform yet'}
            </p>
          </div>

          {recommendedAsset ? (
            <a
              href={recommendedAsset.browser_download_url}
              download
              className="px-8 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
              style={{ background: recommendedPlatform.accent, color: '#000', textDecoration: 'none' }}
              onMouseOver={(e) => { e.currentTarget.style.opacity = '0.85' }}
              onMouseOut={(e) => { e.currentTarget.style.opacity = '1' }}
            >
              <Download size={16} />
              Download for {recommendedPlatform.label}
            </a>
          ) : (
            <a
              href={LATEST_RELEASE_PAGE}
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3 rounded-xl text-sm font-bold flex items-center gap-2"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', textDecoration: 'none' }}
            >
              See all releases on GitHub
            </a>
          )}

          <p className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>
            Not code-signed yet — right-click &gt; Open on first launch (macOS) or allow in SmartScreen (Windows)
          </p>
        </motion.div>
      )}

      {release && (
        <>
          <button
            onClick={() => setShowAll(!showAll)}
            className="flex items-center gap-2 mx-auto text-xs transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseOver={(e) => { e.currentTarget.style.color = 'var(--brand-yellow)' }}
            onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
          >
            {showAll ? 'Hide' : 'Show'} all platforms
            <ChevronDown size={12} style={{ transform: showAll ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {showAll && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              {otherPlatforms.map((p, i) => {
                const asset = release.assets.find((a) => p.match(a.name)) ?? null
                return (
                  <motion.div
                    key={p.key}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="glass-card p-5 flex flex-col items-center gap-3"
                  >
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${p.accent}15`, border: `1px solid ${p.accent}30` }}>
                      <p.icon size={22} style={{ color: p.accent }} />
                    </div>
                    <div className="text-center">
                      <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{p.label}</h3>
                      <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{p.subLabel}</p>
                    </div>
                    {asset ? (
                      <a
                        href={asset.browser_download_url}
                        download
                        className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                        style={{ background: 'var(--bg-tertiary)', color: p.accent, border: `1px solid ${p.accent}30`, textDecoration: 'none' }}
                        onMouseOver={(e) => { e.currentTarget.style.background = `${p.accent}20` }}
                        onMouseOut={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                      >
                        <Download size={12} />
                        Download
                      </a>
                    ) : (
                      <div className="w-full py-2 rounded-lg text-[10px] text-center" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', border: `1px solid var(--border)` }}>
                        Not built in {release.tag_name}
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </motion.div>
          )}
        </>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-center"
      >
        <p className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
          {release?.tag_name ?? 'latest'} — The desktop app wraps the same web interface with native file system access
        </p>
      </motion.div>
    </div>
  )
}
