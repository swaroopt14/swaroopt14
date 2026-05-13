import type { Metadata } from 'next'
import { resolveInitialDock } from './_lib/resolveInitialDock'
import PayoutCommandViewClient from './_components/PayoutCommandViewClient'

export const metadata: Metadata = {
  title: 'Payout Command View | Zord',
  description: 'Route posture, owner handoff, and proof readiness in one operating workspace.',
}

// Live-mode entry. Sandbox lives at /sandbox.
export default function PayoutCommandViewTodayPage({
  searchParams,
}: {
  searchParams: { dock?: string | string[] }
}) {
  return (
    <PayoutCommandViewClient forceMode="live" initialDock={resolveInitialDock(searchParams.dock)} />
  )
}
