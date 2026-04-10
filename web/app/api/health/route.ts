import { NextResponse } from 'next/server'

async function checkDb(): Promise<boolean> {
  try {
    const pg = await import('pg')
    const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL!, max: 1 })
    await pool.query('SELECT 1')
    await pool.end()
    return true
  } catch {
    return false
  }
}

export async function GET() {
  const dbOk = await checkDb()
  // Always return 200 for Docker HEALTHCHECK — app is running even if DB is down
  return NextResponse.json({
    status: dbOk ? 'healthy' : 'degraded',
    db: dbOk ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })
}
