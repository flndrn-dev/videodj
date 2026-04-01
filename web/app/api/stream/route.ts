import { NextRequest, NextResponse } from 'next/server'
import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'

// ---------------------------------------------------------------------------
// Load .env
// ---------------------------------------------------------------------------

function loadEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '../.env')
  const env: Record<string, string> = {}
  if (!fs.existsSync(envPath)) return env
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
  }
  return env
}

// ---------------------------------------------------------------------------
// FFmpeg process management
// ---------------------------------------------------------------------------

let ffmpegProcess: ChildProcess | null = null
let streamActive = false

function findFFmpeg(): string | null {
  const paths = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    'ffmpeg', // rely on PATH
  ]
  for (const p of paths) {
    try {
      if (p === 'ffmpeg' || fs.existsSync(p)) return p
    } catch { /* skip */ }
  }
  return null
}

function startFFmpeg(rtmpUrl: string, width: number, height: number, videoBitrate: number, audioBitrate: number): boolean {
  if (ffmpegProcess) return true // already running

  const ffmpegPath = findFFmpeg()
  if (!ffmpegPath) return false

  // FFmpeg command: read webm from stdin, transcode to H.264+AAC, push to RTMP
  ffmpegProcess = spawn(ffmpegPath, [
    '-re',                          // read at native framerate
    '-i', 'pipe:0',                 // read from stdin
    '-c:v', 'libx264',             // H.264 video
    '-preset', 'veryfast',          // low latency encoding
    '-tune', 'zerolatency',        // minimize latency
    '-b:v', `${videoBitrate}k`,    // video bitrate
    '-maxrate', `${videoBitrate}k`,
    '-bufsize', `${videoBitrate * 2}k`,
    '-pix_fmt', 'yuv420p',         // compatible pixel format
    '-g', '60',                     // keyframe interval (2s at 30fps)
    '-r', '30',                     // output framerate
    '-s', `${width}x${height}`,    // output resolution
    '-c:a', 'aac',                  // AAC audio
    '-b:a', `${audioBitrate}k`,    // audio bitrate
    '-ar', '44100',                 // sample rate
    '-f', 'flv',                    // FLV container for RTMP
    rtmpUrl,                        // RTMP destination
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  streamActive = true

  ffmpegProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString()
    // Log FFmpeg output for debugging (only critical errors)
    if (msg.includes('Error') || msg.includes('error')) {
      console.error('[FFmpeg]', msg)
    }
  })

  ffmpegProcess.on('close', (code) => {
    console.log(`[FFmpeg] Process exited with code ${code}`)
    ffmpegProcess = null
    streamActive = false
  })

  ffmpegProcess.on('error', (err) => {
    console.error('[FFmpeg] Failed to start:', err.message)
    ffmpegProcess = null
    streamActive = false
  })

  return true
}

function stopFFmpeg() {
  if (ffmpegProcess) {
    ffmpegProcess.stdin?.end()
    ffmpegProcess.kill('SIGTERM')
    ffmpegProcess = null
  }
  streamActive = false
}

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

/**
 * POST /api/stream — Control the stream
 *
 * Actions:
 * - { action: "start", rtmpUrl, width, height, videoBitrate, audioBitrate }
 * - { action: "stop" }
 * - { action: "status" }
 * - { action: "check-ffmpeg" }
 * - { action: "data", chunk: base64 } — send video data chunk to FFmpeg
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    switch (action) {
      case 'check-ffmpeg': {
        const ffmpegPath = findFFmpeg()
        if (!ffmpegPath) {
          return NextResponse.json({
            success: false,
            installed: false,
            error: 'FFmpeg not found. Install it with: brew install ffmpeg',
          })
        }
        return NextResponse.json({ success: true, installed: true, path: ffmpegPath })
      }

      case 'start': {
        const { rtmpUrl, width = 1280, height = 720, videoBitrate = 4500, audioBitrate = 192 } = body

        if (!rtmpUrl) {
          return NextResponse.json({ success: false, error: 'No RTMP URL provided' }, { status: 400 })
        }

        // Check FFmpeg
        const ffmpegPath = findFFmpeg()
        if (!ffmpegPath) {
          return NextResponse.json({ success: false, error: 'FFmpeg not installed' }, { status: 500 })
        }

        const started = startFFmpeg(rtmpUrl, width, height, videoBitrate, audioBitrate)
        if (!started) {
          return NextResponse.json({ success: false, error: 'Failed to start FFmpeg' }, { status: 500 })
        }

        return NextResponse.json({ success: true, streaming: true })
      }

      case 'stop': {
        stopFFmpeg()
        return NextResponse.json({ success: true, streaming: false })
      }

      case 'status': {
        return NextResponse.json({
          success: true,
          streaming: streamActive,
          ffmpegRunning: !!ffmpegProcess,
        })
      }

      case 'data': {
        // Receive base64-encoded video chunk and pipe to FFmpeg stdin
        if (!ffmpegProcess || !ffmpegProcess.stdin) {
          return NextResponse.json({ success: false, error: 'Stream not active' }, { status: 400 })
        }

        const { chunk } = body
        if (!chunk) {
          return NextResponse.json({ success: false, error: 'No data chunk' }, { status: 400 })
        }

        const buffer = Buffer.from(chunk, 'base64')
        const writeOk = ffmpegProcess.stdin.write(buffer)

        return NextResponse.json({ success: true, written: buffer.length, backpressure: !writeOk })
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 })
  }
}

/**
 * GET /api/stream — Get stream status
 */
export async function GET() {
  const env = loadEnv()
  return NextResponse.json({
    success: true,
    streaming: streamActive,
    ffmpegRunning: !!ffmpegProcess,
    hasTwitchKey: !!(env.TWITCH_STREAM_KEY),
    hasYoutubeKey: !!(env.YOUTUBE_STREAM_KEY),
  })
}
