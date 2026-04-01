/**
 * Pending updates confirmation flow.
 * Stores proposed track metadata changes until the user approves or cancels.
 */

import type { PendingUpdate } from '@/app/lib/commandProcessor'

export interface PendingBatch {
  id: string
  updates: PendingUpdate[]
  source: string
  createdAt: number
}

let pendingBatch: PendingBatch | null = null

export function setPendingBatch(batch: PendingBatch): void {
  pendingBatch = batch
}

export function getPendingBatch(): PendingBatch | null {
  return pendingBatch
}

export function clearPendingBatch(): void {
  pendingBatch = null
}

/**
 * Returns the pending updates and clears the batch.
 */
export function applyPendingBatch(): PendingUpdate[] | null {
  if (!pendingBatch) return null
  const updates = pendingBatch.updates
  pendingBatch = null
  return updates
}

/**
 * Check if user input is a confirmation/cancellation of pending batch.
 */
export function isConfirmation(text: string): boolean {
  const lower = text.trim().toLowerCase()
  return ['apply', 'yes', 'confirm', 'ok', 'save', 'do it'].includes(lower)
}

export function isCancellation(text: string): boolean {
  const lower = text.trim().toLowerCase()
  return ['cancel', 'no', 'discard', 'skip', 'nope', 'nevermind'].includes(lower)
}

/**
 * Build a human-readable summary of the pending batch.
 */
export function buildPendingSummary(updates: PendingUpdate[]): string {
  if (updates.length === 0) return 'No changes to apply.'

  // Group changes by field
  const fieldCounts: Record<string, number> = {}
  for (const u of updates) {
    for (const key of Object.keys(u.changes)) {
      fieldCounts[key] = (fieldCounts[key] || 0) + 1
    }
  }

  const fieldSummary = Object.entries(fieldCounts)
    .map(([field, count]) => `- ${field}: ${count} track${count > 1 ? 's' : ''}`)
    .join('\n')

  const trackList = updates.slice(0, 15).map(u => {
    const fields = Object.entries(u.changes)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    return `- ${u.trackArtist || 'Unknown'} — ${u.trackTitle}: ${fields}`
  }).join('\n')

  const overflow = updates.length > 15 ? `\n...and ${updates.length - 15} more tracks` : ''

  return `Found metadata for ${updates.length} tracks:\n\n**Changes by field:**\n${fieldSummary}\n\n**Details:**\n${trackList}${overflow}\n\nType "apply" to save these changes, or "cancel" to discard.`
}
