/**
 * One-time migration: sync existing IndexedDB tracks to PostgreSQL
 *
 * v2 also migrates legacy timestamp IDs to UUIDs for PostgreSQL compatibility.
 */

import type { Track } from '@/app/hooks/usePlayerStore'
import * as syncEngine from '@/app/lib/syncEngine'
import { getFileRef, setFileRef, deleteTrackFromDB, saveTrack } from '@/app/lib/db'
import { toast } from 'sonner'

const MIGRATION_KEY = 'cloud_migration_v2'
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function migrateExistingTracks(tracks: Track[]): Promise<Track[]> {
  // Skip if already migrated or no user
  if (typeof window === 'undefined') return tracks
  if (localStorage.getItem(MIGRATION_KEY)) return tracks
  if (!syncEngine.getUserId()) return tracks
  if (tracks.length === 0) {
    localStorage.setItem(MIGRATION_KEY, new Date().toISOString())
    return tracks
  }

  console.log(`[migration] Starting migration for ${tracks.length} existing tracks`)

  // Step 1: Convert legacy timestamp IDs to UUIDs
  const legacyTracks = tracks.filter(t => !UUID_REGEX.test(t.id))
  const migratedTracks: Track[] = []

  if (legacyTracks.length > 0) {
    console.log(`[migration] Converting ${legacyTracks.length} legacy IDs to UUIDs`)
    toast.info(`Migrating ${legacyTracks.length} tracks...`)

    for (const track of tracks) {
      if (UUID_REGEX.test(track.id)) {
        migratedTracks.push(track)
        continue
      }
      // Generate new UUID, preserve File ref
      const oldId = track.id
      const newId = crypto.randomUUID()
      const fileRef = getFileRef(oldId)

      const newTrack: Track = { ...track, id: newId }

      // Save with new ID
      await saveTrack(newTrack)
      // Delete old entry
      await deleteTrackFromDB(oldId)

      // Move file ref from old ID to new ID
      if (fileRef) {
        setFileRef(newId, fileRef)
      }

      migratedTracks.push(newTrack)
    }
    console.log(`[migration] ID migration complete`)
  } else {
    migratedTracks.push(...tracks)
  }

  // Step 2: Sync metadata to PostgreSQL
  try {
    await syncEngine.syncMetadata(migratedTracks)
    console.log(`[migration] Metadata synced to PostgreSQL`)
  } catch (err) {
    console.error('[migration] Metadata sync failed:', err)
  }

  // Mark migration complete
  localStorage.setItem(MIGRATION_KEY, new Date().toISOString())
  console.log('[migration] Migration complete')

  return migratedTracks
}
