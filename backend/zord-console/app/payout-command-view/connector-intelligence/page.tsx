import type { Metadata } from 'next'
import { ConnectorIntelligencePageClient } from './_components/ConnectorIntelligencePageClient'

export const metadata: Metadata = {
  title: 'Connector Performance & Leakage | Zord',
  description:
    'Connector performance, leakage exposure, and recommended actions across connected PSPs, banks, and rails.',
}

export default function ConnectorIntelligencePage() {
  return <ConnectorIntelligencePageClient />
}
