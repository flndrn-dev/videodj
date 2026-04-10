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

  private cleanup() {
    if (this.pc) {
      this.pc.onconnectionstatechange = null
      this.pc.onicegatheringstatechange = null
      this.pc.close()
      this.pc = null
    }
    this.whipResourceUrl = null
  }
}
