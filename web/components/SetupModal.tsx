'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XIcon } from '@/components/ui/x'
import type { XIconHandle } from '@/components/ui/x'

import { FolderOpenIcon } from '@/components/ui/folder-open'
import { SparklesIcon } from '@/components/ui/sparkles'
import { CircleCheckIcon } from '@/components/ui/circle-check'
import { Film, AlertCircle, Settings, Library, Bot, Tv, Radio, Info, Upload, Eye, EyeOff } from 'lucide-react'
import type { Track } from '@/app/hooks/usePlayerStore'
import { saveTracks, loadAllTracks, saveCountdownVideo, loadCountdownVideos, deleteCountdownVideo } from '@/app/lib/db'
import { extractVideoMetadata } from '@/app/lib/extractMetadata'
import * as scanManager from '@/app/lib/scanManager'

const VIDEO_EXTENSIONS = /\.(mp4|mkv|avi|mov|webm|m4v)$/i

interface SetupModalProps {
  onClose: () => void
  onLibraryLoaded: (t: Track[]) => void
  onAgentConnected?: () => void
}

// ---------------------------------------------------------------------------
// Tab types
// ---------------------------------------------------------------------------

type TabId = 'general' | 'library' | 'agent' | 'twitch' | 'stream' | 'about'

const TABS: { id: TabId; label: string; icon: typeof Settings }[] = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'agent', label: 'AI Agent', icon: Bot },
  { id: 'twitch', label: 'Twitch', icon: Tv },
  { id: 'stream', label: 'Stream', icon: Radio },
  { id: 'about', label: 'About', icon: Info },
]

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SetupModal({ onClose, onLibraryLoaded, onAgentConnected }: SetupModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general')

  // Scanning state — backed by scanManager (survives modal close)
  const [scanState, setScanState] = useState(scanManager.getState())
  const [error, setError] = useState('')
  const scanning = scanState.scanning
  const scanCount = scanState.count
  const scanDone = scanState.phase === 'done' && !scanState.scanning
  const scanPhase = scanState.phase === 'done' ? 'saving' : scanState.phase
  const scanTotal = scanState.total
  const scanCurrent = scanState.current
  const scanCurrentFile = scanState.currentFile
  const scanStartTime = scanState.startTime

  useEffect(() => {
    // Reset scan state when modal opens — clears "Library loaded" from previous scan
    scanManager.reset()
    setScanState(scanManager.getState())
    scanManager.setOnComplete(onLibraryLoaded)
    const unsub = scanManager.onStateChange(setScanState)
    return unsub
  }, [onLibraryLoaded])

  // Agent state
  const [agentStatus, setAgentStatus] = useState<'unknown' | 'checking' | 'connected' | 'error'>('unknown')
  const [agentMode, setAgentMode] = useState<'subscription' | 'apikey'>('apikey')
  const [agentProvider, setAgentProvider] = useState('anthropic')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyMasked, setApiKeyMasked] = useState('')
  const [agentEndpoint, setAgentEndpoint] = useState('')
  const [agentModel, setAgentModel] = useState('')
  const [agentError, setAgentError] = useState('')
  const [showAgentKey, setShowAgentKey] = useState(false)
  const [agentFullKey, setAgentFullKey] = useState('')

  // Ollama state (separate from cloud API providers)
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://172.18.0.1:11434/v1/chat/completions')
  const [ollamaModel, setOllamaModel] = useState('qwen2.5-coder:14b')
  const [ollamaKey, setOllamaKey] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const closeIconRef = useRef<XIconHandle>(null)

  // Check agent connection on mount
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (data.mode) setAgentMode(data.mode)
        if (data.provider) setAgentProvider(data.provider)
        if (data.model) setAgentModel(data.model)
        if (data.endpoint) setAgentEndpoint(data.endpoint)
        if (data.hasApiKey) {
          setAgentStatus('connected')
          setApiKeyMasked(data.apiKeyMasked || '')
          setAgentFullKey(data.apiKeyFull || '')
        }
      })
      .catch(() => setAgentStatus('unknown'))
  }, [])

  // Provider defaults
  const providerDefaults: Record<string, { endpoint: string; model: string; label: string }> = {
    anthropic: { endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514', label: 'Anthropic (Claude)' },
    openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o', label: 'OpenAI' },
    xai: { endpoint: 'https://api.x.ai/v1/chat/completions', model: 'grok-3', label: 'xAI (Grok)' },
    deepseek: { endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', label: 'DeepSeek' },
    google: { endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.5-pro', label: 'Google (Gemini)' },
    ollama: { endpoint: 'http://187.124.64.116:11434', model: 'qwen2.5-coder:14b', label: 'Ollama (Qwen 2.5 Coder 14B)' },
    custom: { endpoint: '', model: '', label: 'Custom / Self-hosted' },
  }

  function handleProviderChange(p: string) {
    setAgentProvider(p)
    const def = providerDefaults[p]
    if (def) {
      setAgentEndpoint(def.endpoint)
      setAgentModel(def.model)
    }
  }

  async function handleSaveApiKey() {
    // Ollama doesn't require an API key — auto-fill with placeholder
    const isOllama = agentProvider === 'ollama'
    if (!isOllama && !apiKeyInput.trim()) return
    const keyToSend = isOllama && !apiKeyInput.trim() ? 'ollama-no-key-needed' : apiKeyInput.trim()
    setAgentStatus('checking')
    setAgentError('')
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          AGENT_MODE: agentMode,
          AGENT_PROVIDER: agentProvider,
          AGENT_API_KEY: keyToSend,
          AGENT_ENDPOINT: agentEndpoint,
          AGENT_MODEL: agentModel,
        }),
      })
      const data = await res.json()
      if (data.connected || data.saved) {
        setAgentStatus('connected')
        setAgentFullKey(keyToSend)
        setApiKeyMasked(isOllama ? 'No key needed (local)' : (apiKeyInput.slice(0, 8) + '...' + apiKeyInput.slice(-4)))
        setApiKeyInput('')
        onAgentConnected?.()
      } else {
        setAgentStatus('error')
        setAgentError(data.error || 'Connection failed')
      }
    } catch {
      setAgentStatus('error')
      setAgentError('Network error')
    }
  }

  async function handleConnectOllama() {
    if (!ollamaEndpoint.trim() || !ollamaModel.trim()) return
    setAgentStatus('checking')
    setAgentError('')
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          AGENT_MODE: 'apikey',
          AGENT_PROVIDER: 'ollama',
          AGENT_API_KEY: ollamaKey.trim() || 'ollama-no-key-needed',
          AGENT_ENDPOINT: ollamaEndpoint.trim(),
          AGENT_MODEL: ollamaModel.trim(),
        }),
      })
      const data = await res.json()
      if (data.connected || data.saved) {
        setAgentStatus('connected')
        setAgentProvider('ollama')
        setAgentModel(ollamaModel.trim())
        setAgentEndpoint(ollamaEndpoint.trim())
        setApiKeyMasked(ollamaKey.trim() ? `${ollamaKey.slice(0, 6)}...` : 'No key (local)')
        setAgentFullKey(ollamaKey.trim())
        onAgentConnected?.()
      } else {
        setAgentStatus('error')
        setAgentError(data.error || 'Could not connect to Ollama. Check the server is running.')
      }
    } catch {
      setAgentStatus('error')
      setAgentError('Network error reaching Ollama server')
    }
  }

  function handleDisconnect() {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ AGENT_API_KEY: '', AGENT_MODE: 'apikey', AGENT_PROVIDER: 'anthropic' }),
    }).catch(() => {})
    setAgentStatus('unknown')
    setApiKeyMasked('')
    setApiKeyInput('')
    setAgentProvider('anthropic')
    setAgentMode('apikey')
  }

  async function handleSelectFolder() {
    setError('')
    setActiveTab('library')
    const handled = await scanManager.selectFolder()
    if (!handled) {
      // showDirectoryPicker not available (Safari/Firefox) — fallback to file input
      fileInputRef.current?.click()
    }
  }

  function handleSelectFiles() { videoInputRef.current?.click() }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => e.target === e.currentTarget && !scanning && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 200,
      }}
    >
      {/* @ts-expect-error webkitdirectory is non-standard but widely supported */}
      <input ref={fileInputRef} type="file" webkitdirectory="" multiple onChange={e => e.target.files && scanManager.processFiles(Array.from(e.target.files))} style={{ display: 'none' }} accept="video/*" />
      <input ref={videoInputRef} type="file" multiple onChange={e => e.target.files && scanManager.processFiles(Array.from(e.target.files))} style={{ display: 'none' }} accept=".mp4,.mkv,.avi,.mov,.webm,.m4v,video/*" />

      <motion.div
        initial={{ scale: 0.82, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.82, y: 30 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        style={{
          background: '#12121e', border: '1px solid #2a2a3a', borderRadius: 20,
          width: 720, maxWidth: '95vw', height: 520, maxHeight: '90vh',
          boxShadow: '0 30px 80px rgba(0,0,0,0.8)',
          display: 'flex', overflow: 'hidden', position: 'relative',
        }}
      >
        {/* Top-right close button */}
        <button
          onClick={onClose}
          onMouseEnter={() => closeIconRef.current?.startAnimation()}
          onMouseLeave={() => closeIconRef.current?.stopAnimation()}
          style={{
            position: 'absolute', top: 10, right: 10, zIndex: 10,
            width: 28, height: 28, borderRadius: 6,
            border: 'none', cursor: 'pointer',
            background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#888', transition: 'all 0.15s',
          }}
          onMouseOver={e => { e.currentTarget.style.background = '#dc2626'; e.currentTarget.style.color = '#fff' }}
          onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888' }}
        >
          <XIcon ref={closeIconRef} size={14} />
        </button>

        {/* Left sidebar — tabs */}
        <div style={{
          width: 180, flexShrink: 0, borderRight: '1px solid #1a1a2e',
          display: 'flex', flexDirection: 'column', padding: '20px 0',
          background: '#0d0d16',
        }}>
          <div style={{ padding: '0 16px 16px', borderBottom: '1px solid #1a1a2e', marginBottom: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 900, margin: 0 }}>Settings</h2>
            <p style={{ fontSize: 9, color: '#555570', marginTop: 2 }}>Configure videoDJ.Studio</p>
          </div>

          {TABS.map(tab => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 16px', border: 'none', cursor: 'pointer',
                  background: active ? 'rgba(255,255,0,0.06)' : 'transparent',
                  borderLeft: `3px solid ${active ? '#ffff00' : 'transparent'}`,
                  color: active ? '#ffff00' : '#888',
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  textAlign: 'left', transition: 'all 0.15s',
                }}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}

          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              margin: '0 16px', padding: '8px 0', borderRadius: 8,
              background: 'transparent', border: '1px solid #2a2a3e',
              color: '#555570', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>

        {/* Right content panel */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
          <AnimatePresence mode="wait">
            {/* ── General ──────────────────────────────────────── */}
            {activeTab === 'general' && (
              <motion.div key="general" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                <h3 style={sectionTitle}>General</h3>
                <p style={{ fontSize: 11, color: '#555570', marginBottom: 16 }}>App-wide preferences</p>

                <div style={cardStyle}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#e0e0f0', marginBottom: 8 }}>Theme</div>
                  <p style={{ fontSize: 10, color: '#555570' }}>Dark mode is the default and only theme for now.</p>
                </div>

                <div style={{ ...cardStyle, marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#e0e0f0', marginBottom: 8 }}>Keyboard Shortcuts</div>
                  <p style={{ fontSize: 10, color: '#555570' }}>Space = Play/Pause active deck · Q/W = Cue deck A/B</p>
                </div>

                <div style={{ ...cardStyle, marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#e0e0f0', marginBottom: 8 }}>YouTube API</div>
                  <p style={{ fontSize: 10, color: '#555570', marginBottom: 10 }}>Used by Linus to search for music videos when you use /suggest or /lookup commands. Get a free key from the Google Cloud Console (YouTube Data API v3).</p>
                  <ApiKeyCard
                    label="YouTube Data API v3"
                    description="Used by Linus for /suggest and /lookup commands"
                    keyValue={localStorage.getItem('youtube_api_key') || ''}
                    placeholder="AIza..."
                    onSave={async (key) => {
                      localStorage.setItem('youtube_api_key', key)
                      await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ YOUTUBE_API_KEY: key }) })
                    }}
                    onDisconnect={() => {
                      localStorage.removeItem('youtube_api_key')
                      fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ YOUTUBE_API_KEY: '' }) })
                    }}
                    onTest={async () => {
                      const res = await fetch(`/api/lookup?action=youtube-search&q=${encodeURIComponent('test')}&limit=1`)
                      return res.ok
                    }}
                  />
                </div>
              </motion.div>
            )}

            {/* ── Library ──────────────────────────────────────── */}
            {activeTab === 'library' && (
              <motion.div key="library" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                <h3 style={sectionTitle}>Library</h3>

                {scanning ? (
                  <ScanProgress phase={scanPhase} total={scanTotal} current={scanCurrent} count={scanCount} currentFile={scanCurrentFile} startTime={scanStartTime} />
                ) : scanDone ? (
                  <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 350 }}>
                    <CircleCheckIcon size={40} style={{ color: '#00ff88', margin: '0 auto 10px' }} />
                    <p style={{ fontSize: 16, fontWeight: 900 }}>Library loaded</p>
                    <p style={{ fontSize: 11, color: '#555570', marginTop: 4 }}>{scanCount} new videos added</p>
                  </div>
                ) : (
                  <>
                    <motion.button onClick={handleSelectFolder} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                      style={{ ...cardStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', border: '1px solid rgba(255,255,0,0.25)', background: 'rgba(255,255,0,0.04)' }}>
                      <FolderOpenIcon size={22} style={{ color: '#ffff00', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#ffff00' }}>Select Video Folder</div>
                        <div style={{ fontSize: 10, color: '#555570', marginTop: 2 }}>Browse a folder with music videos</div>
                      </div>
                    </motion.button>

                    <motion.button onClick={handleSelectFiles} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                      style={{ ...cardStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', marginTop: 10 }}>
                      <Film size={22} color="#555570" style={{ flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#e0e0f0' }}>Select Video Files</div>
                        <div style={{ fontSize: 10, color: '#555570', marginTop: 2 }}>Pick individual .mp4, .mkv, .avi, .mov, .webm files</div>
                      </div>
                    </motion.button>

                    {error && <p style={{ marginTop: 8, fontSize: 11, color: '#ff6b6b', display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={12} /> {error}</p>}

                    {/* Import from DJ software */}
                    <DJImportSection onLibraryLoaded={onLibraryLoaded} />
                  </>
                )}
              </motion.div>
            )}

            {/* ── AI Agent ─────────────────────────────────────── */}
            {activeTab === 'agent' && (
              <motion.div key="agent" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                <h3 style={sectionTitle}>Linus AI Agent</h3>

                {agentStatus === 'connected' ? (
                  /* ── Connected state ── */
                  <div style={{ ...cardStyle, border: '1px solid rgba(74,222,128,0.25)', background: 'rgba(74,222,128,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <CircleCheckIcon size={22} style={{ color: '#4ade80', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#4ade80' }}>Connected</div>
                        <div style={{ fontSize: 10, color: '#555570', marginTop: 2 }}>
                          {providerDefaults[agentProvider]?.label || agentProvider} — {agentModel || 'default model'}
                        </div>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(74,222,128,0.12)', color: '#4ade80', fontFamily: 'var(--font-mono)' }}>ACTIVE</span>
                    </div>
                    {agentProvider === 'ollama' ? (
                      /* Ollama: show URL + Model */
                      <div style={{ marginTop: 12 }}>
                        <div style={{ padding: '8px 12px', borderRadius: 8, background: '#14141f', border: '1px solid #1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 8, color: '#555570', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>Ollama URL</div>
                            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#888' }}>{showAgentKey ? agentEndpoint : agentEndpoint.replace(/(\d+\.\d+)\.\d+\.\d+/, '$1.***')}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button onClick={() => setShowAgentKey(!showAgentKey)} title={showAgentKey ? 'Hide URL' : 'Show URL'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555570', padding: 2 }}>
                              {showAgentKey ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>
                        <div style={{ padding: '8px 12px', borderRadius: 8, background: '#14141f', border: '1px solid #1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: 8, color: '#555570', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>Model</div>
                            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#888' }}>{agentModel || 'qwen2.5-coder:14b'}</span>
                          </div>
                          <button onClick={() => { handleDisconnect(); setShowAgentKey(false); setAgentFullKey('') }} style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Disconnect</button>
                        </div>
                      </div>
                    ) : (
                      /* Other providers: show API Key */
                      <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: '#14141f', border: '1px solid #1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 8, color: '#555570', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>API Key</div>
                          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#888' }}>{showAgentKey && agentFullKey ? agentFullKey : apiKeyMasked}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button onClick={() => setShowAgentKey(!showAgentKey)} title={showAgentKey ? 'Hide key' : 'Show key'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555570', padding: 2 }}>
                            {showAgentKey ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button onClick={() => { handleDisconnect(); setShowAgentKey(false); setAgentFullKey('') }} style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Disconnect</button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── Connect form ── */
                  <>
                    <div style={cardStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                          <SparklesIcon size={22} style={{ color: '#ffff00', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#e0e0f0' }}>Connect with API Key</div>
                            <div style={{ fontSize: 10, color: '#555570', marginTop: 2 }}>Use any AI provider</div>
                          </div>
                        </div>

                        {/* Provider selector */}
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ fontSize: 8, color: '#555570', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>PROVIDER</label>
                          <select
                            value={agentProvider}
                            onChange={e => handleProviderChange(e.target.value)}
                            style={{
                              width: '100%', height: 32, background: '#14141f', border: '1px solid #2a2a3e',
                              borderRadius: 6, padding: '0 8px', color: '#e0e0f0', fontSize: 11, outline: 'none',
                              colorScheme: 'dark',
                            }}
                          >
                            <option value="anthropic">Anthropic (Claude)</option>
                            <option value="openai">OpenAI (GPT-4o, o1, etc.)</option>
                            <option value="xai">xAI (Grok)</option>
                            <option value="deepseek">DeepSeek</option>
                            <option value="google">Google (Gemini)</option>
                            <option value="custom">Custom / Self-hosted</option>
                          </select>
                        </div>

                        {/* API Key */}
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ fontSize: 8, color: '#555570', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>API KEY</label>
                          <PasswordInput
                            value={apiKeyInput}
                            onChange={e => setApiKeyInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveApiKey()}
                            placeholder={agentProvider === 'anthropic' ? 'sk-ant-api03-...' : agentProvider === 'openai' ? 'sk-...' : 'Enter API key'}
                            style={inputStyle}
                          />
                        </div>

                        {/* Model */}
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ fontSize: 8, color: '#555570', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>MODEL</label>
                          <input
                            value={agentModel}
                            onChange={e => setAgentModel(e.target.value)}
                            placeholder={providerDefaults[agentProvider]?.model || 'model-name'}
                            style={inputStyle}
                          />
                        </div>

                        {/* Endpoint (shown for custom, editable for all) */}
                        {agentProvider === 'custom' && (
                          <div style={{ marginBottom: 10 }}>
                            <label style={{ fontSize: 8, color: '#555570', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>ENDPOINT URL</label>
                            <input
                              value={agentEndpoint}
                              onChange={e => setAgentEndpoint(e.target.value)}
                              placeholder="https://your-server.com/v1/chat/completions"
                              style={inputStyle}
                            />
                          </div>
                        )}

                        {/* Connect button */}
                        <button
                          onClick={handleSaveApiKey}
                          disabled={agentStatus === 'checking' || !apiKeyInput.trim()}
                          style={{
                            width: '100%', padding: '10px 0', borderRadius: 8,
                            background: apiKeyInput.trim() ? '#ffff00' : '#2a2a3e',
                            color: apiKeyInput.trim() ? '#000' : '#555',
                            fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer',
                            opacity: agentStatus === 'checking' ? 0.5 : 1,
                          }}
                        >
                          {agentStatus === 'checking' ? 'Testing...' : 'Connect'}
                        </button>

                        <p style={{ fontSize: 9, color: '#555570', marginTop: 8, textAlign: 'center' }}>
                          Works with any OpenAI-compatible API endpoint
                        </p>
                      </div>

                    {/* Divider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
                      <div style={{ flex: 1, height: 1, background: '#1a1a2e' }} />
                      <span style={{ fontSize: 9, color: '#555570', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>OR</span>
                      <div style={{ flex: 1, height: 1, background: '#1a1a2e' }} />
                    </div>

                    {/* Self-hosted Ollama card */}
                    <div style={{ ...cardStyle, border: '1px solid rgba(168,139,250,0.2)', background: 'rgba(168,139,250,0.03)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(168,139,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <img src="/ollama-icon.svg" alt="Ollama" style={{ width: 18, height: 18 }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#a78bfa' }}>Connect with Ollama</div>
                          <div style={{ fontSize: 10, color: '#555570', marginTop: 2 }}>Self-hosted Qwen 2.5 Coder — no API key needed</div>
                        </div>
                        <span style={{ fontSize: 8, fontWeight: 700, padding: '3px 6px', borderRadius: 4, background: 'rgba(168,139,250,0.12)', color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>BETA</span>
                      </div>

                      {/* Endpoint */}
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 8, color: '#555570', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>SERVER ENDPOINT</label>
                        <input
                          value={ollamaEndpoint}
                          onChange={e => setOllamaEndpoint(e.target.value)}
                          placeholder="http://172.18.0.1:11434/v1/chat/completions"
                          style={inputStyle}
                        />
                      </div>

                      {/* Model */}
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 8, color: '#555570', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>MODEL</label>
                        <input
                          value={ollamaModel}
                          onChange={e => setOllamaModel(e.target.value)}
                          placeholder="qwen2.5-coder:14b"
                          style={inputStyle}
                        />
                      </div>

                      {/* API Key (optional, for KVM8 32B with Traefik auth) */}
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 8, color: '#555570', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>API KEY (OPTIONAL)</label>
                        <PasswordInput
                          value={ollamaKey}
                          onChange={e => setOllamaKey(e.target.value)}
                          placeholder="Leave empty for unauthenticated Ollama"
                          style={inputStyle}
                        />
                      </div>

                      {/* Connect button */}
                      <button
                        onClick={handleConnectOllama}
                        disabled={agentStatus === 'checking' || !ollamaEndpoint.trim() || !ollamaModel.trim()}
                        style={{
                          width: '100%', padding: '10px 0', borderRadius: 8,
                          background: ollamaEndpoint.trim() && ollamaModel.trim() ? '#a78bfa' : '#2a2a3e',
                          color: ollamaEndpoint.trim() && ollamaModel.trim() ? '#000' : '#555',
                          fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer',
                          opacity: agentStatus === 'checking' ? 0.5 : 1,
                        }}
                      >
                        {agentStatus === 'checking' ? 'Testing...' : 'Connect to Ollama'}
                      </button>

                      <p style={{ fontSize: 9, color: '#555570', marginTop: 8, textAlign: 'center' }}>
                        Currently: KVM4 (Qwen 14B) · Future: KVM8 (Qwen 32B)
                      </p>
                    </div>

                    {agentError && (
                      <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)' }}>
                        <p style={{ fontSize: 11, color: '#f87171', margin: 0 }}>{agentError}</p>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {/* ── Twitch ───────────────────────────────────────── */}
            {activeTab === 'twitch' && (
              <motion.div key="twitch" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                <h3 style={sectionTitle}>Twitch Streaming</h3>
                <TwitchSetupSection />
              </motion.div>
            )}

            {/* ── Stream ───────────────────────────────────────── */}
            {activeTab === 'stream' && (
              <motion.div key="stream" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                <h3 style={sectionTitle}>Stream Settings</h3>
                <StreamSettingsSection />
              </motion.div>
            )}

            {/* ── About ────────────────────────────────────────── */}
            {activeTab === 'about' && (
              <motion.div key="about" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} style={{ display: 'flex', flexDirection: 'column', minHeight: 420 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.svg" alt="videoDJ.Studio" width={48} height={48} style={{ margin: '0 auto 12px' }} />
                  <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>video<span style={{ color: '#ffff00' }}>DJ</span>.Studio</h2>
                  <p style={{ fontSize: 11, color: '#555570', marginTop: 4 }}>v1.0.2</p>
                  <p style={{ fontSize: 11, color: '#888', marginTop: 16, lineHeight: 1.6 }}>
                    AI-powered Video DJ & Auto-mixing application.<br />
                    Built for DJs who stream.
                  </p>
                  <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <a href="https://videodj.studio" target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#ffff00', textDecoration: 'none', padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(255,255,0,0.25)' }}>Website</a>
                    <a href="https://github.com/flndrn-dev/videodj" target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#888', textDecoration: 'none', padding: '6px 14px', borderRadius: 6, border: '1px solid #2a2a3e' }}>GitHub</a>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Scan Progress
// ---------------------------------------------------------------------------

/** Reusable password input with eye toggle */
function PasswordInput({ value, onChange, onKeyDown, placeholder, style }: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  style?: React.CSSProperties
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{ ...style, paddingRight: 32, width: '100%' }}
      />
      <button
        onClick={() => setVisible(!visible)}
        title={visible ? 'Hide' : 'Show'}
        tabIndex={-1}
        style={{
          position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', color: '#555570', padding: 4,
        }}
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

/** Reusable API key card — consistent connected/disconnected UI */
function ApiKeyCard({ label, description, keyValue, placeholder, onSave, onDisconnect, onTest }: {
  label: string
  description: string
  keyValue: string
  placeholder: string
  onSave: (key: string) => Promise<void>
  onDisconnect: () => void
  onTest?: (key: string) => Promise<boolean>
}) {
  const [key, setKey] = useState('')
  const [fullKey, setFullKey] = useState(keyValue || '')
  const [status, setStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>(keyValue ? 'connected' : 'idle')
  const [masked, setMasked] = useState(keyValue ? `${keyValue.slice(0, 8)}...${keyValue.slice(-4)}` : '')
  const [error, setError] = useState('')
  const [showKey, setShowKey] = useState(false)

  async function handleConnect() {
    if (!key.trim()) return
    setStatus('checking')
    setError('')
    try {
      await onSave(key.trim())
      if (onTest) {
        const ok = await onTest(key.trim())
        if (ok) {
          setStatus('connected')
          setFullKey(key.trim())
          setMasked(`${key.slice(0, 8)}...${key.slice(-4)}`)
          setKey('')
        } else {
          setStatus('error')
          setError('API test failed — check your key')
        }
      } else {
        setStatus('connected')
        setFullKey(key.trim())
        setMasked(`${key.slice(0, 8)}...${key.slice(-4)}`)
        setKey('')
      }
    } catch {
      setStatus('error')
      setError('Connection failed')
    }
  }

  if (status === 'connected') {
    return (
      <div style={{ background: 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <CircleCheckIcon size={18} style={{ color: '#4ade80', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#4ade80' }}>Connected</div>
            <div style={{ fontSize: 9, color: '#555570', marginTop: 1 }}>{label}</div>
          </div>
          <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(74,222,128,0.12)', color: '#4ade80', fontFamily: 'var(--font-mono)' }}>ACTIVE</span>
        </div>
        <div style={{ padding: '6px 10px', borderRadius: 6, background: '#14141f', border: '1px solid #1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 7, color: '#555570', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>API Key</div>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#888' }}>{showKey ? fullKey : masked}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setShowKey(!showKey)} title={showKey ? 'Hide key' : 'Show key'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555570', padding: 2 }}>
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button onClick={() => { onDisconnect(); setStatus('idle'); setMasked(''); setKey(''); setFullKey(''); setShowKey(false) }} style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171', fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>Disconnect</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: '#14141f', border: '1px solid #2a2a3e', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#e0e0f0', marginBottom: 2 }}>{label}</div>
      <p style={{ fontSize: 9, color: '#555570', marginBottom: 10 }}>{description}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <PasswordInput value={key} onChange={e => { setKey(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && handleConnect()} placeholder={placeholder} style={inputStyle} />
        <button onClick={handleConnect} disabled={!key.trim() || status === 'checking'} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: key.trim() ? '#ffff00' : '#2a2a3e', color: key.trim() ? '#000' : '#555', fontSize: 11, fontWeight: 700, flexShrink: 0, opacity: status === 'checking' ? 0.5 : 1 }}>
          {status === 'checking' ? 'Testing...' : 'Connect'}
        </button>
      </div>
      {error && <p style={{ fontSize: 9, color: '#ef4444', margin: '6px 0 0' }}>{error}</p>}
    </div>
  )
}

function ScanProgress({ phase, total, current, count, currentFile, startTime }: { phase: string; total: number; current: number; count: number; currentFile: string; startTime: number }) {
  // Calculate ETA
  let etaText = ''
  if (phase === 'processing' && current > 2 && total > 0 && startTime > 0) {
    const elapsed = (Date.now() - startTime) / 1000 // seconds
    const perFile = elapsed / current
    const remaining = Math.round(perFile * (total - current))
    if (remaining >= 60) {
      etaText = `~${Math.ceil(remaining / 60)} min remaining`
    } else if (remaining > 0) {
      etaText = `~${remaining}s remaining`
    } else {
      etaText = 'Almost done...'
    }
  }

  return (
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 350 }}>
      <div style={{ position: 'relative', width: 56, height: 56, margin: '0 auto 16px' }}>
        <svg width={56} height={56} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={28} cy={28} r={24} fill="none" stroke="rgba(255,255,0,0.1)" strokeWidth={3} />
          {phase !== 'finding' && total > 0 && (
            <circle cx={28} cy={28} r={24} fill="none" stroke="#ffff00" strokeWidth={3} strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 24} strokeDashoffset={2 * Math.PI * 24 * (1 - current / total)}
              style={{ transition: 'stroke-dashoffset 0.3s ease' }} />
          )}
        </svg>
        {phase !== 'finding' && total > 0 ? (
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#ffff00' }}>{Math.round((current / total) * 100)}%</span>
        ) : (
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} style={{ position: 'absolute', inset: 0, border: '3px solid rgba(255,255,0,0.15)', borderTop: '3px solid #ffff00', borderRadius: '50%' }} />
        )}
      </div>
      <p style={{ fontWeight: 600, fontSize: 14 }}>{phase === 'finding' ? 'Scanning folder...' : phase === 'saving' ? 'Saving to database...' : 'Processing files...'}</p>
      {phase === 'finding' ? (
        <p style={{ fontSize: 12, color: '#555570', marginTop: 6, fontFamily: 'var(--font-mono)' }}>{count} videos found</p>
      ) : (
        <>
          <p style={{ fontSize: 12, color: '#ffff00', marginTop: 6, fontFamily: 'var(--font-mono)' }}>{current} / {total} files</p>
          {currentFile && <p style={{ fontSize: 10, color: '#555570', marginTop: 4, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320, margin: '4px auto 0' }}>{currentFile}</p>}
          {etaText && <p style={{ fontSize: 10, color: '#888', marginTop: 6, fontFamily: 'var(--font-mono)' }}>{etaText}</p>}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Twitch Setup Section
// ---------------------------------------------------------------------------

interface ScheduleSegment {
  id: string
  start_time: string
  title: string
  duration?: string // minutes
}

function TwitchSetupSection() {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [twitchStatus, setTwitchStatus] = useState<'disconnected' | 'saving' | 'connected'>('disconnected')
  const [twitchUser, setTwitchUser] = useState('')
  const [twitchError, setTwitchError] = useState('')
  const [schedule, setSchedule] = useState<ScheduleSegment[]>([])
  const [, setTick] = useState(0) // force re-render every minute for status updates

  useEffect(() => {
    const token = localStorage.getItem('twitch_token')
    const username = localStorage.getItem('twitch_username')
    if (token && username) { setTwitchStatus('connected'); setTwitchUser(username) }
    // Load Twitch credentials from .env
    fetch('/api/settings').then(r => r.json()).then(data => {
      if (data.twitchClientId) setStoredClientId(data.twitchClientId)
      if (data.twitchClientSecret) setStoredSecret(data.twitchClientSecret)
    }).catch(() => {})
  }, [])

  // Fetch schedule when connected
  useEffect(() => {
    if (twitchStatus !== 'connected') return
    const token = localStorage.getItem('twitch_token')
    const broadcasterId = localStorage.getItem('twitch_user_id')
    if (!token || !broadcasterId) return

    // Load from localStorage first (always available, synced with Stream Preview)
    try {
      const saved = localStorage.getItem('dj_schedule')
      if (saved) setSchedule(JSON.parse(saved))
    } catch { /* ignore */ }

    // Then try Twitch API
    fetch('/api/twitch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-schedule', token, broadcasterId }),
    }).then(r => r.json()).then(data => {
      if (data.success && data.schedule?.segments) {
        setSchedule(prev => {
          const localIds = new Set(prev.map(s => s.id))
          const twitchEntries = data.schedule.segments
            .filter((s: ScheduleSegment) => !localIds.has(s.id))
            .map((s: ScheduleSegment) => ({ id: s.id, start_time: s.start_time, title: s.title, duration: s.duration }))
          return [...prev, ...twitchEntries]
        })
      }
    }).catch(() => {})
  }, [twitchStatus])

  // Tick every 30s to update stream status (live/upcoming/expired)
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  async function handleSave() {
    if (!clientId.trim() || !clientSecret.trim()) return
    setTwitchStatus('saving')
    setTwitchError('')
    try {
      const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ TWITCH_CLIENT_ID: clientId.trim(), TWITCH_CLIENT_SECRET: clientSecret.trim(), TWITCH_REDIRECT_URI: `${window.location.origin}/api/twitch` }) })
      const data = await res.json()
      if (data.connected !== undefined || data.saved) { localStorage.setItem('twitch_client_id', clientId.trim()); setStoredSecret(clientSecret.trim()); window.location.href = '/api/twitch?action=login' }
      else { setTwitchStatus('disconnected'); setTwitchError('Failed to save') }
    } catch { setTwitchStatus('disconnected'); setTwitchError('Network error') }
  }

  function handleDisconnect() {
    ['twitch_token', 'twitch_username', 'twitch_channel', 'twitch_stream_key', 'twitch_user_id'].forEach(k => localStorage.removeItem(k))
    setTwitchStatus('disconnected')
    setTwitchUser('')
  }

  // Get stream status for a schedule segment
  function getStreamStatus(seg: ScheduleSegment): 'upcoming' | 'live' | 'ended' {
    const now = Date.now()
    const start = new Date(seg.start_time).getTime()
    const durationMs = (parseInt(seg.duration || '120') || 120) * 60 * 1000
    const end = start + durationMs
    if (now >= start && now < end) return 'live'
    if (now >= end) return 'ended'
    return 'upcoming'
  }

  // Filter out ended streams
  const activeSchedule = schedule.filter(s => getStreamStatus(s) !== 'ended')

  const [showClientSecret, setShowClientSecret] = useState(false)
  const [storedSecret, setStoredSecret] = useState('')
  const [storedClientId, setStoredClientId] = useState('')

  return twitchStatus === 'connected' ? (
    <>
      <div style={{ ...cardStyle, border: '1px solid rgba(145,70,255,0.25)', background: 'rgba(145,70,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <CircleCheckIcon size={18} style={{ color: '#9146FF', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#9146FF' }}>Connected as {twitchUser}</div>
            <div style={{ fontSize: 9, color: '#555570', marginTop: 1 }}>Twitch chat and streaming are ready</div>
          </div>
          <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(145,70,255,0.12)', color: '#9146FF', fontFamily: 'var(--font-mono)' }}>ACTIVE</span>
        </div>
        {/* Client ID — always visible */}
        <div style={{ padding: '6px 10px', borderRadius: 6, background: '#14141f', border: '1px solid #1a1a2e', marginBottom: 6 }}>
          <div style={{ fontSize: 7, color: '#555570', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>Client ID</div>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#888' }}>{storedClientId}</span>
        </div>
        {/* Client Secret */}
        <div style={{ padding: '6px 10px', borderRadius: 6, background: '#14141f', border: '1px solid #1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 7, color: '#555570', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>Client Secret</div>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#888' }}>
              {showClientSecret && storedSecret ? storedSecret : '••••••••••••'}
            </span>
          </div>
          <button onClick={() => setShowClientSecret(!showClientSecret)} title={showClientSecret ? 'Hide' : 'Show'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555570', padding: 2 }}>
            {showClientSecret ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        {/* Disconnect */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleDisconnect} style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Disconnect</button>
        </div>
      </div>

      {/* Upcoming Streams */}
      <div style={{ ...cardStyle, marginTop: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9146FF', marginBottom: 10, letterSpacing: 0.5 }}>
          Upcoming Streams
        </div>
        {activeSchedule.length === 0 ? (
          <p style={{ fontSize: 10, color: '#555570' }}>No upcoming streams scheduled. Create one in the Stream panel.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeSchedule.map(seg => {
              const status = getStreamStatus(seg)
              const startDate = new Date(seg.start_time)
              return (
                <div key={seg.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 8,
                  background: status === 'live' ? 'rgba(239,68,68,0.08)' : '#14141f',
                  border: `1px solid ${status === 'live' ? 'rgba(239,68,68,0.3)' : '#1a1a2e'}`,
                }}>
                  {/* Status indicator */}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: status === 'live' ? '#ef4444' : '#9146FF',
                    boxShadow: status === 'live' ? '0 0 6px #ef4444' : 'none',
                    animation: status === 'live' ? 'pulse 1.5s infinite' : 'none',
                  }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#e0e0f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {seg.title}
                    </div>
                    <div style={{ fontSize: 9, color: '#555570', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                      {startDate.toLocaleDateString()} · {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {seg.duration && ` · ${seg.duration}min`}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span style={{
                    fontSize: 8, fontWeight: 800, padding: '2px 8px', borderRadius: 4,
                    letterSpacing: 0.5, flexShrink: 0,
                    background: status === 'live' ? 'rgba(239,68,68,0.15)' : 'rgba(145,70,255,0.1)',
                    color: status === 'live' ? '#ef4444' : '#9146FF',
                    border: `1px solid ${status === 'live' ? 'rgba(239,68,68,0.3)' : 'rgba(145,70,255,0.2)'}`,
                  }}>
                    {status === 'live' ? 'LIVE NOW' : 'UPCOMING'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </div>
    </>
  ) : (
    <div style={cardStyle}>
      <div style={{ fontSize: 10, color: '#888', lineHeight: 1.6, marginBottom: 12, padding: '8px 10px', background: '#14141f', borderRadius: 8, border: '1px solid #1a1a2e' }}>
        <strong style={{ color: '#9146FF' }}>Step 1:</strong> Create app at <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noopener noreferrer" style={{ color: '#9146FF' }}>dev.twitch.tv/console/apps</a><br />
        OAuth Redirect: <code style={{ color: '#ffff00', fontSize: 9 }}>{`${process.env.NEXT_PUBLIC_BASE_URL || 'https://app.videodj.studio'}/api/twitch`}</code>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input type="text" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Client ID" style={inputStyle} />
        <PasswordInput value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder="Client Secret" style={inputStyle} />
        <button onClick={handleSave} disabled={!clientId.trim() || !clientSecret.trim()} style={{ padding: '10px 0', borderRadius: 8, width: '100%', background: clientId.trim() && clientSecret.trim() ? '#9146FF' : '#2a2a3e', color: clientId.trim() && clientSecret.trim() ? '#fff' : '#555', fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer' }}>
          {twitchStatus === 'saving' ? 'Connecting...' : 'Connect with Twitch'}
        </button>
      </div>
      {twitchError && <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)' }}><p style={{ fontSize: 11, color: '#f87171', margin: 0 }}>{twitchError}</p></div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stream Settings Section — custom logo + defaults
// ---------------------------------------------------------------------------

interface CountdownItem {
  id: string
  name: string
  blobUrl: string
}

function StreamSettingsSection() {
  const [customLogo, setCustomLogo] = useState<string | null>(null)
  const [countdowns, setCountdowns] = useState<CountdownItem[]>([])
  const [activeCountdownId, setActiveCountdownId] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const countdownInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setCustomLogo(localStorage.getItem('dj_custom_logo'))
    setActiveCountdownId(localStorage.getItem('dj_countdown_active_id'))
    // Load countdowns from IndexedDB
    loadCountdownVideos().then(vids => {
      setCountdowns(vids.map(v => ({
        id: v.id,
        name: v.name,
        blobUrl: URL.createObjectURL(v.blob),
      })))
    })
  }, [])

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result as string
      localStorage.setItem('dj_custom_logo', dataUrl)
      setCustomLogo(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  function handleRemoveLogo() {
    localStorage.removeItem('dj_custom_logo')
    setCustomLogo(null)
  }

  return (
    <>
      <div style={cardStyle}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#e0e0f0', marginBottom: 8 }}>Stream Logo</div>
        <p style={{ fontSize: 10, color: '#555570', marginBottom: 12 }}>Custom logo shown on the Now Playing overlay during streams. Replaces the default videoDJ.Studio logo.</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 12, background: '#14141f', border: '1px solid #2a2a3e',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
          }}>
            {customLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={customLogo} alt="DJ Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/logo.svg" alt="Default" width={32} height={32} style={{ opacity: 0.4 }} />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
            <button onClick={() => logoInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 6, background: 'rgba(255,255,0,0.08)', border: '1px solid rgba(255,255,0,0.25)', color: '#ffff00', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              <Upload size={12} /> Upload Logo
            </button>
            {customLogo && (
              <button onClick={handleRemoveLogo} style={{ padding: '4px 14px', borderRadius: 6, background: 'transparent', border: '1px solid #2a2a3e', color: '#555570', fontSize: 10, cursor: 'pointer' }}>Remove</button>
            )}
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#e0e0f0' }}>Countdown Videos</div>
          <input ref={countdownInputRef} type="file" accept="video/mp4,video/webm" onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const name = file.name.replace(/\.(mp4|webm|mov|mkv)$/i, '')
            const id = `cd_${Date.now()}`
            await saveCountdownVideo({ id, name, blob: file, addedAt: Date.now() })
            const url = URL.createObjectURL(file)
            setCountdowns(prev => [{ id, name, blobUrl: url }, ...prev])
            // Auto-select newly uploaded
            localStorage.setItem('dj_countdown_active_id', id)
            localStorage.setItem('dj_countdown_video', url)
            setActiveCountdownId(id)
          }} style={{ display: 'none' }} />
          <button onClick={() => countdownInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,0,0.08)', border: '1px solid rgba(255,255,0,0.25)', color: '#ffff00', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
            <Upload size={10} /> Add
          </button>
        </div>
        <p style={{ fontSize: 10, color: '#555570', marginBottom: 10 }}>Plays when you click GO LIVE. Last 4 seconds crossfade into your first track. Select which countdown to use for your next stream.</p>

        {/* Default countdown */}
        <div
          onClick={() => { setActiveCountdownId(null); localStorage.removeItem('dj_countdown_active_id'); localStorage.removeItem('dj_countdown_video') }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
            background: !activeCountdownId ? 'rgba(255,255,0,0.06)' : 'transparent',
            border: `1px solid ${!activeCountdownId ? 'rgba(255,255,0,0.3)' : '#1a1a2e'}`,
            marginBottom: 4, transition: 'all 0.15s',
          }}
        >
          <div style={{ width: 64, height: 36, borderRadius: 4, background: '#14141f', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <video src="/assets/video/countdown.mp4" style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted preload="metadata" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#e0e0f0' }}>Default Countdown</div>
            <div style={{ fontSize: 9, color: '#555570' }}>Built-in 30s countdown</div>
          </div>
          {!activeCountdownId && <span style={{ fontSize: 8, fontWeight: 800, color: '#ffff00', letterSpacing: 1 }}>ACTIVE</span>}
        </div>

        {/* User-uploaded countdowns */}
        {countdowns.map(cd => (
          <div
            key={cd.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
              background: activeCountdownId === cd.id ? 'rgba(255,255,0,0.06)' : 'transparent',
              border: `1px solid ${activeCountdownId === cd.id ? 'rgba(255,255,0,0.3)' : '#1a1a2e'}`,
              marginBottom: 4, transition: 'all 0.15s',
            }}
            onClick={() => {
              setActiveCountdownId(cd.id)
              localStorage.setItem('dj_countdown_active_id', cd.id)
              localStorage.setItem('dj_countdown_video', cd.blobUrl)
            }}
          >
            <div style={{ width: 64, height: 36, borderRadius: 4, background: '#14141f', flexShrink: 0, overflow: 'hidden' }}>
              <video src={cd.blobUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted preload="metadata" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#e0e0f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cd.name}</div>
            </div>
            {activeCountdownId === cd.id && <span style={{ fontSize: 8, fontWeight: 800, color: '#ffff00', letterSpacing: 1 }}>ACTIVE</span>}
            <button
              onClick={async (e) => {
                e.stopPropagation()
                await deleteCountdownVideo(cd.id)
                URL.revokeObjectURL(cd.blobUrl)
                setCountdowns(prev => prev.filter(c => c.id !== cd.id))
                if (activeCountdownId === cd.id) {
                  setActiveCountdownId(null)
                  localStorage.removeItem('dj_countdown_active_id')
                  localStorage.removeItem('dj_countdown_video')
                }
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555570', padding: 4, borderRadius: 4, transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={e => e.currentTarget.style.color = '#555570'}
            >
              <Film size={12} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ ...cardStyle, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#e0e0f0', marginBottom: 8 }}>FFmpeg</div>
        <p style={{ fontSize: 10, color: '#555570' }}>Required for RTMP streaming to Twitch/YouTube.</p>
        <p style={{ fontSize: 10, color: '#555570', marginTop: 4 }}>Install: <code style={{ color: '#ffff00', fontSize: 10 }}>brew install ffmpeg</code></p>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// DJ Software Import Section
// ---------------------------------------------------------------------------

function DJImportSection({ onLibraryLoaded }: { onLibraryLoaded: (t: Track[]) => void }) {
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult('')
    try {
      const { parseImportFile, matchImportedTracks, buildImportUpdates } = await import('@/app/lib/djImport')
      const result = await parseImportFile(file)
      if (result.errors.length > 0) { setImportResult(`Errors: ${result.errors.join(', ')}`); setImporting(false); return }
      const existingTracks = await loadAllTracks()
      const { matched, unmatched } = matchImportedTracks(result.tracks, existingTracks)
      const updates = buildImportUpdates(matched)
      if (updates.length > 0) {
        const { batchUpdateTrackMeta } = await import('@/app/lib/db')
        await batchUpdateTrackMeta(updates)
        const updatedTracks = await loadAllTracks()
        onLibraryLoaded(updatedTracks)
      }
      setImportResult(`${result.source}: ${result.tracks.length} found · ${matched.length} matched · ${updates.length} updated · ${unmatched.length} unmatched`)
    } catch (err) { setImportResult(`Import failed: ${err instanceof Error ? err.message : String(err)}`) }
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div style={{ ...cardStyle, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Film size={14} color="#ffff00" />
        <span style={{ fontWeight: 700, fontSize: 12, color: '#e0e0f0' }}>Import from DJ Software</span>
      </div>
      <p style={{ fontSize: 10, color: '#555570', marginBottom: 10 }}>
        Import from Rekordbox (.xml), Serato (.crate), or M3U playlists.
      </p>
      <input ref={fileRef} type="file" accept=".xml,.crate,.m3u,.m3u8" onChange={handleImportFile} style={{ display: 'none' }} />
      <button onClick={() => fileRef.current?.click()} disabled={importing} style={{ padding: '8px 0', borderRadius: 8, width: '100%', background: importing ? '#2a2a3e' : '#1a1a2e', color: importing ? '#555' : '#e0e0f0', fontWeight: 700, fontSize: 11, border: '1px solid #2a2a3e', cursor: 'pointer' }}>
        {importing ? 'Importing...' : 'Choose File to Import'}
      </button>
      {importResult && <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: importResult.startsWith('Errors') ? 'rgba(248,113,113,0.06)' : 'rgba(74,222,128,0.06)', border: `1px solid ${importResult.startsWith('Errors') ? 'rgba(248,113,113,0.2)' : 'rgba(74,222,128,0.2)'}` }}><p style={{ fontSize: 10, color: importResult.startsWith('Errors') ? '#f87171' : '#4ade80', margin: 0 }}>{importResult}</p></div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 800, color: '#e0e0f0', margin: '0 0 12px' }
const cardStyle: React.CSSProperties = { padding: 16, borderRadius: 12, background: '#1a1a2a', border: '1px solid #2a2a3e' }
const inputStyle: React.CSSProperties = { flex: 1, background: '#14141f', border: '1px solid #2a2a3e', borderRadius: 8, padding: '8px 12px', color: '#e0e0f0', fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none', width: '100%' }
