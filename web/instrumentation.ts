/**
 * Next.js Instrumentation — starts WebSocket stream server (port 3031)
 * directly inside the Next.js process. No separate terminal needed.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { WebSocketServer } = await import('ws')
    const { spawn } = await import('child_process')
    const fs = await import('fs')
    const net = await import('net')

    // Check if port 3031 is already in use
    const portInUse = await new Promise<boolean>((resolve) => {
      const tester = net.createServer()
        .once('error', () => resolve(true))
        .once('listening', () => { tester.close(); resolve(false) })
        .listen(3031)
    })

    if (portInUse) {
      console.log('[Stream] WebSocket server already running on port 3031')
      return
    }

    // ---------------------------------------------------------------------------
    // FFmpeg management
    // ---------------------------------------------------------------------------
    let ffmpegProcess: ReturnType<typeof spawn> | null = null

    function findFFmpeg(): string {
      for (const p of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']) {
        if (fs.existsSync(p)) return p
      }
      return 'ffmpeg'
    }

    function startFFmpeg(rtmpUrl: string) {
      if (ffmpegProcess) {
        console.log('[Stream] Killing old FFmpeg process')
        try { ffmpegProcess.stdin?.end() } catch {}
        ffmpegProcess.kill('SIGTERM')
        ffmpegProcess = null
      }

      const ffmpegPath = findFFmpeg()
      console.log(`[Stream] Starting FFmpeg: ${ffmpegPath}`)
      console.log(`[Stream] RTMP URL: ${rtmpUrl.replace(/\/[^/]+$/, '/****')}`)

      ffmpegProcess = spawn(ffmpegPath, [
        '-re',
        '-i', 'pipe:0',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-tune', 'zerolatency',
        '-b:v', '4500k',
        '-maxrate', '4500k',
        '-bufsize', '9000k',
        '-pix_fmt', 'yuv420p',
        '-g', '60',
        '-r', '30',
        '-s', '1920x1080',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-f', 'flv',
        rtmpUrl,
      ], { stdio: ['pipe', 'pipe', 'pipe'] })

      let started = false
      ffmpegProcess.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString()
        if (!started) {
          console.log(`[FFmpeg] ${msg.trim().slice(0, 200)}`)
          if (msg.includes('frame=') || msg.includes('Output #0')) {
            started = true
            console.log('[FFmpeg] ✓ Encoding and streaming to RTMP')
          }
        } else if (msg.includes('frame=')) {
          process.stdout.write(`\r[FFmpeg] ${msg.trim().slice(0, 120)}`)
        } else if (msg.includes('Error') || msg.includes('error')) {
          console.error(`\n[FFmpeg ERROR] ${msg.trim()}`)
        }
      })

      ffmpegProcess.on('close', (code: number | null) => {
        console.log(`\n[Stream] FFmpeg exited with code ${code}`)
        ffmpegProcess = null
      })

      ffmpegProcess.on('error', (err: Error) => {
        console.error('[Stream] FFmpeg failed:', err.message)
        ffmpegProcess = null
      })
    }

    function stopFFmpeg() {
      if (ffmpegProcess) {
        console.log('\n[Stream] Stopping FFmpeg...')
        try { ffmpegProcess.stdin?.end() } catch {}
        ffmpegProcess.kill('SIGTERM')
        ffmpegProcess = null
      }
    }

    // ---------------------------------------------------------------------------
    // WebSocket server
    // ---------------------------------------------------------------------------
    const wss = new WebSocketServer({ port: 3031 })
    console.log('[Stream] ✓ WebSocket server listening on ws://localhost:3031')

    wss.on('connection', (ws: import('ws').WebSocket) => {
      console.log('[Stream] Browser connected')
      let bytesReceived = 0
      let chunkCount = 0

      ws.on('message', (data: import('ws').RawData) => {
        // Try JSON config first (text messages)
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as unknown as Uint8Array)

        // Small messages (<200 bytes) are likely JSON config
        if (buf.length < 200) {
          try {
            const config = JSON.parse(buf.toString())
            if (config.action === 'start' && config.rtmpUrl) {
              startFFmpeg(config.rtmpUrl)
              ws.send(JSON.stringify({ status: 'started' }))
              return
            } else if (config.action === 'stop') {
              stopFFmpeg()
              ws.send(JSON.stringify({ status: 'stopped' }))
              return
            }
          } catch { /* not JSON — treat as binary */ }
        }

        // Binary data — pipe to FFmpeg
        if (ffmpegProcess?.stdin && !ffmpegProcess.stdin.destroyed) {
          bytesReceived += buf.length
          chunkCount++

          if (chunkCount === 1) console.log(`[Stream] First chunk received: ${buf.length} bytes`)
          if (chunkCount % 20 === 0) {
            const mb = (bytesReceived / 1024 / 1024).toFixed(1)
            process.stdout.write(`\r[Stream] Chunks: ${chunkCount} | Data: ${mb} MB`)
          }

          try {
            ffmpegProcess.stdin.write(buf)
          } catch (e: unknown) {
            const err = e as Error
            console.error('\n[Stream] Write error:', err.message)
          }
        } else if (chunkCount === 0) {
          console.warn('[Stream] Received data but FFmpeg stdin not ready')
        }
      })

      ws.on('close', () => {
        console.log('\n[Stream] Browser disconnected')
        stopFFmpeg()
      })

      ws.on('error', (err: Error) => {
        console.error('[Stream] WebSocket error:', err.message)
      })
    })

    // Cleanup
    const cleanup = () => { stopFFmpeg(); wss.close() }
    process.on('exit', cleanup)
    process.on('SIGTERM', cleanup)
    process.on('SIGINT', cleanup)
  }
}
