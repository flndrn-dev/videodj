'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Ghost,
  Bot,
  Server,
  Users,
  Headset,
  Mail,
  Lightbulb,
  DollarSign,
  Download,
  Monitor,
  Apple,
  Terminal,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronUp,
  Music,
  LogOut,
  type LucideIcon,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Animated Icon — bounces on hover, pulses when active
// ---------------------------------------------------------------------------

function AnimatedIcon({
  icon: Icon,
  size = 18,
  isActive = false,
  isHovered = false,
  color,
}: {
  icon: LucideIcon
  size?: number
  isActive?: boolean
  isHovered?: boolean
  color: string
}) {
  return (
    <motion.div
      animate={{
        scale: isHovered ? 1.15 : 1,
        rotate: isHovered ? [0, -8, 8, -4, 0] : 0,
      }}
      transition={{
        scale: { duration: 0.2 },
        rotate: { duration: 0.4, ease: 'easeInOut' },
      }}
    >
      <Icon
        size={size}
        strokeWidth={isActive ? 2.2 : 1.5}
        style={{ color }}
      />
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Nav config
// ---------------------------------------------------------------------------

const navSections = [
  {
    label: 'Overview',
    items: [
      { href: '/', icon: LayoutDashboard, label: 'Dashboard', accent: 'yellow' },
    ],
  },
  {
    label: 'Agents',
    items: [
      { href: '/ghost', icon: Ghost, label: 'Ghost', accent: 'purple' },
      { href: '/linus', icon: Bot, label: 'Linus', accent: 'green' },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { href: '/system', icon: Server, label: 'System', accent: 'blue' },
      { href: '/finance', icon: DollarSign, label: 'Finance', accent: 'yellow' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/users', icon: Users, label: 'Users', accent: 'yellow' },
      { href: '/support', icon: Headset, label: 'Support', accent: 'yellow' },
      { href: '/subscribers', icon: Mail, label: 'Subscribers', accent: 'yellow' },
      { href: '/tracks', icon: Music, label: 'Tracks', accent: 'yellow' },
      { href: '/devzone', icon: Lightbulb, label: 'Dev Zone', accent: 'yellow' },
    ],
  },
]

const accentColors: Record<string, string> = {
  yellow: 'var(--brand-yellow)',
  purple: 'var(--ghost-purple)',
  green: 'var(--linus-green)',
  blue: 'var(--system-blue)',
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

// We resolve the real download URL at runtime from the GitHub Releases API
// so the sidebar always points at whatever the most recent tag published —
// no version hard-coded in the URL, no code change needed for new releases.
const LATEST_RELEASE_API = 'https://api.github.com/repos/flndrn-dev/videodj/releases/latest'
const LATEST_RELEASE_PAGE = 'https://github.com/flndrn-dev/videodj/releases/latest'

type OSKey = 'mac-arm64' | 'mac-x64' | 'win' | 'linux'

type PlatformMeta = {
  key: OSKey
  label: string
  icon: LucideIcon
  accent: string
  // Picks the right asset out of the release asset list. First match wins,
  // so ordering matters (e.g. mac-arm64 must check for "arm64" before the
  // generic Intel .dmg selector).
  match: (assetName: string) => boolean
}

const platforms: PlatformMeta[] = [
  { key: 'mac-arm64', label: 'macOS (Apple Silicon)', icon: Apple, accent: '#a78bfa', match: (n) => /arm64.*\.dmg$/i.test(n) },
  { key: 'mac-x64',   label: 'macOS (Intel)',         icon: Apple, accent: '#a78bfa', match: (n) => /\.dmg$/i.test(n) && !/arm64/i.test(n) },
  { key: 'win',       label: 'Windows',               icon: Monitor, accent: '#60a5fa', match: (n) => /\.exe$/i.test(n) },
  { key: 'linux',     label: 'Linux',                 icon: Terminal, accent: '#f97316', match: (n) => /\.AppImage$/i.test(n) },
]

function detectOS(): OSKey | null {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent.toLowerCase()
  const platform =
    (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform?.toLowerCase() ||
    navigator.platform?.toLowerCase() || ''

  if (platform.includes('mac') || ua.includes('macintosh')) {
    // Best-effort Apple Silicon detection — the WebGL renderer reports
    // "Apple …" on M-series Macs and "Intel …" on Intel Macs.
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl')
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
        if (debugInfo) {
          const renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
          if (renderer.includes('Apple')) return 'mac-arm64'
          return 'mac-x64'
        }
      }
    } catch { /* ignore — fall through to arm64 default */ }
    return 'mac-arm64'
  }
  if (platform.includes('win') || ua.includes('windows')) return 'win'
  if (platform.includes('linux') || ua.includes('linux')) return 'linux'
  return null
}

type GithubAsset = { name: string; browser_download_url: string }
type GithubRelease = { tag_name: string; assets: GithubAsset[] }

function useLatestRelease() {
  const [release, setRelease] = useState<GithubRelease | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<GithubRelease>
      })
      .then((data) => { if (!cancelled) { setRelease(data); setLoading(false) } })
      .catch((e) => { if (!cancelled) { setError(String(e.message || e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  return { release, error, loading }
}

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [detectedOS, setDetectedOS] = useState<OSKey | null>(null)
  const { release, error: releaseError, loading: releaseLoading } = useLatestRelease()

  useEffect(() => { setDetectedOS(detectOS()) }, [])

  // Resolve the download URL for the user's OS from the latest release.
  const detectedPlatform = platforms.find((p) => p.key === detectedOS) ?? null
  const matchedAsset = detectedPlatform && release
    ? release.assets.find((a) => detectedPlatform.match(a.name)) ?? null
    : null

  const sidebarWidth = collapsed ? 72 : 280

  return (
    <>
      <motion.aside
        animate={{ width: sidebarWidth }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        initial={false}
        className="fixed left-0 top-0 bottom-0 z-40 flex flex-col"
        style={{
          background: 'linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%)',
          borderRight: '1px solid var(--border-primary)',
        }}
      >
        {/* Logo + toggle */}
        <div className="px-4 py-5 flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0"
            style={{
              background: 'var(--brand-yellow-dim)',
              color: 'var(--brand-yellow)',
              border: '1px solid rgba(255, 255, 0, 0.2)',
            }}
          >
            V
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden whitespace-nowrap flex-1"
              >
                <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  videoDJ.Studio
                </h1>
                <p className="text-[10px]" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  Admin Dashboard
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Toggle button — always visible */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="shrink-0 p-2 rounded-lg transition-all"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-primary)',
              color: 'var(--text-tertiary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,0,0.3)'
              e.currentTarget.style.color = 'var(--brand-yellow)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-primary)'
              e.currentTarget.style.color = 'var(--text-tertiary)'
            }}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-5">
          {navSections.map((section, si) => (
            <motion.div
              key={section.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + si * 0.05, duration: 0.4 }}
            >
              <AnimatePresence>
                {!collapsed && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.15em]"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {section.label}
                  </motion.p>
                )}
              </AnimatePresence>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
                  const accent = accentColors[item.accent]
                  const isHovered = hoveredItem === item.href

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`sidebar-item flex items-center gap-3 rounded-lg text-sm relative group ${isActive ? 'active' : ''}`}
                      style={{
                        color: isActive ? accent : 'var(--text-secondary)',
                        backgroundColor: isActive ? `${accent}15` : 'transparent',
                        padding: collapsed ? '10px 0' : '10px 12px',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                      }}
                      onMouseEnter={() => setHoveredItem(item.href)}
                      onMouseLeave={() => setHoveredItem(null)}
                    >
                      <AnimatedIcon
                        icon={item.icon}
                        isActive={isActive}
                        isHovered={isHovered}
                        color={isActive ? accent : isHovered ? accent : 'var(--text-secondary)'}
                      />
                      <AnimatePresence>
                        {!collapsed && (
                          <motion.span
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: 'auto' }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{ duration: 0.2 }}
                            className="font-medium overflow-hidden whitespace-nowrap"
                          >
                            {item.label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                      {item.label === 'Ghost' && (
                        <span
                          className={`w-2 h-2 rounded-full pulse-green ${collapsed ? 'absolute top-1 right-1' : 'ml-auto'}`}
                          style={{ background: 'var(--status-green)' }}
                        />
                      )}

                      {/* Tooltip when collapsed */}
                      {collapsed && (
                        <div
                          className="absolute left-full ml-3 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50"
                          style={{
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-secondary)',
                            color: accent,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                          }}
                        >
                          {item.label}
                        </div>
                      )}
                    </Link>
                  )
                })}
              </div>
            </motion.div>
          ))}
        </nav>

        {/* Footer — Settings dropdown */}
        <div
          className="px-2 py-3 space-y-1 relative"
          style={{ borderTop: '1px solid var(--border-primary)' }}
        >
          {/* Desktop version dropdown */}
          <AnimatePresence>
            {settingsOpen && !collapsed && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.15 }}
                className="mb-2 rounded-xl overflow-hidden"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-secondary)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}
              >
                {/* Logout */}
                <button
                  onClick={() => {
                    document.cookie = 'admin_session=; Max-Age=0; Path=/'
                    window.location.href = '/auth/signin'
                  }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 text-xs transition-all"
                  style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-primary)', background: 'transparent', border: 'none', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border-primary)', cursor: 'pointer', textAlign: 'left' }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#ef4444' }}
                  onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  <LogOut size={14} style={{ color: '#ef4444' }} />
                  <span className="flex-1">Log out</span>
                </button>

                <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <div className="flex items-center gap-2">
                    <Download size={11} style={{ color: 'var(--brand-yellow)' }} />
                    <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                      Desktop {release?.tag_name ?? (releaseLoading ? '…' : 'latest')}
                    </span>
                  </div>
                </div>

                {/* Single OS-detected download button. No platform picker —
                    the user gets exactly the build for the machine they're
                    on, sourced from whatever is the latest release right
                    now, not a hard-coded version. */}
                {releaseLoading ? (
                  <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Checking for latest build…
                  </div>
                ) : releaseError || !release ? (
                  <div className="px-3 py-3 text-xs" style={{ color: '#ef4444' }}>
                    Could not reach GitHub Releases. Try again in a moment.
                  </div>
                ) : !detectedPlatform ? (
                  <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Your OS was not detected.{' '}
                    <a href={LATEST_RELEASE_PAGE} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-yellow)' }}>
                      See all downloads
                    </a>
                  </div>
                ) : !matchedAsset ? (
                  <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    No {detectedPlatform.label} build in this release yet.{' '}
                    <a href={LATEST_RELEASE_PAGE} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-yellow)' }}>
                      See all
                    </a>
                  </div>
                ) : (
                  <>
                    <a
                      href={matchedAsset.browser_download_url}
                      download
                      className="flex items-center gap-3 px-3 py-3 text-xs transition-all"
                      style={{
                        color: 'var(--text-secondary)',
                        textDecoration: 'none',
                        borderBottom: '1px solid var(--border-primary)',
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = `${detectedPlatform.accent}15`
                        e.currentTarget.style.color = detectedPlatform.accent
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = 'var(--text-secondary)'
                      }}
                    >
                      <detectedPlatform.icon size={16} style={{ color: detectedPlatform.accent }} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          Download for {detectedPlatform.label}
                        </div>
                        <div className="truncate text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                          {matchedAsset.name}
                        </div>
                      </div>
                      <Download size={12} style={{ color: detectedPlatform.accent }} />
                    </a>
                    <a
                      href={LATEST_RELEASE_PAGE}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center px-3 py-2 text-[10px]"
                      style={{ color: 'var(--text-tertiary)', textDecoration: 'none' }}
                      onMouseOver={(e) => { e.currentTarget.style.color = 'var(--brand-yellow)' }}
                      onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
                    >
                      Other platforms
                    </a>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Settings button */}
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="flex items-center gap-3 w-full rounded-lg text-sm transition-all relative group"
            style={{
              color: settingsOpen ? 'var(--brand-yellow)' : hoveredItem === 'settings' ? 'var(--status-red)' : 'var(--text-tertiary)',
              background: settingsOpen ? 'rgba(255,255,0,0.08)' : hoveredItem === 'settings' ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
              padding: collapsed ? '10px 0' : '10px 12px',
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
            onMouseEnter={() => setHoveredItem('settings')}
            onMouseLeave={() => setHoveredItem(null)}
          >
            <AnimatedIcon
              icon={Settings}
              size={16}
              isHovered={hoveredItem === 'settings'}
              color={settingsOpen ? 'var(--brand-yellow)' : hoveredItem === 'settings' ? 'var(--status-red)' : 'var(--text-tertiary)'}
            />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="overflow-hidden whitespace-nowrap flex-1 text-left"
                >
                  Settings
                </motion.span>
              )}
            </AnimatePresence>
            {!collapsed && (
              <ChevronUp
                size={12}
                style={{
                  color: 'var(--text-tertiary)',
                  transform: settingsOpen ? 'rotate(0deg)' : 'rotate(180deg)',
                  transition: 'transform 0.2s',
                }}
              />
            )}
            {collapsed && (
              <div className="absolute left-full ml-3 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)', color: 'var(--text-tertiary)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                Settings
              </div>
            )}
          </button>


        </div>
      </motion.aside>

      {/* CSS variable for main content offset */}
      <style>{`:root { --sidebar-width: ${sidebarWidth}px; }`}</style>
    </>
  )
}
