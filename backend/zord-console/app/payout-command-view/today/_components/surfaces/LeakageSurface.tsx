'use client'

import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { PortfolioLeakageDashboard } from '../leakage-portfolio/PortfolioLeakageDashboard'

/**
 * Leakage dock — portfolio intelligence dashboard (white theme).
 * Data: GET /api/prod/intelligence/leakage → zord-intelligence dashboard leakage KPIs.
 */
export function LeakageSurface() {
  const { tenantReady } = useSessionTenant()
  return <PortfolioLeakageDashboard tenantReady={tenantReady} />
}
