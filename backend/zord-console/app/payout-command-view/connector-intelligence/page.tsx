import type { Metadata } from 'next'
import ConnectorIntelligenceClient from './ConnectorIntelligenceClient'

export const metadata: Metadata = {
  title: 'Connector Intelligence | Zord',
  description:
    'Which connectors are performing, which are failing, and what ambiguity costs in defensibility exposure — for ops, CTO, and PSP negotiation.',
}

export default function ConnectorIntelligencePage() {
  return <ConnectorIntelligenceClient />
}

