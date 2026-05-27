import type { CommandCenterPayload, Edge, Node, OutcomeInsightCard } from './types'

import { fmtInrFull } from './commandCenterFormat'

export function formatINRCompact(value: number) {
  return fmtInrFull(value, { decimals: 0 })
}

function isoNow() {
  return new Date().toISOString()
}

export const MOCK_COMMAND_CENTER_ANCHOR_ISO = '2026-05-05T05:30:00.000Z'

const ZORD = 'zord'

/** Final six-card outcome set — Morning view + Home Command center (metrics mode). */
export const OUTCOME_INSIGHT_CARDS_DEFAULT: OutcomeInsightCard[] = [
  {
    id: 'out-1',
    variant: 'success',
    title: 'Value Successfully Confirmed',
    value: '$1.19B',
    valueDelta: '+8%',
    subtext: 'Processed and confirmed after using Zord',
    aiInsight: 'More transactions are completing successfully with fewer delays compared to the previous period',
  },
  {
    id: 'out-2',
    variant: 'recovery',
    title: 'Value Recovered by Zord',
    value: '$8.3M',
    subtext: 'Previously delayed or stuck transactions now completed',
    aiInsight: 'Zord helped resolve and confirm these transactions, improving overall completion',
  },
  {
    id: 'out-3',
    variant: 'progress',
    title: 'Value Awaiting Confirmation',
    value: '$326.0M',
    subtext: 'Awaiting confirmation from banks',
    aiInsight: 'This value is pending with banks and is expected to be confirmed shortly',
  },
  {
    id: 'out-4',
    variant: 'risk',
    title: 'Value Requiring Attention',
    value: '$134.4M',
    subtext: 'Transactions with delays or issues',
    aiInsight: 'This value may be at risk if not resolved — follow-up required',
  },
  {
    id: 'out-5',
    variant: 'mandate',
    title: 'Mandate Readiness',
    value: '87% Active',
    subtext: 'Accounts ready for recurring payments',
    aiInsight: 'Improving mandate approvals will reduce future collection issues',
  },
  {
    id: 'out-6',
    variant: 'leakage',
    title: 'Value at Risk',
    value: '$42.6M',
    subtext: 'Potential delays or unresolved transactions',
    aiInsight: 'Zord is actively reducing this risk by identifying and resolving issues early',
  },
]

function baseNodes(nowIso: string): Node[] {
  const t = nowIso
  return [
    {
      id: 'loan',
      label: 'Loan System',
      status: 'HEALTHY',
      volume: 2_400_000,
      signalHealthScore: 92,
      ambiguityRate: 1.2,
      lastUpdated: t,
    },
    {
      id: 'banks',
      label: 'Bank',
      status: 'DELAYED',
      volume: 890_000,
      signalHealthScore: 71,
      ambiguityRate: 4.8,
      lastUpdated: t,
    },
    {
      id: 'payment',
      label: 'Payment Partner',
      status: 'DELAYED',
      volume: 1_100_000,
      signalHealthScore: 68,
      ambiguityRate: 3.9,
      lastUpdated: t,
    },
    {
      id: 'mandate',
      label: 'Mandate System',
      status: 'HEALTHY',
      volume: 620_000,
      signalHealthScore: 88,
      ambiguityRate: 2.1,
      lastUpdated: t,
    },
    {
      id: 'other',
      label: 'Other Platforms',
      status: 'HEALTHY',
      volume: 310_000,
      signalHealthScore: 95,
      ambiguityRate: 0.8,
      lastUpdated: t,
    },
  ]
}

function baseEdges(nodes: Node[]): Edge[] {
  return nodes.map((n) => ({
    from: n.id,
    to: ZORD,
    status: n.status === 'HEALTHY' ? ('NORMAL' as const) : ('DELAYED' as const),
  }))
}

export function getMockCommandCenterPayload(seed: number, nowIso: string = isoNow()): CommandCenterPayload {
  const nodes = baseNodes(nowIso)
  const redWave = seed % 4 === 0
  const amberWave = seed % 4 === 2

  if (redWave) {
    nodes[1] = { ...nodes[1]!, status: 'ATTENTION', signalHealthScore: 52, ambiguityRate: 8.2 }
    nodes[2] = { ...nodes[2]!, status: 'ATTENTION', ambiguityRate: 7.1 }
  } else if (amberWave) {
    nodes[1] = { ...nodes[1]!, status: 'DELAYED' }
  }

  const edges = baseEdges(nodes)

  const alert = redWave
    ? {
        status: 'RED' as const,
        message:
          'Action required — ₹18.2L disbursements not confirmed beyond expected time · bank-confirmation SLA breach on one corridor',
        timestamp: nowIso,
        affectedValue: 1_820_000,
      }
    : amberWave
      ? {
          status: 'AMBER' as const,
          message: 'Bank confirmation delays increasing — ₹12.4L pending (↑ 2.1× vs yesterday) · watch NEFT/IMPS ACK cadence',
          timestamp: nowIso,
          affectedValue: 1_240_000,
        }
      : {
          status: 'GREEN' as const,
          message:
            'All disbursements processing normally — ₹12.3Cr processed, ₹0.4Cr pending confirmation · counts are bank-confirmed only',
          timestamp: nowIso,
        }

  /** Six outcome cards — shared with Home (Command center) surface. */
  const outcomeInsightCards = OUTCOME_INSIGHT_CARDS_DEFAULT

  const partnerDelayed = redWave || amberWave
  const connectorHealth = {
    sectionInsight: partnerDelayed
      ? 'One payment partner is showing slightly higher delays compared to others.'
      : 'Payment partners are within expected confirmation spread for this window.',
    items: [
      {
        name: 'Razorpay',
        status: partnerDelayed ? ('delayed' as const) : ('healthy' as const),
        metric: partnerDelayed ? '89% confirmed · 8% pending' : '96% confirmed · 3% pending',
      },
      {
        name: 'Bank Transfer',
        status: amberWave || redWave ? ('attention' as const) : ('healthy' as const),
        metric: redWave ? '82% confirmed · 14% pending' : amberWave ? '88% confirmed · 9% pending' : '94% confirmed · 5% pending',
      },
      {
        name: 'NACH',
        status: 'healthy' as const,
        metric: '97% confirmed · 2% pending',
      },
      {
        name: 'LSM',
        status: 'healthy' as const,
        metric: '95% confirmed · 4% pending',
      },
    ],
  }

  const improvementMetrics = [
    {
      id: 'im-1',
      direction: 'down' as const,
      value: '42%',
      label: 'Reduction in pending confirmations',
      comparison: 'vs last period',
    },
    {
      id: 'im-2',
      direction: 'down' as const,
      value: '63%',
      label: 'Reduction in manual verification effort',
      comparison: 'vs baseline',
    },
    {
      id: 'im-3',
      direction: 'up' as const,
      value: '98.2%',
      label: 'Increase in verified disbursements',
      comparison: 'vs last period',
    },
    {
      id: 'im-4',
      direction: 'inr' as const,
      value: '₹8.3L',
      label: 'Value unlocked from faster confirmations',
      comparison: 'vs baseline',
    },
  ]

  const insightChips = [
    { text: 'More transactions are completing successfully', variant: 'success' as const },
    { text: 'Some confirmations are still pending from banks', variant: 'caution' as const },
    { text: 'A portion of transactions needs attention', variant: 'critical' as const },
    { text: 'Improving mandate approvals will reduce future issues', variant: 'mandate' as const },
  ]

  return {
    fetchedAt: nowIso,
    dataNotice: seed % 7 === 3 ? 'delayed' : seed % 7 === 5 ? 'mismatch' : undefined,
    alert,
    insightAlerts: [
      {
        id: 'ins-1',
        title: 'Disbursement pulse',
        body: 'Volume is ahead of prior week; confirmation mix is healthy on the LMS path.',
        createdAt: nowIso,
        tone: 'ok',
      },
      ...(redWave
        ? [
            {
              id: 'ins-2',
              title: 'Confirmation risk',
              body: 'One bank lane is slow to ACK; consider alternate partner routing for top buckets.',
              createdAt: nowIso,
              tone: 'critical' as const,
            },
          ]
        : []),
    ],
    nodes,
    edges,
    outcomeInsightCards,
    connectorHealth,
    improvementMetrics,
    insightChips,
    anomalies: redWave
      ? [
          {
            id: 'an-1',
            headline: 'Increase in confirmation delays observed for one bank.',
            impactLine: '₹12.4L currently pending',
            suggestedAction: 'Follow up on delayed confirmations or route through alternate partner',
          },
        ]
      : [],
  }
}
