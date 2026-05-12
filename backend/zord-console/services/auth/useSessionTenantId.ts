'use client'

import { useEffect, useState } from 'react'

/**
 * Returns the tenant_id from the signed-in session, hitting /api/auth/me once.
 * Surfaces use this to gate the intelligence-KPI hook; returns '' while loading
 * or when there's no session, which means the hook short-circuits without firing.
 */
export function useSessionTenantId(): string {
  const [tenantId, setTenantId] = useState('')

  useEffect(() => {
    let cancelled = false
    void fetch('/api/auth/me', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return
        const data = (await res.json().catch(() => null)) as
          | { session?: { tenant_id?: string }; user?: { tenant_id?: string } }
          | null
        const tid = data?.session?.tenant_id?.trim() || data?.user?.tenant_id?.trim()
        if (!cancelled && tid) setTenantId(tid)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return tenantId
}
