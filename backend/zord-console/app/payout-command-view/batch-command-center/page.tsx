import type { Metadata } from 'next'
import { BatchCommandCenterShell } from './_components/BatchCommandCenterShell'

export const metadata: Metadata = {
  title: 'Batch Command Center | Zord',
  description: 'Upload payout sheets, track batch processing, and operate retries with timeline, analytics, and drill-down evidence.',
}

export default function BatchCommandCenterPage() {
  return <BatchCommandCenterShell forceMode="live" />
}
