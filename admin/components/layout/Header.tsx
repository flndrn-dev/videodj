'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Search, LogOut, X, Ghost, Server, Users, Headset, Music } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'

const pageTitles: Record<string, { title: string; subtitle: string; accent: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Operations overview', accent: 'var(--brand-yellow)' },
  '/ghost': { title: 'Ghost', subtitle: 'Self-healing agent', accent: 'var(--ghost-purple)' },
  '/linus': { title: 'Linus', subtitle: 'AI DJ agent', accent: 'var(--linus-green)' },
  '/system': { title: 'System', subtitle: 'Infrastructure health', accent: 'var(--system-blue)' },
  '/users': { title: 'Users', subtitle: 'Access management', accent: 'var(--brand-yellow)' },
  '/support': { title: 'Support', subtitle: 'Tickets & live chat', accent: 'var(--brand-yellow)' },
  '/devzone': { title: 'Dev Zone', subtitle: 'Ideas & roadmap', accent: 'var(--brand-yellow)' },
  '/finance': { title: 'Finance', subtitle: 'Revenue & billing', accent: 'var(--brand-yellow)' },
  '/tracks': { title: 'Tracks', subtitle: 'Library management', accent: 'var(--brand-yellow)' },
  '/subscribers': { title: 'Subscribers', subtitle: 'Early access & newsletter', accent: 'var(--brand-yellow)' },
}

// Search index — all navigable pages + keywords
const searchItems = [
  { href: '/', label: 'Dashboard', keywords: 'home overview metrics stats' },
  { href: '/ghost', label: 'Ghost', keywords: 'agent self-healing monitoring errors fixes' },
  { href: '/linus', label: 'Linus', keywords: 'ai dj agent conversations chat model' },
  { href: '/system', label: 'System', keywords: 'health infrastructure cpu memory disk postgres ollama' },
  { href: '/users', label: 'Users', keywords: 'accounts invite roles admin subscriber beta' },
  { href: '/support', label: 'Support', keywords: 'tickets help messages customer' },
  { href: '/tracks', label: 'Tracks', keywords: 'library music songs database metadata' },
  { href: '/devzone', label: 'Dev Zone', keywords: 'ideas kanban roadmap board development' },
  { href: '/finance', label: 'Finance', keywords: 'revenue billing subscriptions payments mrr' },
  { href: '/subscribers', label: 'Subscribers', keywords: 'email newsletter early access trial subscribers' },
]

interface Notification {
  id: string
  title: string
  message: string
  type: 'ghost' | 'system' | 'user' | 'support'
  time: string
  read: boolean
}

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  // Match exact path, or parent path for detail pages like /users/[id]
  const page = pageTitles[pathname]
    || Object.entries(pageTitles).find(([key]) => key !== '/' && pathname.startsWith(key + '/'))?.[1]
    || pageTitles['/']

  // Search
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Notifications
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const notifRef = useRef<HTMLDivElement>(null)

  // User menu + real user data
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [adminUser, setAdminUser] = useState<{ name: string; email: string; role: string } | null>(null)

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.user) setAdminUser({ name: data.user.name, email: data.user.email, role: data.user.role || 'admin' })
    }).catch(() => {})
  }, [])
  const userRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.read).length

  // ── Search logic ──────────────────────────────────────────
  const filteredSearch = searchQuery.trim()
    ? searchItems.filter(item => {
        const q = searchQuery.toLowerCase()
        return item.label.toLowerCase().includes(q) || item.keywords.includes(q)
      })
    : searchItems

  const openSearch = useCallback(() => {
    setSearchOpen(true)
    setSearchQuery('')
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
  }, [])

  const navigateTo = useCallback((href: string) => {
    router.push(href)
    closeSearch()
  }, [router, closeSearch])

  // ⌘K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchOpen ? closeSearch() : openSearch()
      }
      if (e.key === 'Escape' && searchOpen) closeSearch()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [searchOpen, openSearch, closeSearch])

  // ── Real notifications — poll dashboard for activity ──────
  const fetchNotifications = useCallback(async () => {
    try {
      const [dashRes, sysRes] = await Promise.all([
        fetch('/api/dashboard').then(r => r.ok ? r.json() : null),
        fetch('/api/system').then(r => r.ok ? r.json() : null),
      ])

      const notifs: Notification[] = []
      const now = new Date()

      // DB connectivity
      if (sysRes?.db?.connected === false) {
        notifs.push({ id: 'db-down', title: 'Database', message: 'PostgreSQL connection failed', type: 'system', time: 'Now', read: false })
      }

      // New users (in last 24h)
      if (dashRes?.recentUsers) {
        for (const u of dashRes.recentUsers) {
          const created = new Date(u.created_at || u.last_active)
          if (now.getTime() - created.getTime() < 24 * 60 * 60 * 1000) {
            notifs.push({ id: `user-${u.id}`, title: 'New User', message: `${u.name || u.email} signed up`, type: 'user', time: timeAgo(created), read: false })
          }
        }
      }

      // Recent tracks (in last hour)
      if (dashRes?.recentTracks) {
        const recentCount = dashRes.recentTracks.filter((t: { created_at: string }) =>
          now.getTime() - new Date(t.created_at).getTime() < 60 * 60 * 1000
        ).length
        if (recentCount > 0) {
          notifs.push({ id: 'tracks-recent', title: 'Library', message: `${recentCount} track${recentCount > 1 ? 's' : ''} added recently`, type: 'system', time: 'Last hour', read: false })
        }
      }

      // Stats summary
      if (dashRes?.totalUsers !== undefined) {
        notifs.push({ id: 'stats', title: 'System', message: `${dashRes.totalUsers} users, ${dashRes.totalTracks} tracks, ${dashRes.activeSessions} active sessions`, type: 'system', time: 'Now', read: true })
      }

      setNotifications(notifs)
    } catch {
      // Silently fail — notifications are non-critical
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [fetchNotifications])

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  const dismissNotif = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id))

  const handleSignOut = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' })
    router.push('/auth/signin')
    router.refresh()
  }

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUserMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const typeColors: Record<string, string> = {
    ghost: 'var(--ghost-purple)',
    system: 'var(--system-blue)',
    user: 'var(--brand-yellow)',
    support: 'var(--status-amber)',
  }

  const typeIcons: Record<string, React.ReactNode> = {
    ghost: <Ghost size={10} />,
    system: <Server size={10} />,
    user: <Users size={10} />,
    support: <Headset size={10} />,
  }

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="flex items-center justify-between px-4 md:px-8 py-3"
        style={{ borderBottom: '1px solid var(--border-primary)' }}
      >
        {/* Title */}
        <div>
          <h2 className="text-base md:text-lg font-semibold tracking-tight" style={{ color: page.accent }}>
            {page.title}
          </h2>
          <p className="text-[10px] md:text-[11px] mt-0.5 hidden sm:block" style={{ color: 'var(--text-tertiary)' }}>
            {page.subtitle}
          </p>
        </div>

        {/* Actions — compact */}
        <div className="flex items-center gap-1.5">
          {/* Search trigger */}
          <button
            onClick={openSearch}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] cursor-pointer transition-colors"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', color: 'var(--text-tertiary)' }}
          >
            <Search size={12} />
            <span>Search</span>
            <kbd className="ml-3 px-1 py-0.5 rounded text-[9px]"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)', fontFamily: 'var(--font-mono)' }}>
              ⌘K
            </kbd>
          </button>

          {/* Mobile search */}
          <button onClick={openSearch} className="md:hidden p-2 rounded-lg"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)' }}>
            <Search size={14} style={{ color: 'var(--text-secondary)' }} />
          </button>

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false) }}
              className="relative p-2 rounded-lg transition-colors"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)' }}
            >
              <Bell size={14} style={{ color: 'var(--text-secondary)' }} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                  style={{ background: 'var(--status-red)', color: 'white' }}>
                  {unreadCount}
                </span>
              )}
            </button>

            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-72 rounded-xl overflow-hidden z-50"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
                >
                  <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>Notifications</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-[9px]" style={{ color: 'var(--brand-yellow)' }}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-[11px] text-center py-6" style={{ color: 'var(--text-tertiary)' }}>No notifications</p>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className="flex items-start gap-2.5 px-3 py-2.5 transition-colors group"
                          style={{ background: n.read ? 'transparent' : 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-primary)' }}>
                          <div className="w-5 h-5 rounded-md flex items-center justify-center mt-0.5 shrink-0"
                            style={{ background: `${typeColors[n.type]}20`, color: typeColors[n.type] }}>
                            {typeIcons[n.type]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>{n.title}</p>
                            <p className="text-[10px] leading-snug" style={{ color: 'var(--text-tertiary)' }}>{n.message}</p>
                            <p className="text-[9px] mt-0.5 font-mono" style={{ color: 'var(--text-tertiary)' }}>{n.time}</p>
                          </div>
                          <button onClick={() => dismissNotif(n.id)} className="opacity-0 group-hover:opacity-100 p-0.5"
                            style={{ color: 'var(--text-tertiary)' }}>
                            <X size={10} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User avatar + menu */}
          <div className="relative" ref={userRef}>
            <button
              onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false) }}
              title={adminUser ? `${adminUser.name} — ${adminUser.role}` : 'User'}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold cursor-pointer"
              style={{ background: 'var(--brand-yellow-dim)', color: 'var(--brand-yellow)', border: '1px solid rgba(255, 255, 0, 0.2)' }}
            >
              {adminUser?.name?.charAt(0)?.toUpperCase() || '?'}
            </button>

            <AnimatePresence>
              {showUserMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-44 rounded-xl overflow-hidden z-50"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
                >
                  <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                    <p className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>{adminUser?.name || 'User'}</p>
                    <p className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>{adminUser?.email || adminUser?.role || 'Admin'}</p>
                  </div>
                  <button onClick={handleSignOut}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-[11px] transition-colors"
                    style={{ color: 'var(--status-red)' }}>
                    <LogOut size={12} />
                    Sign Out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.header>

      {/* ── Command palette (⌘K search) ──────────────────────── */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) closeSearch() }}
          >
            <motion.div
              initial={{ y: -20, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: -20, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-md rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
            >
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <Search size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && filteredSearch.length > 0) navigateTo(filteredSearch[0].href)
                    if (e.key === 'Escape') closeSearch()
                  }}
                  placeholder="Search pages..."
                  className="flex-1 bg-transparent border-none outline-none text-sm"
                  style={{ color: 'var(--text-primary)' }}
                />
                <kbd className="px-1.5 py-0.5 rounded text-[9px]"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-64 overflow-y-auto py-1">
                {filteredSearch.length === 0 ? (
                  <p className="text-[11px] text-center py-6" style={{ color: 'var(--text-tertiary)' }}>
                    No results for &ldquo;{searchQuery}&rdquo;
                  </p>
                ) : (
                  filteredSearch.map(item => {
                    const isActive = pathname === item.href
                    return (
                      <button
                        key={item.href}
                        onClick={() => navigateTo(item.href)}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors"
                        style={{
                          color: isActive ? 'var(--brand-yellow)' : 'var(--text-primary)',
                          background: isActive ? 'var(--bg-tertiary)' : 'transparent',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                        onMouseLeave={e => (e.currentTarget.style.background = isActive ? 'var(--bg-tertiary)' : 'transparent')}
                      >
                        <span className="text-[11px] font-medium">{item.label}</span>
                        {isActive && <span className="text-[9px] ml-auto" style={{ color: 'var(--text-tertiary)' }}>Current</span>}
                      </button>
                    )
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
