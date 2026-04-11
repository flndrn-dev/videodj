'use client'

import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Cloud, CloudOff } from 'lucide-react'
import * as syncEngine from '@/app/lib/syncEngine'

export default function UploadIndicator() {
  const [current, setCurrent] = useState(0)
  const [total, setTotal] = useState(0)
  const [failed, setFailed] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const unsubscribe = syncEngine.onStatusChange((status) => {
      const { uploading } = status
      setCurrent(uploading.current)
      setTotal(uploading.total)
      setFailed(uploading.failed)
      setVisible(uploading.current > 0 || uploading.failed > 0)
    })
    return () => { unsubscribe() }
  }, [])

  const progress = total > 0 ? ((total - current) / total) * 100 : 0

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed',
            top: 60,
            left: 12,
            zIndex: 50,
            background: 'rgba(10, 10, 20, 0.92)',
            border: '1px solid #1a1a2e',
            borderRadius: 10,
            padding: '10px 14px',
            minWidth: 200,
            maxWidth: 280,
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: current > 0 ? 8 : 0 }}>
            {failed > 0 && current === 0 ? (
              <CloudOff size={16} color="#ef4444" />
            ) : (
              <Cloud size={16} color="#ffff00" />
            )}
            <span style={{ color: '#e0e0f0', fontSize: 13, fontWeight: 500 }}>
              {current > 0
                ? `Uploading ${total - current + 1}/${total}...`
                : failed > 0
                  ? `${failed} upload${failed > 1 ? 's' : ''} failed`
                  : null}
            </span>
          </div>

          {current > 0 && (
            <div
              style={{
                width: '100%',
                height: 4,
                background: '#1a1a2e',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <motion.div
                style={{
                  height: '100%',
                  background: '#ffff00',
                  borderRadius: 2,
                }}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
          )}

          {failed > 0 && current > 0 && (
            <div style={{ color: '#ef4444', fontSize: 11, marginTop: 6 }}>
              {failed} failed
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
