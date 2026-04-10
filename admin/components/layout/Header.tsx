'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Search, LogOut, X } from 'lucide-react'
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
}

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
  const page = pageTitles[pathname] || pageTitles['/']
  const [showNotifications, setShowNotifications] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([
    { id: '1', title: 'Ghost', message: 'Self-healing agent deployed and monitoring', type: 'ghost', time: 'Just now', read: false },
    { id: '2', title: 'System', message: 'All services running on KVM4', type: 'system', time: '5m ago', read: false },
  ])
  const notifRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.read).length

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const dismissNotif = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

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

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5"
      style={{ borderBottom: '1px solid var(--border-primary)' }}
    >
      {/* Title */}
      <div>
        <h2 className="text-lg md:text-xl font-semibold tracking-tight" style={{ color: page.accent }}>
          {page.title}
        </h2>
        <p className="text-[11px] md:text-xs mt-0.5 hidden sm:block" style={{ color: 'var(--text-tertiary)' }}>
          {page.subtitle}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Search — hidden on mobile */}
        <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl text-sm cursor-pointer"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', color: 'var(--text-tertiary)' }}>
          <Search size={14} />
          <span>Search...</span>
          <kbd className="ml-6 px-1.5 py-0.5 rounded text-[10px]"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)', fontFamily: 'var(--font-mono)' }}>
            ⌘K
          </kbd>
        </div>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false) }}
            className="relative p-2.5 rounded-xl transition-colors"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)' }}
          >
            <Bell size={16} style={{ color: 'var(--text-secondary)' }} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
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
                className="absolute right-0 top-full mt-2 w-80 rounded-2xl overflow-hidden z-50"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
              >
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-[10px]" style={{ color: 'var(--brand-yellow)' }}>
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-center py-8" style={{ color: 'var(--text-tertiary)' }}>No notifications</p>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className="flex items-start gap-3 px-4 py-3 transition-colors group"
                        style={{ background: n.read ? 'transparent' : 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-primary)' }}>
                        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: typeColors[n.type] }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{n.title}</p>
                          <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{n.message}</p>
                          <p className="text-[10px] mt-1 font-mono" style={{ color: 'var(--text-tertiary)' }}>{n.time}</p>
                        </div>
                        <button onClick={() => dismissNotif(n.id)} className="opacity-0 group-hover:opacity-100 p-1"
                          style={{ color: 'var(--text-tertiary)' }}>
                          <X size={12} />
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
            className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold cursor-pointer"
            style={{ background: 'var(--brand-yellow-dim)', color: 'var(--brand-yellow)', border: '1px solid rgba(255, 255, 0, 0.2)' }}
          >
            DJ
          </button>

          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-48 rounded-xl overflow-hidden z-50"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
              >
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>DJ Bodhi</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>dj@videodj.studio</p>
                </div>
                <button onClick={handleSignOut}
                  className="flex items-center gap-2 w-full px-4 py-3 text-xs transition-colors"
                  style={{ color: 'var(--status-red)' }}>
                  <LogOut size={14} />
                  Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.header>
  )
}
