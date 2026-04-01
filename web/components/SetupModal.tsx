'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XIcon } from '@/components/ui/x'
import { FolderOpenIcon } from '@/components/ui/folder-open'
import { SparklesIcon } from '@/components/ui/sparkles'
import { CircleCheckIcon } from '@/components/ui/circle-check'
import { Film, AlertCircle } from 'lucide-react'
import type { Track } from '@/app/hooks/usePlayerStore'
import { saveTracks, loadAllTracks } from '@/app/lib/db'
import { extractVideoMetadata } from '@/app/lib/extractMetadata'

const VIDEO_EXTENSIONS = /\.(mp4|mkv|avi|mov|webm|m4v)$/i

interface SetupModalProps {
  onClose: () => void
  onLibraryLoaded: (t: Track[]) => void
  onAgentConnected?: () => void
}

export function SetupModal({ onClose, onLibraryLoaded, onAgentConnected }: SetupModalProps) {
  const [scanning, setScanning] = useState(false)
  const [scanCount, setScanCount] = useState(0)
  const [scanDone, setScanDone] = useState(false)
  const [error, setError] = useState('')

  // AI Agent connection state
  const [agentStatus, setAgentStatus] = useState<'unknown' | 'checking' | 'connected' | 'error'>('unknown')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyMasked, setApiKeyMasked] = useState('')
  const [agentError, setAgentError] = useState('')

  // Check existing connection on mount
  useEffect(() => {
    fetchAgentStatus()
  }, [])

  async function fetchAgentStatus() {
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      if (data.hasApiKey) {
        setAgentStatus('connected')
        setApiKeyMasked(data.apiKeyMasked)
      } else {
        setAgentStatus('unknown')
      }
    } catch {
      setAgentStatus('unknown')
    }
  }

  async function handleSaveApiKey() {
    const key = apiKeyInput.trim()
    if (!key) return
    setAgentStatus('checking')
    setAgentError('')

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CLAUDE_API_KEY: key, AGENT_PROVIDER: 'claude' }),
      })
      const data = await res.json()

      if (data.connected) {
        setAgentStatus('connected')
        setApiKeyMasked(`${key.slice(0, 12)}...${key.slice(-4)}`)
        setApiKeyInput('')
        onAgentConnected?.()
      } else {
        setAgentStatus('error')
        setAgentError(data.error || 'Could not connect. Check your API key.')
      }
    } catch {
      setAgentStatus('error')
      setAgentError('Network error. Try again.')
    }
  }

  async function handleDisconnect() {
    setAgentStatus('checking')
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CLAUDE_API_KEY: 'your-api-key-here', AGENT_PROVIDER: 'mock' }),
      })
      setAgentStatus('unknown')
      setApiKeyMasked('')
      setApiKeyInput('')
      setAgentError('')
    } catch {
      setAgentStatus('unknown')
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  // Process a list of Files into tracks and persist to IndexedDB
  async function processFiles(files: File[]) {
    setScanning(true)
    setScanCount(0)

    const items: { track: Track; blob: Blob }[] = []
    let idCounter = Date.now()

    for (const file of files) {
      if (VIDEO_EXTENSIONS.test(file.name)) {
        const videoUrl = URL.createObjectURL(file)
        const name = file.name.replace(VIDEO_EXTENSIONS, '')

        // Extract duration + thumbnail from video
        const meta = await extractVideoMetadata(file)

        const track: Track = {
          id: String(idCounter++),
          title: meta.artist ? name : name, // keep filename as title
          artist: meta.artist,
          album: meta.album,
          remixer: '',
          genre: meta.genre,
          language: meta.language,
          bpm: meta.bpm,
          key: meta.key,
          released: '',
          duration: meta.duration,
          timesPlayed: 0,
          thumbnail: meta.thumbnail,
          file: file.name,
          videoUrl,
        }
        items.push({ track, blob: file })
        setScanCount(items.length)
      }
    }

    // Load existing library to detect duplicates by filename
    const existing = await loadAllTracks()
    const existingFiles = new Set(existing.map(t => t.file?.toLowerCase()))

    // Filter out duplicates
    const newItems = items.filter(i => !existingFiles.has(i.track.file?.toLowerCase()))
    const skipped = items.length - newItems.length

    // Save only new tracks to IndexedDB (append, don't clear)
    if (newItems.length > 0) {
      await saveTracks(newItems)
    }

    // Merge: existing + new
    const newTracks = newItems.map(i => i.track)
    const merged = [...existing, ...newTracks]
    setScanCount(newItems.length)
    setScanning(false)
    setScanDone(true)
    if (skipped > 0) {
      console.log(`[upload] Skipped ${skipped} duplicate(s)`)
    }
    onLibraryLoaded(merged)
  }

  // Folder picker — tries File System Access API, falls back to input[webkitdirectory]
  async function handleSelectFolder() {
    setError('')

    // Method 1: File System Access API (Chromium only)
    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        const dir = await (window as any).showDirectoryPicker({ mode: 'read' })
        setScanning(true)
        setScanCount(0)

        const files: File[] = []

        async function scan(handle: FileSystemDirectoryHandle) {
          for await (const entry of (handle as any).values()) {
            if (entry.kind === 'file' && VIDEO_EXTENSIONS.test(entry.name)) {
              const file: File = await entry.getFile()
              files.push(file)
              setScanCount(files.length)
            } else if (entry.kind === 'directory') {
              await scan(entry)
            }
          }
        }

        await scan(dir)
        // processFiles handles IndexedDB persistence + onLibraryLoaded
        await processFiles(files)
        return
      } catch (e: unknown) {
        setScanning(false)
        if ((e as Error).name === 'AbortError') return
        // Fall through to input fallback
      }
    }

    // Method 2: Fallback — hidden input with webkitdirectory
    fileInputRef.current?.click()
  }

  // Handle files from the hidden input fallback (folder)
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    processFiles(Array.from(fileList))
  }

  // Select individual video files
  function handleSelectFiles() {
    videoInputRef.current?.click()
  }

  function handleVideoInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    processFiles(Array.from(fileList))
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 200,
      }}
    >
      {/* Hidden file input fallback for folder picker */}
      <input
        ref={fileInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is non-standard but widely supported
        webkitdirectory=""
        multiple
        onChange={handleInputChange}
        style={{ display: 'none' }}
        accept="video/*"
      />
      {/* Hidden file input for selecting individual video files */}
      <input
        ref={videoInputRef}
        type="file"
        multiple
        onChange={handleVideoInputChange}
        style={{ display: 'none' }}
        accept=".mp4,.mkv,.avi,.mov,.webm,.m4v,video/*"
      />

      <motion.div
        initial={{ scale: 0.82, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.82, y: 30 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        style={{
          background: '#12121e', border: '1px solid #2a2a3a', borderRadius: 20,
          padding: 36, width: 500, maxWidth: '95vw',
          boxShadow: '0 30px 80px rgba(0,0,0,0.8)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 900 }}>Settings</h2>
            <p style={{ fontSize: 12, color: '#6666aa', marginTop: 4 }}>Configure videoDJ.Studio</p>
          </div>
          <motion.button onClick={onClose} whileTap={{ scale: 0.9 }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6666aa' }}>
            <XIcon size={20} />
          </motion.button>
        </div>

        <AnimatePresence mode="wait">
          {scanning ? (
            <motion.div key="scanning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ textAlign: 'center', padding: '32px 0' }}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                style={{
                  width: 48, height: 48,
                  border: '3px solid rgba(255,255,0,0.15)', borderTop: '3px solid #ffff00',
                  borderRadius: '50%', margin: '0 auto 16px',
                }} />
              <p style={{ fontWeight: 600, fontSize: 14 }}>Scanning folder...</p>
              <p style={{ fontSize: 12, color: '#555570', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                {scanCount} videos found
              </p>
            </motion.div>
          ) : scanDone ? (
            <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ textAlign: 'center', padding: '16px 0' }}>
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.1 }}>
                <CircleCheckIcon size={48} style={{ color: '#00ff88', margin: '0 auto 12px' }} />
              </motion.div>
              <p style={{ fontSize: 18, fontWeight: 900 }}>Library loaded</p>
              <p style={{ fontSize: 12, color: '#6666aa', marginTop: 6 }}>{scanCount} videos ready</p>
              <motion.button onClick={onClose} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                style={{
                  marginTop: 20, padding: '10px 32px', borderRadius: 12,
                  background: 'linear-gradient(135deg, #ffff00, #cccc00)',
                  color: '#000', fontWeight: 800, fontSize: 14, border: 'none', cursor: 'pointer',
                }}>
                Start DJing
              </motion.button>
            </motion.div>
          ) : (
            <motion.div key="options" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* ── Section: Video Library ───────────────────────────── */}
              <div>
                <div style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 2, color: '#555570',
                  textTransform: 'uppercase', marginBottom: 10,
                }}>
                  Video Library
                </div>
                <motion.button onClick={handleSelectFolder} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                    padding: 16, borderRadius: 14, textAlign: 'left', cursor: 'pointer',
                    background: 'rgba(255,255,0,0.06)', border: '1px solid rgba(255,255,0,0.25)',
                  }}>
                  <FolderOpenIcon size={26} style={{ color: '#ffff00' }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#ffff00' }}>Select Video Folder</div>
                    <div style={{ fontSize: 11, color: '#6666aa', marginTop: 2 }}>
                      Browse your computer to choose a folder with music videos
                    </div>
                  </div>
                </motion.button>

                <motion.button onClick={handleSelectFiles} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                    padding: 16, borderRadius: 14, textAlign: 'left', cursor: 'pointer',
                    marginTop: 8,
                    background: '#1a1a2a', border: '1px solid #2a2a3a',
                  }}>
                  <Film size={26} color="#6666aa" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#e0e0f0' }}>Select Video Files</div>
                    <div style={{ fontSize: 11, color: '#6666aa', marginTop: 2 }}>
                      Pick individual .mp4, .mkv, .avi, .mov, .webm or .m4v files
                    </div>
                  </div>
                </motion.button>

                {error && (
                  <p style={{ marginTop: 8, fontSize: 11, color: '#ff6b6b', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={12} /> {error}
                  </p>
                )}
              </div>

              {/* ── Section: AI Agent (Linus) ────────────────────────── */}
              <div>
                <div style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 2, color: '#555570',
                  textTransform: 'uppercase', marginBottom: 10,
                }}>
                  Linus AI Agent
                </div>

                {agentStatus === 'connected' ? (
                  /* ── Connected state ─────────────────────────────── */
                  <div style={{
                    padding: 16, borderRadius: 14,
                    background: 'rgba(74,222,128,0.06)',
                    border: '1px solid rgba(74,222,128,0.25)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <CircleCheckIcon size={24} style={{ color: '#4ade80', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#4ade80' }}>
                          Connected
                        </div>
                        <div style={{ fontSize: 10, color: '#6666aa', marginTop: 3 }}>
                          Linus is using your Claude API subscription
                        </div>
                      </div>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                        background: 'rgba(74,222,128,0.12)', color: '#4ade80',
                        fontFamily: 'var(--font-mono)', letterSpacing: 0.5,
                      }}>
                        ACTIVE
                      </span>
                    </div>

                    {/* Masked API key display */}
                    <div style={{
                      marginTop: 12, padding: '8px 12px', borderRadius: 8,
                      background: '#14141f', border: '1px solid #2a2a3e',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <div>
                        <div style={{ fontSize: 8, color: '#555570', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>
                          API Key
                        </div>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#888' }}>
                          {apiKeyMasked}
                        </span>
                      </div>
                      <motion.button
                        onClick={handleDisconnect}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                          padding: '5px 12px', borderRadius: 6,
                          background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)',
                          color: '#f87171', fontSize: 10, fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Disconnect
                      </motion.button>
                    </div>
                  </div>
                ) : (
                  /* ── Not connected — API key input ───────────────── */
                  <div style={{
                    padding: 16, borderRadius: 14,
                    background: '#1a1a2a', border: '1px solid #2a2a3a',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <SparklesIcon size={24} style={{ color: '#ffff00', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#e0e0f0' }}>
                          Connect Linus
                        </div>
                        <div style={{ fontSize: 10, color: '#6666aa', marginTop: 2 }}>
                          Enter your Claude API key to enable the AI DJ agent
                        </div>
                      </div>
                    </div>

                    {/* API key input */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
                        placeholder="sk-ant-api03-..."
                        style={{
                          flex: 1, background: '#14141f', border: '1px solid #2a2a3e',
                          borderRadius: 8, padding: '8px 12px', color: '#e0e0f0',
                          fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none',
                        }}
                      />
                      <motion.button
                        onClick={handleSaveApiKey}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        disabled={agentStatus === 'checking' || !apiKeyInput.trim()}
                        style={{
                          padding: '8px 16px', borderRadius: 8,
                          background: apiKeyInput.trim() ? 'linear-gradient(135deg, #ffff00, #cccc00)' : '#2a2a3e',
                          color: apiKeyInput.trim() ? '#000' : '#555570',
                          fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer',
                          opacity: agentStatus === 'checking' ? 0.5 : 1,
                        }}
                      >
                        {agentStatus === 'checking' ? 'Testing...' : 'Connect'}
                      </motion.button>
                    </div>

                    {/* Help link */}
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <a
                        href="https://console.anthropic.com/settings/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 10, color: '#ffff00', textDecoration: 'none' }}
                      >
                        Get your API key &rarr;
                      </a>
                      <span style={{ fontSize: 9, color: '#555570' }}>
                        Without a key, Linus runs in demo mode
                      </span>
                    </div>

                    {/* Error message */}
                    {agentError && (
                      <div style={{
                        marginTop: 8, padding: '8px 12px', borderRadius: 8,
                        background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
                      }}>
                        <p style={{ fontSize: 11, color: '#f87171' }}>
                          {agentError}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
