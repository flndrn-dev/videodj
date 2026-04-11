/**
 * Client-side error reporter for videoDJ.Studio
 * Catches unhandled errors + promise rejections and ships to admin dashboard.
 */

let userId: string | null = null
let userEmail: string | null = null
let initialized = false
const reportedErrors = new Set<string>() // deduplicate by message

export function setUser(id: string | null, email: string | null) {
  userId = id
  userEmail = email
}

export async function reportError(error: {
  message: string
  stack?: string
  component?: string
  severity?: 'error' | 'warning' | 'critical'
}) {
  // Deduplicate — don't report the same error repeatedly
  const key = `${error.message}::${error.component}`
  if (reportedErrors.has(key)) return
  reportedErrors.add(key)
  // Clear old entries after 100
  if (reportedErrors.size > 100) reportedErrors.clear()

  try {
    await fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        component: error.component || 'app',
        severity: error.severity || 'error',
        userId,
        userEmail,
        browser: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        url: typeof window !== 'undefined' ? window.location.href : null,
      }),
    })
  } catch {
    // Silent — error reporting should never break the app
  }
}

export function initErrorReporter() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  // Catch unhandled errors
  window.addEventListener('error', (event) => {
    reportError({
      message: event.message || 'Unhandled error',
      stack: event.error?.stack,
      component: 'window',
      severity: 'error',
    })
  })

  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || String(event.reason) || 'Unhandled promise rejection'
    reportError({
      message,
      stack: event.reason?.stack,
      component: 'promise',
      severity: 'error',
    })
  })
}
