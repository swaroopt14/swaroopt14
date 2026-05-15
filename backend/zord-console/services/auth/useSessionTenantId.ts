'use client'

import { useEffect, useState } from 'react'

/**
 * Tenant id for `/api/prod/*` reads — from `/api/auth/me` only (session).
 * Returns empty string until loaded or when unauthenticated.
 */
export function useSessionTenantId(): string {
  const envTenant = readEnvTenant()
  const [tenantId, setTenantId] = useState(() => envTenant || DEMO_FALLBACK_TENANT)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (!cancelled && res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { session?: { tenant_id?: string }; user?: { tenant_id?: string } }
            | null
          const tid = data?.session?.tenant_id?.trim() || data?.user?.tenant_id?.trim()
          if (tid) setTenantId(tid)
          else setTenantId('')
        } else if (!cancelled) {
          setTenantId('')
        }
      } catch {
        if (!cancelled) setTenantId('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [envTenant])

  return tenantId
}
