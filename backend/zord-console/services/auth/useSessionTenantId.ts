'use client'

import { useEffect, useState } from 'react'

/** Same default as Intent Journal when no env / session / localStorage tenant. */
const DEMO_FALLBACK_TENANT = 'tenant_arealis_nbfc'

function readEnvTenant(): string {
  if (typeof process === 'undefined') return ''
  return process.env.NEXT_PUBLIC_ZORD_TENANT_ID?.trim() || ''
}

/**
 * Tenant id for `/api/prod/*` reads (home trend, intelligence KPIs, etc.).
 * Resolution matches Intent Journal: `NEXT_PUBLIC_ZORD_TENANT_ID` →
 * `/api/auth/me` → `localStorage.zord_tenant_id` → demo fallback so sandbox
 * and local demos still hit the backend when the session has not set a tenant yet.
 */
export function useSessionTenantId(): string {
  const envTenant = readEnvTenant()
  const [tenantId, setTenantId] = useState(() => envTenant || DEMO_FALLBACK_TENANT)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let resolved: string | null = envTenant || null
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (!cancelled && res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { session?: { tenant_id?: string }; user?: { tenant_id?: string } }
            | null
          const tid = data?.session?.tenant_id?.trim() || data?.user?.tenant_id?.trim()
          if (tid) resolved = tid
        }
      } catch {
        /* ignore */
      }
      if (!cancelled && !resolved) {
        try {
          const ls = typeof window !== 'undefined' ? window.localStorage.getItem('zord_tenant_id') : null
          if (ls?.trim()) resolved = ls.trim()
        } catch {
          /* ignore */
        }
      }
      if (!cancelled && resolved) setTenantId(resolved)
    })()
    return () => {
      cancelled = true
    }
  }, [envTenant])

  return tenantId
}
