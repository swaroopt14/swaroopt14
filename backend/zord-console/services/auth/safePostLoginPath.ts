const ALLOWED_PREFIXES = ['/payout-command-view', '/console', '/app-final', '/customer', '/sandbox'] as const

/**
 * Same-origin path-only redirect after login. Rejects open redirects and `..`.
 */
export function sanitizePostLoginNext(raw: string | undefined | null, fallback: string): string {
  if (!raw || typeof raw !== 'string') return fallback
  let decoded = raw.trim()
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    return fallback
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return fallback
  if (decoded.includes('://') || decoded.includes('\\') || decoded.includes('..')) return fallback

  const ok = ALLOWED_PREFIXES.some(
    (p) => decoded === p || decoded.startsWith(`${p}/`) || decoded.startsWith(`${p}?`),
  )
  return ok ? decoded : fallback
}
