import { NextRequest, NextResponse } from 'next/server'

// In-memory subscriber list (per-process, resets on restart — that's fine for notifications)
type SyncEvent = { type: string; timestamp: number; userId: string }
const subscribers = new Map<string, Array<(event: SyncEvent) => void>>()

function notifySubscribers(userId: string, event: SyncEvent) {
  const subs = subscribers.get(userId) || []
  subs.forEach(fn => fn(event))
}

// POST /api/sync — notify that data changed
export async function POST(req: NextRequest) {
  try {
    const { type, userId } = await req.json()
    if (!type || !userId) {
      return NextResponse.json({ error: 'type and userId required' }, { status: 400 })
    }

    notifySubscribers(userId, { type, timestamp: Date.now(), userId })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Sync POST error:', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// GET /api/sync?userId=xxx — SSE stream for real-time updates
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      // Send heartbeat immediately
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`))

      // Register subscriber
      const handler = (event: SyncEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          // Stream closed
        }
      }

      if (!subscribers.has(userId)) subscribers.set(userId, [])
      subscribers.get(userId)!.push(handler)

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`))
        } catch {
          clearInterval(heartbeat)
        }
      }, 30000)

      // Cleanup on close
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        const subs = subscribers.get(userId)
        if (subs) {
          const idx = subs.indexOf(handler)
          if (idx !== -1) subs.splice(idx, 1)
          if (subs.length === 0) subscribers.delete(userId)
        }
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
