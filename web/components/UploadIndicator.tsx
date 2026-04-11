'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Cloud, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import * as syncEngine from '@/app/lib/syncEngine'

export default function UploadIndicator() {
  const [progress, setProgress] = useState({ active: 0, queued: 0, completed: 0, failed: 0, currentFiles: [] as string[] })
  const [expanded, setExpanded] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const unsubscribe = syncEngine.onStatusChange((s) => {
      const { uploading } = s
      setProgress(syncEngine.getUploadProgress())
      setVisible(uploading.current > 0 || uploading.failed > 0)
    })
    return () => { unsubscribe() }
  }, [])

  if (!visible) return null

  const totalDone = progress.completed
  const totalAll = progress.completed + progress.queued + progress.active

  return (
    <div style={{
      background: '#0d0d18',
      borderTop: '2px solid #ffff0030',
      padding: 0,
    }}>
      {/* Header bar — always visible when uploading */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', background: 'rgba(255,255,0,0.03)', border: 'none',
          cursor: 'pointer', color: '#e0e0f0',
        }}
      >
        <Cloud size={16} color="#ffff00" />
        <span style={{ fontSize: 12, fontWeight: 700, flex: 1, textAlign: 'left' }}>
          Uploading {totalDone}/{totalAll}
        </span>
        {progress.failed > 0 && (
          <span style={{ fontSize: 9, color: '#ef4444' }}>{progress.failed} failed</span>
        )}
        {expanded ? <ChevronDown size={12} color="#555570" /> : <ChevronUp size={12} color="#555570" />}
      </button>

      {/* Progress bar */}
      <div style={{ height: 2, background: '#1a1a2e', margin: '0 12px' }}>
        <motion.div
          style={{ height: '100%', background: '#ffff00', borderRadius: 1 }}
          animate={{ width: `${totalAll > 0 ? (totalDone / totalAll) * 100 : 0}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Expanded file list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ maxHeight: 200, overflowY: 'auto', padding: '4px 0' }}
          >
            {/* Currently uploading */}
            {progress.currentFiles.map(name => (
              <div key={name} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '3px 12px', fontSize: 10, color: '#ffff00',
              }}>
                <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name.replace(/\.(mp4|mkv|avi|mov|webm|m4v)$/i, '')}
                </span>
              </div>
            ))}
            {progress.queued > 0 && (
              <div style={{ padding: '3px 12px', fontSize: 9, color: '#333348' }}>
                {progress.queued} more in queue...
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
