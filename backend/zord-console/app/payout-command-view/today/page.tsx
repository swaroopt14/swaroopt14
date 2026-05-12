import type { Metadata } from 'next'
import PayoutCommandViewClient from './_components/PayoutCommandViewClient'

export const metadata: Metadata = {
  title: 'Payout Command View | Zord',
  description: 'Route posture, owner handoff, and proof readiness in one operating workspace.',
}

// Live-mode entry. Sandbox lives at /sandbox.
export default function PayoutCommandViewTodayPage() {
  return <PayoutCommandViewClient forceMode="live" />
}
