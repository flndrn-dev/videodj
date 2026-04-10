'use client'
import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SendIcon, type SendIconHandle } from '@/components/ui/send'
import { XIcon, type XIconHandle } from '@/components/ui/x'
import { TiMinus } from 'react-icons/ti'
import { savePreferences, loadPreferences, type UserPreferences, saveChatMessages, loadChatMessages, saveLinusMemory, loadLinusMemories, type LinusMemoryEntry } from '@/app/lib/db'
import * as syncEngine from '@/app/lib/syncEngine'
import { filterCommands, getOptionHint, type LinusCommand, type CommandOption } from '@/app/lib/linusCommands'
import { CommandReference } from '@/components/command/CommandReference'
import { BookTextIcon, type BookTextIconHandle } from '@/components/ui/book-text'
import React from 'react'

/** Render markdown links [text](url), **bold**, _italic_, and [DELETE:id] as JSX */
function renderMarkdown(text: string, onDelete?: (id: string) => void): React.ReactNode {
  return text.split('\n').map((line, lineIdx) => {
    // [DELETE:id] — render as delete button
    const deleteMatch = line.match(/\[DELETE:([^\]]+)\]/)
    if (deleteMatch) {
      const id = deleteMatch[1]
      const before = line.slice(0, deleteMatch.index)
      return (
        <React.Fragment key={lineIdx}>
          {before && renderInline(before, lineIdx)}
          <button
            onClick={() => onDelete?.(id)}
            style={{
              fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
              color: '#ef4444', cursor: 'pointer', marginLeft: 4,
            }}
          >Delete</button>
          {'\n'}
        </React.Fragment>
      )
    }
    return <React.Fragment key={lineIdx}>{renderInline(line, lineIdx)}{'\n'}</React.Fragment>
  })
}

function renderInline(line: string, lineIdx: number): React.ReactNode {
  const nodes: React.ReactNode[] = []
  // Match: [text](url), **bold**, _italic_
  const regex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|\*\*([^*]+)\*\*|_([^_]+)_/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let keyIdx = 0

  while ((match = regex.exec(line)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index))
    }

    if (match[1] && match[2]) {
      // Link: [text](url)
      nodes.push(
        <a key={`${lineIdx}-${keyIdx++}`} href={match[2]} target="_blank" rel="noopener noreferrer"
          style={{ color: '#ffff00', textDecoration: 'underline', textUnderlineOffset: 2 }}
        >{match[1]}</a>
      )
    } else if (match[3]) {
      // Bold: **text**
      nodes.push(<strong key={`${lineIdx}-${keyIdx++}`} style={{ color: '#e0e0f0', fontWeight: 700 }}>{match[3]}</strong>)
    } else if (match[4]) {
      // Italic: _text_
      nodes.push(<em key={`${lineIdx}-${keyIdx++}`} style={{ color: '#888', fontStyle: 'italic' }}>{match[4]}</em>)
    }

    lastIndex = match.index + match[0].length
  }

  // Remaining text
  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : line
}

interface Message {
  role: 'user' | 'agent'
  text: string
}

export interface CommandBarHandle {
  openWithWelcome: () => void
}

interface CommandBarProps {
  onCommand: (text: string, conversationHistory?: Message[], memories?: LinusMemoryEntry[], onProgress?: (msg: string) => void) => Promise<string | void>
  onDeleteTrack?: (id: string) => void
  onWelcome: (memories?: LinusMemoryEntry[]) => Promise<string | void>
  onOpenSettings: () => void
  context: Record<string, unknown>
}

export const CommandBar = forwardRef<CommandBarHandle, CommandBarProps>(
  function CommandBar({ onCommand, onDeleteTrack, onWelcome, onOpenSettings, context }, ref) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [prefs, setPrefs] = useState<UserPreferences | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [showReference, setShowReference] = useState(false)
  const [autocomplete, setAutocomplete] = useState<LinusCommand[]>([])
  const [optionHint, setOptionHint] = useState<{ command: string; options: CommandOption[] } | null>(null)
  const [memories, setMemories] = useState<LinusMemoryEntry[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sendIconRef = useRef<SendIconHandle>(null)
  const bookIconRef = useRef<BookTextIconHandle>(null)
  const closeIconRef = useRef<XIconHandle>(null)
  const welcomeSent = useRef(false)

  // Load preferences + chat history + memories on mount
  useEffect(() => {
    loadPreferences().then(setPrefs)
    loadChatMessages().then((msgs) => {
      if (msgs.length > 0) {
        setMessages(msgs)
        welcomeSent.current = true
      }
    })
    loadLinusMemories().then(setMemories)
  }, [])

  // Auto-scroll to bottom + persist messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    // Save messages to IndexedDB (skip empty)
    if (messages.length > 0) {
      saveChatMessages(messages)
    }
  }, [messages])

  // Focus input when opened + clear unread
  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      setUnreadCount(0)
    }
  }, [open])

  // Check API key and greet when chat opens
  useEffect(() => {
    if (!open || messages.length > 0 || welcomeSent.current) return
    welcomeSent.current = true

    // Load fresh preferences to avoid race condition
    loadPreferences().then(freshPrefs => {
      setPrefs(freshPrefs)

      fetch('/api/settings').then(r => r.json()).then(data => {
        if (data.hasApiKey) {
          if (freshPrefs?.setupComplete && freshPrefs.userName) {
            // Returning user — short greeting, no welcome flow
            setMessages([{ role: 'agent', text: `Hey ${freshPrefs.userName}, what can I do for you?` }])
          } else {
            // First time — trigger welcome via API
            onWelcome(memories).then(reply => {
              if (reply) setMessages([{ role: 'agent', text: reply }])
            }).catch(() => {})
          }
        } else {
          setMessages([{ role: 'agent', text: '@@SETUP_NEEDED@@' }])
        }
      }).catch(() => {
        setMessages([{ role: 'agent', text: '@@SETUP_NEEDED@@' }])
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Expose openWithWelcome to parent
  useImperativeHandle(ref, () => ({
    openWithWelcome: () => {
      setMessages([])
      welcomeSent.current = true

      // Fetch welcome message from Linus
      onWelcome(memories).then((reply) => {
        const text = reply || "Hey! I'm Linus, your AI DJ agent. How can I help you today?"
        setMessages([{ role: 'agent', text }])
        // Show notification badge if chat is closed
        if (!open) {
          setUnreadCount(1)
        }
      }).catch(() => {
        const text = "Hey! I'm Linus, your AI DJ agent. How can I help you today?"
        setMessages([{ role: 'agent', text }])
        if (!open) {
          setUnreadCount(1)
        }
      })
    },
  }))

  // Save preferences from agent response
  const handlePreferences = useCallback(async (newPrefs: Partial<UserPreferences>) => {
    if (Object.keys(newPrefs).length > 0) {
      const updated = { ...prefs, ...newPrefs, setupComplete: true } as UserPreferences
      await savePreferences(updated)
      setPrefs(updated)
    }
  }, [prefs])

  // Handle input change — update autocomplete + option hints
  const handleInputChange = useCallback((val: string) => {
    setValue(val)
    if (val.startsWith('/') && val.length > 1) {
      const hint = getOptionHint(val)
      if (hint) {
        setOptionHint(hint)
        setAutocomplete([])
      } else {
        setOptionHint(null)
        setAutocomplete(filterCommands(val.split(' ')[0]))
      }
    } else if (val === '/') {
      setOptionHint(null)
      setAutocomplete(filterCommands('/'))
    } else {
      setOptionHint(null)
      setAutocomplete([])
    }
  }, [])

  // Select autocomplete command
  const selectCommand = useCallback((cmd: string) => {
    setValue(cmd)
    setAutocomplete([])
    inputRef.current?.focus()
  }, [])

  // Summarize conversation and save to memory, then clear chat
  const summarizeAndClose = useCallback(async () => {
    const msgs = messages.filter(m => m.text !== '@@SETUP_NEEDED@@')
    setOpen(false)
    setMessages([])
    welcomeSent.current = false
    saveChatMessages([])
    // NOTE: preferences (userName, setupComplete) are NOT cleared — they persist across sessions

    // Only summarize if there were real messages (at least 2)
    if (msgs.length >= 2) {
      try {
        const res = await fetch('/api/agent/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: msgs }),
        })
        const data = await res.json()
        if (data.success && data.summary) {
          await saveLinusMemory({
            timestamp: new Date().toISOString(),
            summary: data.summary,
            topics: data.topics || [],
            actions: data.actions || [],
          })
          // Reload memories so next session has them
          const updated = await loadLinusMemories()
          setMemories(updated)
          // Sync to cloud for admin dashboard
          syncEngine.syncConversation({
            summary: data.summary,
            topics: data.topics || [],
            actions: data.actions || [],
            messageCount: msgs.length,
          })
        }
      } catch { /* silently fail — don't block the close */ }
    }
  }, [messages])

  const submit = useCallback(async () => {
    const text = value.trim()
    if (!text || loading) return
    setValue('')
    setAutocomplete([])
    setOptionHint(null)
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto'
    const updatedMessages: Message[] = [...messages, { role: 'user', text }]
    setMessages(updatedMessages)
    setLoading(true)
    abortRef.current = new AbortController()

    try {
      // Progress callback: update/append a progress message in chat
      const onProgress = (progress: string) => {
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last?.role === 'agent' && last.text.startsWith('[Progress] ')) {
            return [...prev.slice(0, -1), { role: 'agent', text: `[Progress] ${progress}` }]
          }
          return [...prev, { role: 'agent', text: `[Progress] ${progress}` }]
        })
      }

      const reply = await onCommand(text, messages, memories, onProgress)

      // Handle /help action — open reference modal
      if (text.trim().toLowerCase() === '/help') {
        setShowReference(true)
      }

      if (reply) {
        // Replace any lingering progress message with the final reply
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last?.role === 'agent' && last.text.startsWith('[Progress] ')) {
            return [...prev.slice(0, -1), { role: 'agent', text: reply }]
          }
          return [...prev, { role: 'agent', text: reply }]
        })
      } else {
        setMessages(prev => [...prev, { role: 'agent', text: 'Done.' }])
      }

      // Notify if chat is minimized
      if (!open) {
        setUnreadCount(prev => prev + 1)
      }
    } catch {
      setMessages(prev => [...prev, { role: 'agent', text: 'Something went wrong.' }])
      if (!open) setUnreadCount(prev => prev + 1)
    }

    setLoading(false)
  }, [value, loading, messages, onCommand, handlePreferences])

  return (
    <>
      {/* Floating Action Button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={() => setOpen(true)}
            style={{
              position: 'fixed', bottom: 24, right: 24, zIndex: 300,
              width: 56, height: 56, borderRadius: '50%',
              background: '#afff92',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#000',
              boxShadow: '0 4px 20px rgba(175,255,146,0.4), 0 2px 8px rgba(0,0,0,0.3)',
              overflow: 'visible',
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/linus.svg" alt="Linus" width={36} height={36} style={{ borderRadius: '50%' }} />

            {/* Red notification badge */}
            {unreadCount > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                style={{
                  position: 'absolute', top: -4, right: -4,
                  width: 22, height: 22, borderRadius: '50%',
                  background: '#ef4444',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: '#fff',
                  border: '2px solid #0a0a0f',
                  boxShadow: '0 2px 6px rgba(239,68,68,0.5)',
                }}
              >
                {unreadCount}
              </motion.div>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Expanded chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            style={{
              position: 'fixed', bottom: 24, right: 24, zIndex: 300,
              width: 380, maxHeight: 480,
              background: '#12121e',
              border: '1px solid #2a2a3e',
              borderRadius: 20,
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 20px rgba(255,255,0,0.1)',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 18px',
              borderBottom: '1px solid #1a1a2e',
              flexShrink: 0,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/linus.svg" alt="Linus" width={28} height={28} style={{ borderRadius: 6 }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#e0e0f0' }}>
                  Linus
                </span>
                <span style={{ fontSize: 9, color: '#555570', marginLeft: 6, fontFamily: 'var(--font-mono)' }}>
                  AI DJ Agent
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {/* Docs — open command reference */}
                <motion.button
                  onClick={() => setShowReference(true)}
                  onMouseEnter={(e) => { bookIconRef.current?.startAnimation(); e.currentTarget.style.background = 'rgba(175,255,146,0.15)' }}
                  onMouseLeave={(e) => { bookIconRef.current?.stopAnimation(); e.currentTarget.style.background = 'transparent' }}
                  whileTap={{ scale: 0.9 }}
                  title="Command reference"
                  style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: '#afff92', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s',
                  }}
                >
                  <BookTextIcon ref={bookIconRef} size={12} />
                </motion.button>
                {/* Minimize — hides panel, keeps conversation */}
                <motion.button
                  onClick={() => setOpen(false)}
                  whileTap={{ scale: 0.9 }}
                  title="Minimize"
                  style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: '#555570', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,0,0.2)'; e.currentTarget.style.color = '#ffff00' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#555570' }}
                >
                  <TiMinus size={14} />
                </motion.button>
                {/* Close — clears conversation */}
                <motion.button
                  onClick={summarizeAndClose}
                  onMouseEnter={(e) => { closeIconRef.current?.startAnimation(); e.currentTarget.style.background = 'rgba(239,68,68,0.2)'; e.currentTarget.style.color = '#ef4444' }}
                  onMouseLeave={(e) => { closeIconRef.current?.stopAnimation(); e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#555570' }}
                  whileTap={{ scale: 0.9 }}
                  title="Close and clear conversation"
                  style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: '#555570', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <XIcon ref={closeIconRef} size={12} />
                </motion.button>
              </div>
            </div>

            {/* Messages area */}
            <div
              ref={scrollRef}
              style={{
                flex: 1, overflowY: 'auto', padding: '12px 18px',
                display: 'flex', flexDirection: 'column', gap: 10,
                minHeight: 200,
              }}
            >
              {messages.length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#333348', fontSize: 12 }}>
                  Ask Linus anything about your music...
                </div>
              )}
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 12,
                    fontSize: 12,
                    lineHeight: 1.5,
                    maxWidth: '85%',
                    ...(msg.role === 'user'
                      ? {
                          alignSelf: 'flex-end',
                          background: 'rgba(255,255,0,0.12)',
                          color: '#ffff00',
                          borderBottomRightRadius: 4,
                        }
                      : {
                          alignSelf: 'flex-start',
                          background: '#1a1a2e',
                          color: '#c0c0d8',
                          borderBottomLeftRadius: 4,
                        }),
                  }}
                >
                  {msg.text === '@@SETUP_NEEDED@@' ? (
                    <div>
                      <div style={{ marginBottom: 8 }}>
                        Hey! I&apos;m Linus, your AI DJ agent. To get started, I need you to connect your Claude API key.
                      </div>
                      <button
                        onClick={() => { setOpen(false); onOpenSettings() }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '5px 12px', borderRadius: 8,
                          background: 'rgba(255,255,0,0.1)', border: '1px solid rgba(255,255,0,0.3)',
                          color: '#ffff00', fontSize: 11, fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Open Settings &rarr;
                      </button>
                    </div>
                  ) : (
                    <span>
                      {msg.role === 'agent' && msg.text.includes('[REFRESH_PLAYLIST]') ? (
                        <>
                          {msg.text.replace('[REFRESH_PLAYLIST]', '').trim()}
                          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            <button
                              onClick={async () => {
                                const reply = await onCommand('__refresh_playlist', [], memories)
                                if (reply) setMessages(prev => [...prev, { role: 'agent', text: reply }])
                              }}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '6px 16px', borderRadius: 8,
                                background: 'rgba(255,255,0,0.15)', border: '1px solid rgba(255,255,0,0.35)',
                                color: '#ffff00', fontSize: 11, fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              ↻ Refresh Playlist
                            </button>
                          </div>
                        </>
                      ) : msg.role === 'agent' && msg.text.includes('[PLAYLIST_ACTIONS]') ? (
                        <>
                          {renderMarkdown(msg.text.replace('[PLAYLIST_ACTIONS]', '').trim(), onDeleteTrack)}
                          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                            <button
                              onClick={async () => {
                                const reply = await onCommand('__start_playing', [], memories)
                                if (reply) setMessages(prev => [...prev, { role: 'agent', text: reply }])
                              }}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '6px 16px', borderRadius: 8,
                                background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.35)',
                                color: '#4ade80', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                              }}
                            >
                              ▶ Start Playing
                            </button>
                            <button
                              onClick={async () => {
                                const reply = await onCommand('__edit_playlist', [], memories)
                                if (reply) setMessages(prev => [...prev, { role: 'agent', text: reply }])
                              }}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '6px 16px', borderRadius: 8,
                                background: 'rgba(255,255,0,0.15)', border: '1px solid rgba(255,255,0,0.35)',
                                color: '#ffff00', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                              }}
                            >
                              ✎ Edit Playlist
                            </button>
                            <button
                              onClick={async () => {
                                const reply = await onCommand('__remove_playlist', [], memories)
                                if (reply) setMessages(prev => [...prev, { role: 'agent', text: reply }])
                              }}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '6px 16px', borderRadius: 8,
                                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)',
                                color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                              }}
                            >
                              ✕ Remove
                            </button>
                          </div>
                        </>
                      ) : msg.role === 'agent' && msg.text.includes('[NEXT_TRACKS]') ? (
                        <>
                          {msg.text.replace('[NEXT_TRACKS]', '').trim()}
                          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            <button
                              onClick={async () => {
                                if (loading) return
                                setMessages(prev => [...prev, { role: 'user', text: 'Load next suggestion' }])
                                setLoading(true)
                                try {
                                  const reply = await onCommand('__load_next', messages, memories)
                                  if (reply) setMessages(prev => [...prev, { role: 'agent', text: reply }])
                                } catch { setMessages(prev => [...prev, { role: 'agent', text: 'Something went wrong.' }]) }
                                setLoading(false)
                              }}
                              disabled={loading}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '6px 16px', borderRadius: 8,
                                background: 'rgba(255,255,0,0.15)', border: '1px solid rgba(255,255,0,0.35)',
                                color: '#ffff00', fontSize: 11, fontWeight: 700,
                                cursor: loading ? 'not-allowed' : 'pointer',
                                opacity: loading ? 0.5 : 1,
                              }}
                            >
                              ▶ Load Next
                            </button>
                          </div>
                        </>
                      ) : msg.role === 'agent' && msg.text.includes('Type "apply" to save') ? (
                        <>
                          {msg.text.replace(/Type "apply" to save these changes, or "cancel" to discard\.?/g, '').trim()}
                          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            <button
                              onClick={async () => {
                                if (loading) return
                                setMessages(prev => [...prev, { role: 'user', text: 'apply' }])
                                setLoading(true)
                                try {
                                  const reply = await onCommand('apply', messages, memories)
                                  if (reply) setMessages(prev => [...prev, { role: 'agent', text: reply }])
                                } catch { setMessages(prev => [...prev, { role: 'agent', text: 'Something went wrong.' }]) }
                                setLoading(false)
                              }}
                              disabled={loading}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '6px 16px', borderRadius: 8,
                                background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.35)',
                                color: '#4ade80', fontSize: 11, fontWeight: 700,
                                cursor: loading ? 'not-allowed' : 'pointer',
                                opacity: loading ? 0.5 : 1,
                              }}
                            >
                              Apply
                            </button>
                            <button
                              onClick={async () => {
                                if (loading) return
                                setMessages(prev => [...prev, { role: 'user', text: 'cancel' }])
                                setLoading(true)
                                try {
                                  const reply = await onCommand('cancel', messages, memories)
                                  if (reply) setMessages(prev => [...prev, { role: 'agent', text: reply }])
                                } catch { setMessages(prev => [...prev, { role: 'agent', text: 'Something went wrong.' }]) }
                                setLoading(false)
                              }}
                              disabled={loading}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '6px 16px', borderRadius: 8,
                                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                                color: '#ef4444', fontSize: 11, fontWeight: 700,
                                cursor: loading ? 'not-allowed' : 'pointer',
                                opacity: loading ? 0.5 : 1,
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : msg.role === 'agent' && (msg.text.includes('📖') || msg.text.includes('command')) ? (
                        <>
                          {msg.text.replace(/📖/g, '').replace(/\(the\s*icon[^)]*\)/gi, '')}
                          <button
                            onClick={() => setShowReference(true)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '3px 8px', borderRadius: 6, marginTop: 6,
                              background: 'rgba(175,255,146,0.1)', border: '1px solid rgba(175,255,146,0.3)',
                              color: '#afff92', fontSize: 10, fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            <BookTextIcon size={10} />
                            Linus Commands
                          </button>
                        </>
                      ) : renderMarkdown(msg.text, onDeleteTrack)}
                    </span>
                  )}
                </motion.div>
              ))}
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px',
                    borderRadius: 12, background: '#1a1a2e', fontSize: 12,
                  }}
                >
                  {/* AI working animation — pulsing bars */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 16 }}>
                      {[0, 1, 2, 3, 4].map(i => (
                        <motion.div
                          key={i}
                          animate={{ height: [4, 14, 4] }}
                          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
                          style={{ width: 3, borderRadius: 2, background: '#afff92' }}
                        />
                      ))}
                    </div>
                    <span style={{ color: '#afff92', fontSize: 11, fontWeight: 600 }}>
                      Linus is working
                    </span>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Autocomplete dropdown */}
            <AnimatePresence>
              {autocomplete.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  style={{
                    borderTop: '1px solid #1a1a2e',
                    maxHeight: 180, overflowY: 'auto',
                    flexShrink: 0,
                  }}
                >
                  {autocomplete.map((cmd) => (
                    <button
                      key={cmd.command}
                      onClick={() => selectCommand(cmd.command + (cmd.args ? ' ' : ''))}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'baseline', gap: 8,
                        padding: '6px 14px', background: 'transparent', border: 'none',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,0,0.04)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#ffff00', minWidth: 110 }}>
                        {cmd.command}
                      </span>
                      <span style={{ fontSize: 10, color: '#555570' }}>{cmd.description}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Command options hint (for /playlist, /fix, etc.) */}
            <AnimatePresence>
              {optionHint && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  style={{
                    borderTop: '1px solid #1a1a2e',
                    padding: '8px 14px',
                    flexShrink: 0,
                    background: 'rgba(255,255,0,0.02)',
                  }}
                >
                  <div style={{ fontSize: 9, color: '#ffff00', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>
                    {optionHint.command.toUpperCase().slice(1)} OPTIONS — combine any:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {optionHint.options.map(opt => (
                      <button
                        key={opt.label}
                        onClick={() => {
                          const current = value.trim()
                          const add = current.endsWith(' ') ? opt.label + ' ' : ' ' + opt.label + ' '
                          handleInputChange(current + add)
                          inputRef.current?.focus()
                        }}
                        style={{
                          fontSize: 9, padding: '3px 8px', borderRadius: 4,
                          background: 'rgba(255,255,0,0.06)', border: '1px solid rgba(255,255,0,0.15)',
                          color: '#888', cursor: 'pointer',
                        }}
                        title={opt.description}
                      >
                        <span style={{ color: '#ffff00', fontWeight: 700 }}>{opt.label}</span> <span style={{ color: '#555' }}>{opt.example.replace(`${optionHint.command} ${opt.label}`, '').replace(optionHint.command, '').trim()}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input */}
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 8,
              padding: '10px 14px',
              borderTop: '1px solid #1a1a2e',
              flexShrink: 0,
            }}>
              <textarea
                ref={inputRef}
                value={value}
                onChange={(e) => {
                  handleInputChange(e.target.value)
                  // Auto-grow: reset height then set to scrollHeight
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); setAutocomplete([]) }
                  if (e.key === 'Escape') setAutocomplete([])
                }}
                placeholder="Type / for commands or ask anything..."
                rows={1}
                style={{
                  flex: 1, background: '#14141f', border: '1px solid #2a2a3e',
                  borderRadius: 10, padding: '9px 12px', color: '#e0e0f0',
                  fontSize: 12, outline: 'none', fontFamily: 'inherit',
                  resize: 'none', overflow: 'auto', lineHeight: 1.4,
                  minHeight: 36, maxHeight: 120,
                }}
              />
              <motion.button
                onClick={() => {
                  if (loading) {
                    // Stop
                    abortRef.current?.abort()
                    setLoading(false)
                    setMessages(prev => {
                      const last = prev[prev.length - 1]
                      if (last?.role === 'agent' && last.text.startsWith('[Progress] ')) {
                        return [...prev.slice(0, -1), { role: 'agent', text: 'Stopped.' }]
                      }
                      return [...prev, { role: 'agent', text: 'Stopped.' }]
                    })
                  } else {
                    submit()
                  }
                }}
                onMouseEnter={() => { if (!loading) sendIconRef.current?.startAnimation() }}
                onMouseLeave={() => { if (!loading) sendIconRef.current?.stopAnimation() }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: loading ? '#ef4444' : 'linear-gradient(135deg, #afff92, #8fdd72)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: loading ? '#fff' : '#000',
                  transition: 'background 0.2s',
                }}
                title={loading ? 'Stop Linus' : 'Send'}
              >
                {loading ? (
                  <svg width={14} height={14} viewBox="0 0 14 14" fill="currentColor">
                    <rect x={2} y={2} width={10} height={10} rx={2} />
                  </svg>
                ) : (
                  <SendIcon ref={sendIconRef} size={14} />
                )}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Command reference modal */}
      <AnimatePresence>
        {showReference && (
          <CommandReference
            onClose={() => setShowReference(false)}
            onSelectCommand={(cmd) => {
              handleInputChange(cmd)
              inputRef.current?.focus()
            }}
          />
        )}
      </AnimatePresence>
    </>
  )
})
