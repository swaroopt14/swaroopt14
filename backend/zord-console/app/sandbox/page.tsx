import type { Metadata } from 'next'
import { resolveInitialDock } from '@/app/payout-command-view/today/_lib/resolveInitialDock'
import PayoutCommandViewClient from '@/app/payout-command-view/today/_components/PayoutCommandViewClient'

export const metadata: Metadata = {
  title: 'Sandbox · Zord',
  description: 'Test the full Intent Journal flow without touching real funds.',
}

/**
 * /sandbox — sandbox mode. Same Home command center layout as live (`/payout-command-view/today`),
 * plus the sandbox banner and mode toggle. API keys and batch flows use the header and other docks.
 */
export default function SandboxPage({
  searchParams,
}: {
  searchParams: { dock?: string | string[] }
}) {
  return (
    <PayoutCommandViewClient
      forceMode="sandbox"
      initialDock={resolveInitialDock(searchParams.dock)}
    />
  )
}
