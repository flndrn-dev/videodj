/**
 * Tier-based feature gating for videoDJ.Studio
 * Tiers: free (7-day trial), fun_user, dj_user
 * Admin can set tiers manually until payments are wired.
 */

export type UserTier = 'free' | 'fun_user' | 'dj_user'

export interface TierLimits {
  maxTracks: number
  streaming: boolean
  backup: boolean
  autoBackup: boolean
  catalogAccess: boolean
  playlistSharing: boolean
}

const TIER_CONFIG: Record<UserTier, TierLimits> = {
  free: {
    maxTracks: 50,
    streaming: false,
    backup: false,
    autoBackup: false,
    catalogAccess: false,
    playlistSharing: false,
  },
  fun_user: {
    maxTracks: 500,
    streaming: true,
    backup: true,
    autoBackup: false,
    catalogAccess: true,
    playlistSharing: true,
  },
  dj_user: {
    maxTracks: Infinity,
    streaming: true,
    backup: true,
    autoBackup: true,
    catalogAccess: true,
    playlistSharing: true,
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

/** Check if trial has expired (7 days from creation) */
export function isTrialExpired(trialStartedAt: string | null): boolean {
  if (!trialStartedAt) return false
  const start = new Date(trialStartedAt).getTime()
  const now = Date.now()
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  return (now - start) > sevenDays
}
