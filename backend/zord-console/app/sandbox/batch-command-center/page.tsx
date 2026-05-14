'use client'

import BatchCommandCenterClient from '@/app/payout-command-view/batch-command-center/_components/BatchCommandCenterClient'
import { BatchTopNav } from '@/app/payout-command-view/batch-command-center/_components/BatchTopNav'
import { EnvironmentProvider } from '@/services/auth/EnvironmentProvider'
import { DASHBOARD_FONT_STACK } from '@/services/payout-command/model'

/**
 * `/sandbox/batch-command-center` — same Batch Command Center client as live, wrapped in
 * sandbox mode so links back to Home / Grid / Connectors / Billing stay on `/sandbox`.
 */
export default function SandboxBatchCommandCenterPage() {
  return (
    <EnvironmentProvider routeMode="sandbox">
      <div className="min-h-screen bg-[#f5f5f5]" style={{ fontFamily: DASHBOARD_FONT_STACK }}>
        <BatchTopNav shell="sandbox" />
        <BatchCommandCenterClient />
      </div>
    </EnvironmentProvider>
  )
}
