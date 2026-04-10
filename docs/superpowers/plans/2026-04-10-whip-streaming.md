# WHIP Streaming for Twitch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken FFmpeg server-relay streaming with browser-native WHIP that pushes directly from the browser to Twitch at zero server cost.

**Architecture:** The existing `StreamCompositor` produces a `MediaStream` (canvas video + Web Audio). Instead of recording WebM chunks and POST-ing them to a server-side FFmpeg process, a new `WHIPClient` feeds that MediaStream into an `RTCPeerConnection` and negotiates directly with Twitch's WHIP endpoint (`https://ingest.twitch.tv/v1/whip`). No server involvement.

**Tech Stack:** WebRTC (native browser API), WHIP protocol (HTTP + SDP), existing StreamCompositor

---

### Task 1: Create WHIPClient

**Files:**
- Create: `web/app/lib/whipClient.ts`

- [ ] **Step 1: Create the WHIPClient class with types and constructor**

```typescript
/**
 * WHIP (WebRTC-HTTP Ingestion Protocol) client for Twitch.
 *
 * Pushes a MediaStream directly to Twitch's WHIP ingest endpoint
 * using WebRTC — no server relay, no FFmpeg, zero cost.
 */

export type WHIPState = 'idle' | 'connecting' | 'live' | 'error'

export interface WHIPClientOptions {
  /** Video bitrate in kbps (default 4500) */
  videoBitrate?: number
}

export class WHIPClient {
  private pc: RTCPeerConnection | null = null
  private whipResourceUrl: string | null = null
  private state: WHIPState = 'idle'
  private onStateChange: ((state: WHIPState, error?: string) => void) | null = null

  /** Subscribe to state changes */
  setOnStateChange(cb: (state: WHIPState, error?: string) => void) {
    this.onStateChange = cb
  }

  /** Get current state */
  getState(): WHIPState {
    return this.state
  }

  private setState(state: WHIPState, error?: string) {
    this.state = state
    this.onStateChange?.(state, error)
  }
}
```

- [ ] **Step 2: Add the `start` method — create RTCPeerConnection, add tracks, prefer H.264**

Add this method to the `WHIPClient` class:

```typescript
  /**
   * Start streaming a MediaStream to Twitch via WHIP.
   *
   * @param stream - MediaStream from StreamCompositor (canvas video + mixed audio)
   * @param streamKey - Twitch stream key (used as Bearer token)
   * @param options - Optional bitrate config
   */
  async start(stream: MediaStream, streamKey: string, options: WHIPClientOptions = {}): Promise<void> {
    if (this.pc) {
      throw new Error('WHIPClient already started — call stop() first')
    }

    this.setState('connecting')

    try {
      // Create peer connection (no ICE servers needed — Twitch handles TURN)
      this.pc = new RTCPeerConnection()

      // Monitor connection state
      this.pc.onconnectionstatechange = () => {
        const s = this.pc?.connectionState
        if (s === 'connected') this.setState('live')
        else if (s === 'failed' || s === 'disconnected') this.setState('error', `Connection ${s}`)
        else if (s === 'closed') this.setState('idle')
      }

      // Add tracks from the compositor MediaStream
      for (const track of stream.getTracks()) {
        this.pc.addTrack(track, stream)
      }

      // Prefer H.264 for video (Twitch requires it)
      for (const transceiver of this.pc.getTransceivers()) {
        if (transceiver.sender.track?.kind === 'video') {
          const codecs = RTCRtpSender.getCapabilities('video')?.codecs ?? []
          const h264 = codecs.filter(c => c.mimeType === 'video/H264')
          const rest = codecs.filter(c => c.mimeType !== 'video/H264')
          if (h264.length > 0) {
            transceiver.setCodecPreferences([...h264, ...rest])
          }
        }
      }

      // Set video bitrate
      const videoBitrate = (options.videoBitrate ?? 4500) * 1000 // kbps → bps
      for (const sender of this.pc.getSenders()) {
        if (sender.track?.kind === 'video') {
          const params = sender.getParameters()
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}]
          }
          params.encodings[0].maxBitrate = videoBitrate
          await sender.setParameters(params)
        }
      }

      // Create offer
      const offer = await this.pc.createOffer()
      await this.pc.setLocalDescription(offer)

      // Wait for ICE gathering to complete (bundle all candidates in the offer)
      const localDesc = await this.waitForICEGathering()

      // POST SDP offer to Twitch WHIP endpoint
      const whipUrl = 'https://ingest.twitch.tv/v1/whip'
      const resp = await fetch(whipUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          'Authorization': `Bearer ${streamKey}`,
        },
        body: localDesc.sdp,
      })

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        if (resp.status === 401) {
          throw new Error('Invalid stream key')
        }
        throw new Error(`WHIP negotiation failed (${resp.status}): ${text}`)
      }

      // Save the resource URL for DELETE on stop
      const location = resp.headers.get('Location')
      if (location) {
        // Location may be relative — resolve against the WHIP URL
        this.whipResourceUrl = new URL(location, whipUrl).toString()
      }

      // Apply SDP answer
      const answerSDP = await resp.text()
      await this.pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSDP,
      })

    } catch (err) {
      this.cleanup()
      const message = err instanceof Error ? err.message : 'Unknown error'
      this.setState('error', message)
      throw err
    }
  }
```

- [ ] **Step 3: Add `waitForICEGathering` helper**

Add this private method to the class:

```typescript
  /** Wait for ICE gathering to complete so we send a full offer (no trickle) */
  private waitForICEGathering(): Promise<RTCSessionDescription> {
    return new Promise((resolve, reject) => {
      if (!this.pc) return reject(new Error('No peer connection'))

      // Already complete
      if (this.pc.iceGatheringState === 'complete') {
        return resolve(this.pc.localDescription!)
      }

      const timeout = setTimeout(() => {
        // If gathering takes too long, send what we have
        if (this.pc?.localDescription) {
          resolve(this.pc.localDescription)
        } else {
          reject(new Error('ICE gathering timed out'))
        }
      }, 5000)

      this.pc.onicegatheringstatechange = () => {
        if (this.pc?.iceGatheringState === 'complete') {
          clearTimeout(timeout)
          resolve(this.pc.localDescription!)
        }
      }
    })
  }
```

- [ ] **Step 4: Add `stop` and `cleanup` methods**

Add these methods to the class:

```typescript
  /** Stop the stream and tear down the connection */
  async stop(): Promise<void> {
    // Send DELETE to WHIP resource URL to cleanly end the session
    if (this.whipResourceUrl) {
      try {
        await fetch(this.whipResourceUrl, { method: 'DELETE' })
      } catch {
        // Best effort — the connection will close anyway
      }
    }

    this.cleanup()
    this.setState('idle')
  }

  private cleanup() {
    if (this.pc) {
      this.pc.onconnectionstatechange = null
      this.pc.onicegatheringstatechange = null
      this.pc.close()
      this.pc = null
    }
    this.whipResourceUrl = null
  }
```

- [ ] **Step 5: Commit**

```bash
git add web/app/lib/whipClient.ts
git commit -m "feat: add WHIPClient for direct browser-to-Twitch streaming"
```

---

### Task 2: Fix StreamCompositor audio bug

**Files:**
- Modify: `web/app/lib/streamCapture.ts` (line 145-172, the `start()` method)

The `start()` method never calls `initAudio()`, so the stream has no audio tracks.

- [ ] **Step 1: Add `initAudio()` call at the beginning of `start()`**

In `web/app/lib/streamCapture.ts`, inside the `start()` method, add `this.initAudio()` right after the early return check:

```typescript
  /** Start compositing frames to canvas */
  start(): MediaStream {
    if (this.running) return this.combinedStream!

    this.running = true

    // Initialize audio routing (creates AudioContext + gain nodes + destination)
    this.initAudio()

    // Create video stream from canvas
    const canvasStream = this.canvas.captureStream(this.config.fps)
```

The rest of the method stays the same — the existing `if (this.audioDestination)` check on line 162 will now find a valid audioDestination and add audio tracks to the combined stream.

- [ ] **Step 2: Remove the `StreamRecorder` class**

Delete the entire `StreamRecorder` class (lines 324-385) from `web/app/lib/streamCapture.ts`. It's no longer needed — WHIPClient replaces it.

Also remove the comment block above it:

```
// ---------------------------------------------------------------------------
// MediaRecorder wrapper for streaming
// ---------------------------------------------------------------------------
```

- [ ] **Step 3: Commit**

```bash
git add web/app/lib/streamCapture.ts
git commit -m "fix: call initAudio() in StreamCompositor.start(), remove unused StreamRecorder"
```

---

### Task 3: Update StreamDashboard to use WHIPClient

**Files:**
- Modify: `web/components/StreamDashboard.tsx`

- [ ] **Step 1: Update imports**

Replace the import line at the top:

Old:
```typescript
import { StreamCompositor, StreamRecorder, DEFAULT_STREAM_CONFIG, RESOLUTION_PRESETS, type StreamConfig } from '@/app/lib/streamCapture'
```

New:
```typescript
import { StreamCompositor, DEFAULT_STREAM_CONFIG, RESOLUTION_PRESETS, type StreamConfig } from '@/app/lib/streamCapture'
import { WHIPClient } from '@/app/lib/whipClient'
```

- [ ] **Step 2: Remove FFmpeg and YouTube state, replace with WHIPClient ref**

Remove these state variables:
- `platform` and `setPlatform` (line 28)
- `ffmpegInstalled` and `setFfmpegInstalled` (line 35)

Remove the `recorderRef`:
```typescript
const recorderRef = useRef<StreamRecorder | null>(null)
```

Add a WHIPClient ref:
```typescript
const whipClientRef = useRef<WHIPClient | null>(null)
```

Remove the `StreamPlatform` type alias (line 20).

- [ ] **Step 3: Remove the FFmpeg check useEffect**

Delete the entire FFmpeg check effect (lines 52-61):

```typescript
  // Check FFmpeg on mount
  useEffect(() => {
    fetch('/api/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check-ffmpeg' }),
    })
      .then(r => r.json())
      .then(data => setFfmpegInstalled(data.installed))
      .catch(() => setFfmpegInstalled(false))
  }, [])
```

- [ ] **Step 4: Update the stream key localStorage to use 'twitch' directly**

Change the stream key load effect:

```typescript
  // Load saved stream key from localStorage
  useEffect(() => {
    const savedKey = localStorage.getItem('stream_key_twitch')
    if (savedKey) setStreamKey(savedKey)
  }, [])
```

- [ ] **Step 5: Rewrite `goLive` to use WHIPClient**

Replace the entire `goLive` callback with:

```typescript
  // Go Live
  const goLive = useCallback(async () => {
    if (!streamKey) { setError('Enter your Twitch stream key'); return }
    if (!compositorRef.current) { setError('Preview not started'); return }

    setError('')
    setStatus('connecting')

    try {
      // Get the compositor's MediaStream (now includes audio thanks to initAudio fix)
      const stream = compositorRef.current.getStream()
      if (!stream) { setStatus('error'); setError('No stream available'); return }

      // Save stream key
      localStorage.setItem('stream_key_twitch', streamKey)

      // Create WHIP client and start streaming
      const whipClient = new WHIPClient()
      whipClientRef.current = whipClient

      whipClient.setOnStateChange((state, err) => {
        if (state === 'live') {
          setStatus('live')
        } else if (state === 'error') {
          setStatus('error')
          setError(err || 'Stream connection failed')
        } else if (state === 'idle') {
          setStatus('offline')
        }
      })

      await whipClient.start(stream, streamKey, { videoBitrate: bitrate })

      // Duration counter
      setStreamDuration(0)
      durationIntervalRef.current = setInterval(() => {
        setStreamDuration(d => d + 1)
      }, 1000)

    } catch (e) {
      setStatus('error')
      setError((e as Error).message)
    }
  }, [streamKey, bitrate])
```

- [ ] **Step 6: Rewrite `stopStream` to use WHIPClient**

Replace the entire `stopStream` callback with:

```typescript
  // Stop stream
  const stopStream = useCallback(async () => {
    await whipClientRef.current?.stop()
    whipClientRef.current = null

    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current)

    setStatus('offline')
    setStreamDuration(0)
  }, [])
```

- [ ] **Step 7: Remove FFmpeg status and YouTube platform from the JSX**

Remove the FFmpeg status block (lines 318-328 — the two conditional divs showing "FFmpeg not found" and "FFmpeg ready").

Remove the Platform selector block (lines 330-345 — the entire `<div>` with label "Platform" and the Twitch/YouTube buttons).

Update the subtitle text on line 266 from:
```
Configure and go live on Twitch or YouTube
```
to:
```
Go live on Twitch
```

Remove the `disabled` check for `!ffmpegInstalled` from the GO LIVE button (line 435 and 441):

Old:
```typescript
disabled={status === 'connecting' || !ffmpegInstalled}
```
New:
```typescript
disabled={status === 'connecting'}
```

Old (opacity line):
```typescript
opacity: !ffmpegInstalled ? 0.4 : 1,
```
New:
```typescript
opacity: status === 'connecting' ? 0.5 : 1,
```

Old (cursor line):
```typescript
cursor: status === 'connecting' || !ffmpegInstalled ? 'not-allowed' : 'pointer',
```
New:
```typescript
cursor: status === 'connecting' ? 'not-allowed' : 'pointer',
```

Update the stream key placeholder to only show Twitch format:
```typescript
placeholder="live_xxxxxxxxx"
```

- [ ] **Step 8: Remove the `sendIntervalRef` (unused after removing chunk sending)**

Remove:
```typescript
const sendIntervalRef = useRef<NodeJS.Timeout | null>(null)
```

And remove from `stopStream`:
```typescript
if (sendIntervalRef.current) clearInterval(sendIntervalRef.current)
```

- [ ] **Step 9: Commit**

```bash
git add web/components/StreamDashboard.tsx
git commit -m "feat: replace FFmpeg relay with WHIP in StreamDashboard"
```

---

### Task 4: Delete server-side streaming code

**Files:**
- Delete: `web/app/api/stream/route.ts`
- Delete: `web/stream-server.mjs`

- [ ] **Step 1: Delete the FFmpeg stream API route**

```bash
rm web/app/api/stream/route.ts
```

If the directory `web/app/api/stream/` is now empty, remove it too:

```bash
rmdir web/app/api/stream 2>/dev/null || true
```

- [ ] **Step 2: Delete the standalone WebSocket stream server**

```bash
rm web/stream-server.mjs
```

- [ ] **Step 3: Check for any remaining imports of the deleted files**

Search the codebase for references to `/api/stream` or `stream-server` and remove any remaining imports or references. Key places to check:
- `web/app/lib/streamCapture.ts` (should have no references after Task 2)
- `web/components/StreamDashboard.tsx` (should have no references after Task 3)
- `web/components/StreamPreview.tsx` (may have references — remove them)

For `StreamPreview.tsx`: if it references `/api/stream` or the WebSocket stream server, those code paths are dead and should be removed or commented out pending a full StreamPreview rewrite.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove server-side FFmpeg streaming code (replaced by WHIP)"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Build check**

```bash
cd web && npm run build
```

Fix any TypeScript or build errors. Common issues:
- StreamPreview.tsx may still import `StreamRecorder` — remove the import
- Any remaining `/api/stream` fetch calls — remove them

- [ ] **Step 2: Dev server smoke test**

```bash
npm run dev:web
```

1. Open `localhost:3030`
2. Click STREAM button in header
3. Verify: StreamDashboard opens, no FFmpeg check, no YouTube option
4. Verify: preview canvas shows composited video
5. Enter a Twitch stream key and click GO LIVE
6. Check browser console for WHIP negotiation (SDP offer/answer exchange)
7. If you have a valid stream key, verify the stream appears on Twitch

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build issues from WHIP migration"
```
