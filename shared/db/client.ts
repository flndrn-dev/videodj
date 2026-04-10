/**
 * Shared PostgreSQL client for videoDJ.Studio
 * Used by admin/, site/, and web/ apps
 *
 * Connection string: DATABASE_URL env var
 * Default: postgresql://ghost:gh0st_s3cure_p4ss@localhost:5432/videodj_studio
 */

import pg from 'pg'

const { Pool } = pg

let pool: pg.Pool | null = null

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://ghost:gh0st_s3cure_p4ss@localhost:5432/videodj_studio',
      max: 10,
    })
  }
  return pool
}

export async function query<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params)
}

export async function queryOne<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await query<T>(text, params)
  return result.rows[0] || null
}

export async function queryMany<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await query<T>(text, params)
  return result.rows
}
