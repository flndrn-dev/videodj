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
  profileImageUrl?: string
  isModerator: boolean
  isOwner: boolean
}

export type YouTubeChatCallback = (message: YouTubeMessage) => void
export type YouTubeStatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error', error?: string) => void

/**
 * YouTube Live Chat client using YouTube Data API v3.
 * Polls liveChatMessages endpoint with proper pagination and rate limiting.
 * Requires a YouTube API key and either a liveChatId or broadcast/video ID.
 */
export class YouTubeChatClient {
  private pollTimer: NodeJS.Timeout | null = null
  private liveChatId: string = ''
  private apiKey: string = ''
  private nextPageToken: string = ''
  private pollingIntervalMs: number = 5000
  private onMessage: YouTubeChatCallback | null = null
  private onStatus: YouTubeStatusCallback | null = null
  private seenIds = new Set<string>()
  private connected = false

  /**
   * Connect to YouTube Live Chat.
   * @param idOrUrl — liveChatId, video ID, or YouTube live URL
   * @param apiKey — YouTube Data API v3 key
   * @param onMessage — callback for each new chat message
   * @param onStatus — optional status callback
   */
  async connect(idOrUrl: string, apiKey: string, onMessage: YouTubeChatCallback, onStatus?: YouTubeStatusCallback) {
    this.apiKey = apiKey
    this.onMessage = onMessage
    this.onStatus = onStatus || null
    this.seenIds.clear()
    this.nextPageToken = ''

    this.onStatus?.('connecting')

    try {
      // Resolve liveChatId from video ID or URL if needed
      this.liveChatId = await this.resolveLiveChatId(idOrUrl)
      if (!this.liveChatId) {
        this.onStatus?.('error', 'Could not find live chat for this stream')
        return
      }

      this.connected = true
      this.onStatus?.('connected')
      this.startPolling()
    } catch (err) {
      this.onStatus?.('error', (err as Error).message)
    }
  }

  disconnect() {
    this.connected = false
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
    this.seenIds.clear()
    this.onStatus?.('disconnected')
  }

  isConnected(): boolean {
    return this.connected
  }

  /** Resolve a liveChatId from various input formats */
  private async resolveLiveChatId(input: string): Promise<string> {
    // If it looks like a liveChatId already (long alphanumeric), use directly
    if (input.length > 30 && !input.includes('/') && !input.includes('.')) {
      return input
    }

    // Extract video ID from URL
    let videoId = input
    try {
      const url = new URL(input)
      videoId = url.searchParams.get('v') || url.pathname.split('/').pop() || input
    } catch {
      // Not a URL — treat as video ID directly
    }

    // Fetch broadcast details to get liveChatId
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=liveStreamingDetails&key=${this.apiKey}`
    )
    const data = await res.json()

    if (data.error) {
      throw new Error(data.error.message || 'YouTube API error')
    }

    return data.items?.[0]?.liveStreamingDetails?.activeLiveChatId || ''
  }

  private startPolling() {
    // Initial fetch immediately
    this.poll()

    this.pollTimer = setInterval(() => {
      if (this.connected) this.poll()
    }, this.pollingIntervalMs)
  }

  private async poll() {
    try {
      const params = new URLSearchParams({
        liveChatId: this.liveChatId,
        part: 'snippet,authorDetails',
        key: this.apiKey,
        maxResults: '200',
      })
      if (this.nextPageToken) params.set('pageToken', this.nextPageToken)

      const res = await fetch(`https://www.googleapis.com/youtube/v3/liveChat/messages?${params}`)
      const data = await res.json()

      if (data.error) {
        // Rate limit or auth error
        if (data.error.code === 403) {
          this.pollingIntervalMs = Math.min(this.pollingIntervalMs * 2, 30000)
          console.warn(`[YouTubeChat] Rate limited, backing off to ${this.pollingIntervalMs}ms`)
        } else {
          this.onStatus?.('error', data.error.message)
          this.disconnect()
        }
        return
      }

      // Use YouTube's recommended polling interval if provided
      if (data.pollingIntervalMillis) {
        this.pollingIntervalMs = Math.max(data.pollingIntervalMillis, 3000)
        // Restart interval with new timing
        if (this.pollTimer) {
          clearInterval(this.pollTimer)
          this.pollTimer = setInterval(() => { if (this.connected) this.poll() }, this.pollingIntervalMs)
        }
      }

      if (data.items) {
        for (const item of data.items) {
          const id = item.id
          if (this.seenIds.has(id)) continue
          this.seenIds.add(id)

          this.onMessage?.({
            id,
            author: item.authorDetails?.displayName || 'Unknown',
            message: item.snippet?.displayMessage || '',
            timestamp: new Date(item.snippet?.publishedAt || '').getTime(),
            profileImageUrl: item.authorDetails?.profileImageUrl,
            isModerator: item.authorDetails?.isChatModerator || false,
            isOwner: item.authorDetails?.isChatOwner || false,
          })
        }
      }

      if (data.nextPageToken) this.nextPageToken = data.nextPageToken

      // Limit seenIds memory (keep last 2000)
      if (this.seenIds.size > 2000) {
        const arr = Array.from(this.seenIds)
        this.seenIds = new Set(arr.slice(-1000))
      }
    } catch (err) {
      console.error('[YouTubeChat] Poll error:', err)
    }
  }
}
