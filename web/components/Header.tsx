'use client'
import { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SettingsIcon } from '@/components/ui/settings'
import { Flag, Headphones, Volume2, Check, User, LogOut } from 'lucide-react'
import { type AudioOutputDevice } from '@/app/lib/audioDevices'
import HelpWidget from '@/components/HelpWidget'

interface HeaderProps {
  languageFilter: string | null
  onOpenSetup: () => void
  onOpenStream?: () => void
  isLive?: boolean
  audioDevices: AudioOutputDevice[]
  hasHeadphones: boolean
  selectedAudioDevice: string
  onSelectAudioDevice: (deviceId: string) => void
  userName?: string
  userEmail?: string
  userAvatar?: string
}

export function Header({ languageFilter, onOpenSetup, onOpenStream, isLive, audioDevices: devices, hasHeadphones, selectedAudioDevice, onSelectAudioDevice, userName, userEmail, userAvatar }: HeaderProps) {
  const [showDeviceMenu, setShowDeviceMenu] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const deviceMenuRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Close device menu on outside click
  useEffect(() => {
    if (!showDeviceMenu) return
    function handleClick(e: MouseEvent) {
      if (deviceMenuRef.current && !deviceMenuRef.current.contains(e.target as Node)) {
        setShowDeviceMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showDeviceMenu])

  // Close user menu on outside click
  useEffect(() => {
    if (!showUserMenu) return
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showUserMenu])

  return (
    <motion.header
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 30 }}
      className="app-drag-region"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', background: '#0d0d16', borderBottom: '1px solid #2a2a3e',
        flexShrink: 0, height: 54, gap: 16,
      }}
    >
      <style>{`.app-drag-region{-webkit-app-region:drag}.app-no-drag{-webkit-app-region:no-drag}`}</style>
      {/* Left — help + filter badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }} className="app-no-drag">
        <HelpWidget userEmail={userEmail} userName={userName} />
        <AnimatePresence>
          {languageFilter === 'nl' && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 999,
                background: 'rgba(255,255,0,0.06)', border: '1px solid rgba(255,255,0,0.25)',
                color: '#ffff00', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
              }}
            >
              <Flag size={10} />
              NL Filter Active
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Center — logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <motion.div whileHover={{ scale: 1.12, rotate: 10 }} whileTap={{ scale: 0.95 }} transition={{ type: 'spring', stiffness: 320 }}
          className="app-no-drag"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="videoDJ.Studio logo" width={26} height={30} />
        </motion.div>
        <div>
          <div style={{ fontWeight: 900, fontSize: 17, letterSpacing: '-0.5px', lineHeight: 1 }}>
            video<span style={{ color: '#ffff00' }}>DJ</span>.Studio
          </div>
          <div style={{ fontSize: 9, color: '#555570', fontFamily: 'var(--font-mono)', marginTop: 1, letterSpacing: 1 }}>v1.0.5</div>
        </div>
      </div>

      {/* Right — stream + settings */}
      <div className="app-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flex: 1, justifyContent: 'flex-end' }}>
        <motion.button
          onClick={onOpenStream}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 10,
            color: isLive ? '#ef4444' : '#555570',
            fontFamily: 'var(--font-mono)', letterSpacing: 1,
            background: isLive ? 'rgba(239,68,68,0.1)' : 'transparent',
            border: isLive ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent',
            borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
          }}
        >
          <motion.div style={{ width: 6, height: 6, borderRadius: '50%', background: isLive ? '#ef4444' : '#555570' }}
            animate={isLive ? { opacity: [1, 0.25, 1] } : {}} transition={{ duration: 1, repeat: Infinity }}/>
          {isLive ? 'LIVE' : 'STREAM'}
        </motion.button>

        {/* Headphone / audio output selector */}
        <div style={{ position: 'relative' }} ref={deviceMenuRef}>
          <motion.button
            onClick={() => setShowDeviceMenu(prev => !prev)}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            title={hasHeadphones
              ? (selectedAudioDevice ? 'Headphones active — click to change' : 'Headphones detected — click to select')
              : 'Audio output — click to select device'}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
              display: 'flex', alignItems: 'center',
              color: (hasHeadphones || selectedAudioDevice) ? '#4ade80' : '#555570',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={e => { if (!hasHeadphones && !selectedAudioDevice) (e.currentTarget as HTMLButtonElement).style.color = '#ffff00' }}
            onMouseLeave={e => { if (!hasHeadphones && !selectedAudioDevice) (e.currentTarget as HTMLButtonElement).style.color = '#555570' }}
          >
            <Headphones size={17} />
          </motion.button>

          <AnimatePresence>
            {showDeviceMenu && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                transition={{ duration: 0.12 }}
                style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 8,
                  background: '#16162a', border: '1px solid #2a2a4e',
                  borderRadius: 8, padding: 4, zIndex: 200, minWidth: 240,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                }}
              >
                <div style={{ padding: '6px 10px', fontSize: 8, color: '#555', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Audio Output Device
                </div>
                {devices.length === 0 && (
                  <div style={{ padding: '8px 10px', fontSize: 10, color: '#666' }}>No devices found</div>
                )}
                {devices.map(device => {
                  const isSelected = selectedAudioDevice === device.deviceId || (!selectedAudioDevice && device.isDefault)
                  return (
                    <button
                      key={device.deviceId}
                      onClick={() => {
                        onSelectAudioDevice(device.deviceId === 'default' ? '' : device.deviceId)
                        setShowDeviceMenu(false)
                      }}
                      style={{
                        width: '100%', padding: '7px 10px', border: 'none',
                        background: isSelected ? 'rgba(74,222,128,0.08)' : 'transparent',
                        borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: 10,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                    >
                      {device.isHeadphone
                        ? <Headphones size={14} color={isSelected ? '#4ade80' : '#888'} style={{ flexShrink: 0 }} />
                        : <Volume2 size={14} color={isSelected ? '#4ade80' : '#666'} style={{ flexShrink: 0 }} />
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 11, fontWeight: 600,
                          color: isSelected ? '#4ade80' : '#ccc',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {device.label}
                        </div>
                        {device.isDefault && (
                          <div style={{ fontSize: 8, color: '#555', marginTop: 1 }}>System default</div>
                        )}
                      </div>
                      {isSelected && <Check size={12} color="#4ade80" style={{ flexShrink: 0 }} />}
                    </button>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.button onClick={onOpenSetup} whileHover={{ scale: 1.08, rotate: 22 }} whileTap={{ scale: 0.92 }}
          title="Open settings / video library"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#555570', padding: 4, display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#ffff00')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#555570')}>
          <SettingsIcon size={17} />
        </motion.button>

        {/* User avatar */}
        {userName && (
          <div style={{ position: 'relative' }} ref={userMenuRef}>
            <motion.button
              onClick={() => setShowUserMenu(prev => !prev)}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              style={{
                width: 28, height: 28, borderRadius: 8,
                background: userAvatar ? 'transparent' : 'rgba(255,255,0,0.1)',
                border: '1px solid rgba(255,255,0,0.2)',
                color: '#ffff00', fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', overflow: 'hidden', padding: 0,
              }}
            >
              {userAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : userName.charAt(0).toUpperCase()}
            </motion.button>

            <AnimatePresence>
              {showUserMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.95 }}
                  transition={{ duration: 0.12 }}
                  style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 8,
                    background: '#16162a', border: '1px solid #2a2a4e',
                    borderRadius: 10, padding: 4, zIndex: 200, minWidth: 180,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                  }}
                >
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid #2a2a4e' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#e0e0f0' }}>{userName}</div>
                    <div style={{ fontSize: 9, color: '#555570' }}>{userEmail}</div>
                  </div>
                  <a href="/profile" style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', fontSize: 11, color: '#e0e0f0',
                    textDecoration: 'none', borderRadius: 6,
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <User size={13} /> My Profile
                  </a>
                  <button onClick={async () => {
                    await fetch('/api/auth/session', { method: 'DELETE' })
                    window.location.href = '/login'
                  }} style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '8px 12px', fontSize: 11, color: '#ef4444',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    borderRadius: 6, textAlign: 'left',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.05)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <LogOut size={13} /> Sign Out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.header>
  )
}
