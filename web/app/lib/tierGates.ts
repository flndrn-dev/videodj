/**
 * Tier-based feature gating for videoDJ.Studio
 * Tiers: free (7-day trial, 14 for pre-subscribers), dj (paid)
 * Admin can set tiers manually until payments are wired.
 */

export type UserTier = 'free' | 'dj'

export interface TierLimits {
  maxTracks: number
  streaming: boolean
  backup: boolean
  autoBackup: boolean
  catalogAccess: boolean
  playlistSharing: boolean
  aiAgent: boolean
  trialDays: number
}

const TIER_CONFIG: Record<UserTier, TierLimits> = {
  free: {
    maxTracks: 100,
    streaming: true,      // let them try during trial
    backup: false,
    autoBackup: false,
    catalogAccess: false,
    playlistSharing: false,
    aiAgent: true,        // let them try Linus during trial
    trialDays: 7,
  },
  dj: {
    maxTracks: Infinity,
    streaming: true,
    backup: true,
    autoBackup: true,
    catalogAccess: true,
    playlistSharing: true,
    aiAgent: true,
    trialDays: 0,
  },
}

export function getTierLimits(tier: UserTier): TierLimits {
  return TIER_CONFIG[tier] || TIER_CONFIG.free
}

export function checkFeature(tier: UserTier, feature: keyof TierLimits): boolean {
  const limits = getTierLimits(tier)
  const value = limits[feature]
  return typeof value === 'boolean' ? value : true
}

export function checkTrackLimit(tier: UserTier, currentCount: number): { allowed: boolean; limit: number; remaining: number } {
  const limits = getTierLimits(tier)
  return {
    allowed: currentCount < limits.maxTracks,
    limit: limits.maxTracks,
    remaining: Math.max(0, limits.maxTracks - currentCount),
  }
}

/** Check if trial has expired (7 days default, 14 for pre-subscribers) */
export function isTrialExpired(trialStartedAt: string | null, trialDays = 7): boolean {
  if (!trialStartedAt) return false
  const start = new Date(trialStartedAt).getTime()
  const now = Date.now()
  return (now - start) > trialDays * 24 * 60 * 60 * 1000
}
