'use client'

import { useEffect, useState } from 'react'

function readEnvTenant(): string {
  if (typeof process === 'undefined') return ''
  return process.env.NEXT_PUBLIC_ZORD_TENANT_ID?.trim() || ''
}

/**
 * Tenant id for `/api/prod/*` reads — no mock fallback.
 * Resolution: `NEXT_PUBLIC_ZORD_TENANT_ID` → `/api/auth/me` session → `localStorage.zord_tenant_id`.
 * Returns empty string until a real tenant is resolved (sign in or set env).
 */
export function useSessionTenantId(): string {
  const { tenantId } = useSessionTenant()
  return tenantId
}

/** Session tenant + settled flag after `/api/auth/me` (no mock fallback). */
export function useSessionTenant(): { tenantId: string; tenantReady: boolean } {
  const envTenant = readEnvTenant()
  const [tenantId, setTenantId] = useState(() => envTenant)
  const [tenantReady, setTenantReady] = useState(false)

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
          const tid =
            data?.session?.tenant_id?.trim() ||
            data?.user?.tenant_id?.trim() ||
            (data?.user as { tenantId?: string } | undefined)?.tenantId?.trim()
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
      if (!cancelled) {
        setTenantId(resolved ?? '')
        setTenantReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [envTenant])

  return { tenantId, tenantReady }
}
