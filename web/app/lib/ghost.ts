/**
 * Ghost Client — Silent background self-healing agent for videoDJ.Studio
 *
 * Monitors runtime errors, audio/video health, state consistency, and performance.
 * Applies instant rules-based fixes for known problems. Ships unknown errors to
 * Ghost Server (ghost.videodj.studio) for LLM-powered diagnosis via Ollama/Qwen.
 * Receives fix commands and promoted rules via WebSocket.
 *
 * Ghost is invisible — it never shows UI in the DJ app. Status lives in the
 * admin dashboard (admin.videodj.studio).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = 'low' | 'medium' | 'high' | 'critical'
type TelemetryType = 'error' | 'performance' | 'state' | 'recovery'
type FixCommandType = 'state_patch' | 'restart_subsystem' | 'clear_cache' | 'reload_component' | 'retry_operation' | 'notify_user'

interface TelemetryPacket {
  type: TelemetryType
  severity: Severity
  timestamp: string
  context: {
    component: string
    userAction: string
    appState: Record<string, unknown>
  }
  error?: {
    message: string
    stack: string
    count: number
  }
  fixAttempted?: {
    rule: string
    result: 'success' | 'failed'
  }
  sessionId: string
}

interface FixCommand {
  id: string
  type: FixCommandType
  payload: Record<string, unknown>
  confidence: number
  source: 'rules' | 'knowledge_base' | 'llm'
}

interface ClientRule {
  id: number
  pattern: string
  commandType: FixCommandType
  commandPayload: Record<string, unknown>
  successRate: number
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GHOST_SERVER_URL = process.env.NEXT_PUBLIC_GHOST_URL || ''
const GHOST_API_KEY = process.env.NEXT_PUBLIC_GHOST_API_KEY || ''
const SESSION_ID = typeof crypto !== 'undefined' ? crypto.randomUUID() : 'no-crypto'
const TELEMETRY_BATCH_INTERVAL = 5000 // 5 seconds
const HEALTH_CHECK_INTERVAL = 30000 // 30 seconds
const WS_RECONNECT_DELAY = 5000 // 5 seconds

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let ws: WebSocket | null = null
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
let telemetryQueue: TelemetryPacket[] = []
let batchTimer: ReturnType<typeof setTimeout> | null = null
let healthTimer: ReturnType<typeof setInterval> | null = null
let initialized = false
let promotedRules: ClientRule[] = []
const errorCounts = new Map<string, number>()

// ---------------------------------------------------------------------------
// Rules-based auto-fixes (no LLM, instant)
// ---------------------------------------------------------------------------

interface AutoFixRule {
  pattern: RegExp | string
  component?: string
  fix: () => Promise<boolean>
  name: string
}

const builtInRules: AutoFixRule[] = [
  {
    pattern: /AudioContext.*(?:suspended|interrupted)/i,
    name: 'resume_audio_context',
    fix: async () => {
      const contexts = (window as unknown as Record<string, unknown>).__audioContexts as AudioContext[] | undefined
      if (!contexts) return false
      for (const ctx of contexts) {
        if (ctx.state === 'suspended') {
          await ctx.resume()
        }
      }
      return true
    },
  },
  {
    pattern: /AudioContext.*closed/i,
    name: 'recreate_audio_context',
    fix: async () => {
      // Dispatch custom event for the app to handle
      window.dispatchEvent(new CustomEvent('ghost:restart-audio'))
      return true
    },
  },
  {
    pattern: /video.*(?:stall|waiting|suspended)/i,
    name: 'unstall_video',
    fix: async () => {
      const videos = document.querySelectorAll('video')
      let fixed = false
      videos.forEach((video, i) => {
        if (video.readyState < 3 && !video.paused) {
          const currentTime = video.currentTime
          video.currentTime = Math.max(0, currentTime - 0.1)
          video.play().catch(() => {})
          fixed = true

          // If still stalled after 3s, flag as bad and trigger skip
          setTimeout(() => {
            if (video.readyState < 3 && !video.paused) {
              window.dispatchEvent(new CustomEvent('ghost:skip-stalled', {
                detail: { deckIndex: i }
              }))
            }
          }, 3000)
        }
      })
      return fixed
    },
  },
  {
    pattern: /IndexedDB.*(?:failed|error|quota)/i,
    name: 'retry_indexeddb',
    fix: async () => {
      // Clear waveform cache to free space
      try {
        const caches = await window.caches?.keys()
        if (caches) {
          for (const cache of caches) {
            if (cache.includes('waveform')) {
              await window.caches.delete(cache)
            }
          }
        }
        return true
      } catch {
        return false
      }
    },
  },
  {
    pattern: /WebSocket.*(?:closed|error|failed)/i,
    name: 'reconnect_websocket',
    fix: async () => {
      // Dispatch event for stream reconnection
      window.dispatchEvent(new CustomEvent('ghost:reconnect-stream'))
      return true
    },
  },
]

function matchesRule(errorMessage: string, rule: AutoFixRule): boolean {
  if (typeof rule.pattern === 'string') {
    return errorMessage.includes(rule.pattern)
  }
  return rule.pattern.test(errorMessage)
}

async function tryLocalFix(errorMessage: string, component: string): Promise<{ fixed: boolean; ruleName: string } | null> {
  // Check promoted rules first (learned from Ghost Server)
  for (const rule of promotedRules) {
    if (errorMessage.includes(rule.pattern)) {
      const success = await executeFixCommand({
        id: `promoted-${rule.id}`,
        type: rule.commandType,
        payload: rule.commandPayload,
        confidence: rule.successRate,
        source: 'knowledge_base',
      })
      return { fixed: success, ruleName: `promoted:${rule.id}` }
    }
  }

  // Check built-in rules
  for (const rule of builtInRules) {
    if (matchesRule(errorMessage, rule)) {
      try {
        const success = await rule.fix()
        return { fixed: success, ruleName: rule.name }
      } catch {
        return { fixed: false, ruleName: rule.name }
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Fix command execution (from Ghost Server)
// ---------------------------------------------------------------------------

async function executeFixCommand(command: FixCommand): Promise<boolean> {
  try {
    switch (command.type) {
      case 'state_patch': {
        // Dispatch event with the store path and value for the app to apply
        window.dispatchEvent(new CustomEvent('ghost:state-patch', {
          detail: command.payload,
        }))
        return true
      }

      case 'restart_subsystem': {
        const subsystem = command.payload.subsystem as string
        window.dispatchEvent(new CustomEvent('ghost:restart-subsystem', {
          detail: { subsystem },
        }))
        return true
      }

      case 'clear_cache': {
        const cache = command.payload.cache as string
        if (cache === 'waveform') {
          const keys = await window.caches?.keys()
          if (keys) {
            for (const key of keys) {
              if (key.includes('waveform')) await window.caches.delete(key)
            }
          }
        }
        return true
      }

      case 'reload_component': {
        window.dispatchEvent(new CustomEvent('ghost:reload-component', {
          detail: command.payload,
        }))
        return true
      }

      case 'retry_operation': {
        window.dispatchEvent(new CustomEvent('ghost:retry-operation', {
          detail: command.payload,
        }))
        return true
      }

      case 'notify_user': {
        // Import sonner toast dynamically to avoid circular deps
        const { toast } = await import('sonner')
        toast.warning(command.payload.message as string, {
          description: 'Ghost detected an issue it could not fix automatically.',
          duration: 10000,
        })
        return true
      }

      default:
        return false
    }
  } catch (err) {
    console.error('[Ghost] Fix command execution failed:', err)
    return false
  }
}

// ---------------------------------------------------------------------------
// Telemetry shipping
// ---------------------------------------------------------------------------

function queueTelemetry(packet: TelemetryPacket): void {
  telemetryQueue.push(packet)

  if (!batchTimer) {
    batchTimer = setTimeout(flushTelemetry, TELEMETRY_BATCH_INTERVAL)
  }
}

async function flushTelemetry(): Promise<void> {
  batchTimer = null
  if (telemetryQueue.length === 0 || !GHOST_SERVER_URL) return

  const batch = [...telemetryQueue]
  telemetryQueue = []

  for (const packet of batch) {
    try {
      const res = await fetch(`${GHOST_SERVER_URL}/telemetry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ghost-api-key': GHOST_API_KEY,
        },
        body: JSON.stringify(packet),
      })

      if (res.ok) {
        const data = await res.json()
        // If server returned a fix command and we don't have a WebSocket, execute it
        if (data.fixCommand && !data.delivered) {
          const success = await executeFixCommand(data.fixCommand)
          reportFixResult(
            packet.error?.message || '',
            packet.context.component,
            packet.context.userAction,
            success
          )
        }
      }
    } catch {
      // Server unreachable — silent failure, we'll retry next batch
    }
  }
}

function reportFixResult(errorMessage: string, component: string, userAction: string, success: boolean): void {
  if (!GHOST_SERVER_URL) return

  // Report via WebSocket if available
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'fix_result',
      errorMessage,
      component,
      userAction,
      success,
    }))
    return
  }

  // Fallback to REST
  fetch(`${GHOST_SERVER_URL}/telemetry/result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ghost-api-key': GHOST_API_KEY,
    },
    body: JSON.stringify({ errorMessage, component, userAction, success }),
  }).catch(() => {})
}

// ---------------------------------------------------------------------------
// WebSocket connection to Ghost Server
// ---------------------------------------------------------------------------

function connectWebSocket(): void {
  if (!GHOST_SERVER_URL || ws) return

  const wsUrl = GHOST_SERVER_URL
    .replace('https://', 'wss://')
    .replace('http://', 'ws://')

  try {
    ws = new WebSocket(`${wsUrl}/ws?sessionId=${SESSION_ID}&apiKey=${GHOST_API_KEY}`)

    ws.onopen = () => {
      console.log('[Ghost] Connected to Ghost Server')
    }

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.type === 'fix_command') {
          const command = msg.data as FixCommand
          const success = await executeFixCommand(command)
          reportFixResult('server-initiated', 'unknown', 'unknown', success)
        }

        if (msg.type === 'promoted_rules') {
          const rules = msg.data as ClientRule[]
          promotedRules = [...promotedRules, ...rules]
          console.log(`[Ghost] Received ${rules.length} promoted rules (total: ${promotedRules.length})`)
        }
      } catch {
        // Malformed message — ignore
      }
    }

    ws.onclose = () => {
      ws = null
      // Reconnect after delay
      if (!wsReconnectTimer) {
        wsReconnectTimer = setTimeout(() => {
          wsReconnectTimer = null
          connectWebSocket()
        }, WS_RECONNECT_DELAY)
      }
    }

    ws.onerror = () => {
      ws?.close()
    }
  } catch {
    ws = null
  }
}

// ---------------------------------------------------------------------------
// Error interceptors
// ---------------------------------------------------------------------------

function handleError(message: string, stack: string, component: string, userAction: string): void {
  // Deduplicate — don't spam same error
  const key = `${message}::${component}`
  const count = (errorCounts.get(key) || 0) + 1
  errorCounts.set(key, count)

  // Try local fix first
  tryLocalFix(message, component).then(result => {
    const severity = classifySeverity(message)

    if (result && result.fixed) {
      // Fixed locally — still log as recovery telemetry
      queueTelemetry({
        type: 'recovery',
        severity,
        timestamp: new Date().toISOString(),
        context: { component, userAction, appState: getStateSnapshot() },
        error: { message, stack, count },
        fixAttempted: { rule: result.ruleName, result: 'success' },
        sessionId: SESSION_ID,
      })
      return
    }

    // Local fix failed or no matching rule — ship to Ghost Server
    queueTelemetry({
      type: 'error',
      severity,
      timestamp: new Date().toISOString(),
      context: { component, userAction, appState: getStateSnapshot() },
      error: { message, stack, count },
      fixAttempted: result ? { rule: result.ruleName, result: 'failed' } : undefined,
      sessionId: SESSION_ID,
    })
  })
}

function classifySeverity(message: string): Severity {
  const lower = message.toLowerCase()
  if (lower.includes('crash') || lower.includes('fatal') || lower.includes('unrecoverable')) return 'critical'
  if (lower.includes('audio') || lower.includes('stream') || lower.includes('rtmp')) return 'high'
  if (lower.includes('video') || lower.includes('indexeddb') || lower.includes('state')) return 'medium'
  return 'low'
}

function getStateSnapshot(): Record<string, unknown> {
  try {
    // Minimal snapshot — don't send full track library
    const store = (window as unknown as Record<string, unknown>).__playerStore as Record<string, unknown> | undefined
    if (!store) return {}
    return {
      deckAPlaying: (store.deckA as Record<string, unknown>)?.playing,
      deckATrack: (store.deckA as Record<string, unknown>)?.track ? 'loaded' : null,
      deckBPlaying: (store.deckB as Record<string, unknown>)?.playing,
      deckBTrack: (store.deckB as Record<string, unknown>)?.track ? 'loaded' : null,
      crossfader: store.crossfader,
      autoplayActive: store.autoplayActive,
      automixActive: store.automixActive,
      librarySize: Array.isArray(store.library) ? store.library.length : 0,
    }
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------

function runHealthChecks(): void {
  // Check AudioContext health
  const contexts = (window as unknown as Record<string, unknown>).__audioContexts as AudioContext[] | undefined
  if (contexts) {
    for (const ctx of contexts) {
      if (ctx.state === 'suspended') {
        handleError('AudioContext suspended during playback', '', 'AudioEngine', 'health_check')
      }
    }
  }

  // Check video elements
  const videos = document.querySelectorAll('video')
  videos.forEach((video, i) => {
    if (!video.paused && video.readyState < 3) {
      handleError(
        `Video element stalled (readyState: ${video.readyState})`,
        '',
        i === 0 ? 'DeckA' : 'DeckB',
        'health_check'
      )
    }
  })

  // Check memory pressure (Chrome-only API)
  const perfWithMemory = performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }
  if (perfWithMemory.memory) {
    const mem = perfWithMemory.memory
    if (mem.usedJSHeapSize > mem.jsHeapSizeLimit * 0.9) {
      handleError(
        `Memory pressure: ${Math.round(mem.usedJSHeapSize / 1024 / 1024)}MB used of ${Math.round(mem.jsHeapSizeLimit / 1024 / 1024)}MB limit`,
        '',
        'System',
        'health_check'
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Initialize / Destroy
// ---------------------------------------------------------------------------

export function initGhost(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  // Global error handler
  window.addEventListener('error', (event) => {
    handleError(
      event.message || 'Unknown error',
      event.error?.stack || '',
      'Global',
      'unknown'
    )
  })

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || String(event.reason) || 'Unhandled promise rejection'
    const stack = event.reason?.stack || ''
    handleError(message, stack, 'Global', 'async_operation')
  })

  // Connect to Ghost Server
  connectWebSocket()

  // Periodic health checks
  healthTimer = setInterval(runHealthChecks, HEALTH_CHECK_INTERVAL)

  console.log('[Ghost] Initialized — monitoring active')
}

export function destroyGhost(): void {
  if (!initialized) return
  initialized = false

  if (batchTimer) clearTimeout(batchTimer)
  if (healthTimer) clearInterval(healthTimer)
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer)
  if (ws) ws.close()

  batchTimer = null
  healthTimer = null
  wsReconnectTimer = null
  ws = null

  console.log('[Ghost] Destroyed')
}

/**
 * Manually report an error to Ghost from anywhere in the app.
 * Use this in catch blocks or error boundaries.
 */
export function ghostReport(message: string, component: string, userAction: string, stack?: string): void {
  if (!initialized) return
  handleError(message, stack || '', component, userAction)
}
