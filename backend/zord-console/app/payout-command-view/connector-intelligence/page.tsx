import type { Metadata } from 'next'
import ConnectorIntelligenceClient from './ConnectorIntelligenceClient'

export const metadata: Metadata = {
  title: 'Routing & Network Intelligence | Zord',
  description:
    'Routing and network health intelligence for connector performance, leakage prevention, and route-level decisioning.',
}

export default function ConnectorIntelligencePage() {
  return <ConnectorIntelligenceClient />
}
