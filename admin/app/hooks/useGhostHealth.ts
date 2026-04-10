'use client'

import { useState, useEffect, useCallback } from 'react'

interface GhostHealth {
  status: 'green' | 'amber' | 'red'
  uptime: number
  timestamp: string
  activeConnections: number
  knowledgeBaseSize: number
  recentFixes: number
  pendingAnalysis: number
}

const GHOST_URL = process.env.NEXT_PUBLIC_GHOST_URL || 'https://ghost.videodj.studio'

export function useGhostHealth(interval = 10000) {
  const [health, setHealth] = useState<GhostHealth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${GHOST_URL}/health`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Ghost Server returned ${res.status}`)
      const data = await res.json()
      setHealth(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ghost Server unreachable')
      setHealth(prev => prev ? { ...prev, status: 'red' } : null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const timer = setInterval(fetchHealth, interval)
    return () => clearInterval(timer)
  }, [fetchHealth, interval])

  return { health, error, loading, refetch: fetchHealth }
}
