import type { Metadata } from 'next'
import PayoutCommandViewClient from './_components/PayoutCommandViewClient'

export const metadata: Metadata = {
  title: 'Payout Command View | Zord',
  description: 'Route posture, owner handoff, and proof readiness in one operating workspace.',
}

export default function PayoutCommandViewTodayPage() {
  return <PayoutCommandViewClient />
}
