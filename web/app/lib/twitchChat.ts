/**
 * Twitch IRC Chat Client
 *
 * Connects to Twitch IRC via WebSocket for reading and sending chat messages.
 * Uses the anonymous connection (no OAuth needed for reading).
 * For sending messages, requires an OAuth token.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TwitchMessage {
  id: string
  username: string
  displayName: string
  message: string
  color: string
  timestamp: number
  badges: string[]
  isSubscriber: boolean
  isModerator: boolean
}

export type ChatCallback = (message: TwitchMessage) => void
export type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void

// ---------------------------------------------------------------------------
// Twitch IRC Client
// ---------------------------------------------------------------------------

export class TwitchChatClient {
  private ws: WebSocket | null = null
  private channel: string = ''
  private onMessage: ChatCallback | null = null
  private onStatus: StatusCallback | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private pingInterval: NodeJS.Timeout | null = null

  private oauthToken: string = ''
  private username: string = ''

  /**
   * Connect to a Twitch channel's chat.
   * If oauthToken is provided, connects authenticated (can send messages).
   * Otherwise connects anonymously (read-only).
   */
  connect(channel: string, onMessage: ChatCallback, onStatus?: StatusCallback, oauthToken?: string, username?: string) {
    this.channel = channel.toLowerCase().replace('#', '')
    this.onMessage = onMessage
    this.onStatus = onStatus || null
    this.oauthToken = oauthToken || ''
    this.username = username || ''

    this.onStatus?.('connecting')

    this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443')

    this.ws.onopen = () => {
      this.ws!.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
      if (this.oauthToken && this.username) {
        // Authenticated — can read and send
        this.ws!.send(`PASS oauth:${this.oauthToken}`)
        this.ws!.send(`NICK ${this.username}`)
      } else {
        // Anonymous — read only
        const nick = `justinfan${Math.floor(Math.random() * 100000)}`
        this.ws!.send(`NICK ${nick}`)
      }
      this.ws!.send(`JOIN #${this.channel}`)

      this.onStatus?.('connected')

      // Ping every 4 minutes to keep connection alive
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send('PING')
        }
      }, 240000)
    }

    this.ws.onmessage = (event) => {
      const lines = event.data.split('\r\n')
      for (const line of lines) {
        if (!line) continue

        // Respond to PING
        if (line.startsWith('PING')) {
          this.ws?.send('PONG :tmi.twitch.tv')
          continue
        }

        // Parse PRIVMSG (chat messages)
        if (line.includes('PRIVMSG')) {
          const msg = this.parseMessage(line)
          if (msg) this.onMessage?.(msg)
        }
      }
    }

    this.ws.onerror = () => {
      this.onStatus?.('error')
    }

    this.ws.onclose = () => {
      this.onStatus?.('disconnected')
      this.cleanup()

      // Auto-reconnect after 5 seconds
      this.reconnectTimer = setTimeout(() => {
        if (this.channel && this.onMessage) {
          this.connect(this.channel, this.onMessage, this.onStatus || undefined)
        }
      }, 5000)
    }
  }

  /** Disconnect from chat */
  disconnect() {
    this.cleanup()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.channel = ''
    this.onMessage = null
    this.onStatus = null
  }

  /** Send a chat message (requires authenticated connection) */
  sendMessage(message: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.oauthToken) return false
    this.ws.send(`PRIVMSG #${this.channel} :${message}`)
    return true
  }

  /** Check if connected */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /** Check if authenticated (can send) */
  isAuthenticated(): boolean {
    return this.isConnected() && !!this.oauthToken
  }

  private cleanup() {
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
  }

  /** Parse an IRC PRIVMSG line into a TwitchMessage */
  private parseMessage(line: string): TwitchMessage | null {
    try {
      // Extract tags section (@key=value;key=value)
      const tags: Record<string, string> = {}
      if (line.startsWith('@')) {
        const tagEnd = line.indexOf(' ')
        const tagStr = line.slice(1, tagEnd)
        for (const pair of tagStr.split(';')) {
          const [k, v] = pair.split('=')
          if (k) tags[k] = v || ''
        }
        line = line.slice(tagEnd + 1)
      }

      // Extract username from :username!username@username.tmi.twitch.tv
      const userMatch = line.match(/^:(\w+)!/)
      if (!userMatch) return null

      // Extract message text after PRIVMSG #channel :
      const msgMatch = line.match(/PRIVMSG #\w+ :(.*)/)
      if (!msgMatch) return null

      return {
        id: tags['id'] || `${Date.now()}-${Math.random()}`,
        username: userMatch[1],
        displayName: tags['display-name'] || userMatch[1],
        message: msgMatch[1],
        color: tags['color'] || this.randomColor(userMatch[1]),
        timestamp: parseInt(tags['tmi-sent-ts'] || `${Date.now()}`),
        badges: (tags['badges'] || '').split(',').filter(Boolean),
        isSubscriber: tags['subscriber'] === '1',
        isModerator: tags['mod'] === '1',
      }
    } catch {
      return null
    }
  }

  /** Generate a consistent random color for a username */
  private randomColor(username: string): string {
    let hash = 0
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash)
    }
    const hue = Math.abs(hash) % 360
    return `hsl(${hue}, 70%, 60%)`
  }
}

// ---------------------------------------------------------------------------
// YouTube Live Chat (polling-based)
// ---------------------------------------------------------------------------

export interface YouTubeMessage {
  id: string
  author: string
  message: string
  timestamp: number
}

/**
 * YouTube Live Chat requires the YouTube Data API v3 with a liveChatId.
 * This is a placeholder — full implementation needs:
 * 1. User provides their YouTube Live stream ID
 * 2. API call to get the liveChatId from the broadcast
 * 3. Poll liveChatMessages endpoint every few seconds
 *
 * For now, we provide the interface. Full implementation requires
 * a YouTube API key which the user will configure in stream settings.
 */
export class YouTubeChatClient {
  private pollInterval: NodeJS.Timeout | null = null
  private liveChatId: string = ''
  private apiKey: string = ''
  private nextPageToken: string = ''

  connect(liveChatId: string, apiKey: string, onMessage: (msg: YouTubeMessage) => void) {
    this.liveChatId = liveChatId
    this.apiKey = apiKey

    this.pollInterval = setInterval(async () => {
      try {
        const url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${this.liveChatId}&part=snippet,authorDetails&key=${this.apiKey}${this.nextPageToken ? `&pageToken=${this.nextPageToken}` : ''}`
        const res = await fetch(url)
        const data = await res.json()

        if (data.items) {
          for (const item of data.items) {
            onMessage({
              id: item.id,
              author: item.authorDetails?.displayName || 'Unknown',
              message: item.snippet?.displayMessage || '',
              timestamp: new Date(item.snippet?.publishedAt || '').getTime(),
            })
          }
        }

        if (data.nextPageToken) this.nextPageToken = data.nextPageToken
      } catch { /* swallow polling errors */ }
    }, 5000) // Poll every 5 seconds
  }

  disconnect() {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null }
  }
}
