export type CustomerTestSearchType = 'route' | 'intent' | 'trace' | 'beneficiary'

export type CustomerTestSearchEntry = {
  id: string
  type: CustomerTestSearchType
  title: string
  subtitle: string
  href: string
  keywords: string[]
}

const routeEntries: CustomerTestSearchEntry[] = [
  { id: 'route_dashboard', type: 'route', title: 'Dashboard', subtitle: 'Ops overview', href: '/customer-test', keywords: ['dashboard', 'overview', 'ops'] },
  { id: 'route_exceptions', type: 'route', title: 'Exceptions & SLA', subtitle: 'Alerts and failures', href: '/customer-test/exceptions-sla', keywords: ['exceptions', 'sla', 'failure'] },
  { id: 'route_queue', type: 'route', title: 'Work Queue', subtitle: 'Actionable queue', href: '/customer-test/work-queue', keywords: ['queue', 'work', 'action'] },
  { id: 'route_intents', type: 'route', title: 'Intent Journal', subtitle: 'Search intents', href: '/customer-test/intent-journal', keywords: ['intent', 'journal'] },
  { id: 'route_create', type: 'route', title: 'Create Payment Request', subtitle: 'Create new payment intent', href: '/customer-test/create-payment-request', keywords: ['create', 'payment', 'request'] },
  { id: 'route_replay', type: 'route', title: 'Recovery', subtitle: 'Failed payment retry', href: '/customer-test/retry-replay', keywords: ['recovery', 'retry', 'failed payments'] },
  { id: 'route_timeline', type: 'route', title: 'Workflow Timeline', subtitle: 'Causality view', href: '/customer-test/workflow-timeline', keywords: ['workflow', 'timeline', 'stage'] },
  { id: 'route_csv', type: 'route', title: 'Bulk CSV Upload', subtitle: 'File ingestion', href: '/customer-test/bulk-csv-upload', keywords: ['csv', 'upload', 'bulk'] },
  { id: 'route_jobs', type: 'route', title: 'Ingestion Jobs', subtitle: 'Background processing jobs', href: '/customer-test/ingestion-jobs', keywords: ['ingestion', 'jobs'] },
  {
    id: 'route_evidence',
    type: 'route',
    title: 'Evidence Center',
    subtitle: 'Packs, explorer, exports',
    href: '/customer-test/evidence-center',
    keywords: ['evidence', 'audit', 'packs', 'explorer', 'export'],
  },
  {
    id: 'route_integrations_home',
    type: 'route',
    title: 'Integrations',
    subtitle: 'Tool separation architecture',
    href: '/customer-test/integrations',
    keywords: ['integrations', 'api', 'logs', 'webhook', 'adapter'],
  },
  {
    id: 'route_integrations_api_logs',
    type: 'route',
    title: 'Integrations / API Logs',
    subtitle: 'Debug requests and responses',
    href: '/customer-test/integrations/api-logs',
    keywords: ['integrations', 'api logs', 'trace', 'idempotency', 'debug'],
  },
  {
    id: 'route_integrations_webhooks',
    type: 'route',
    title: 'Integrations / Webhooks',
    subtitle: 'Monitor event delivery',
    href: '/customer-test/integrations/webhooks',
    keywords: ['integrations', 'webhooks', 'events', 'delivery', 'signature'],
  },
  {
    id: 'route_integrations_adapters',
    type: 'route',
    title: 'Integrations / Adapter Status',
    subtitle: 'Provider health monitoring',
    href: '/customer-test/integrations/adapters',
    keywords: ['integrations', 'adapter', 'provider health', 'latency', 'error rate'],
  },
  { id: 'route_costs', type: 'route', title: 'Costs', subtitle: 'Fees and settlement cost analytics', href: '/customer-test/reports/cost-intelligence', keywords: ['cost', 'fees', 'processing fees', 'gross volume', 'net settlement'] },
  { id: 'route_settlement', type: 'route', title: 'Settlement & Recon', subtitle: 'Batch and reconciliation view', href: '/customer-test/reports/settlement-recon', keywords: ['settlement', 'reconciliation', 'batch'] },
]

const intentEntries: CustomerTestSearchEntry[] = [
  { id: 'intent_1', type: 'intent', title: 'in_01JZ3A4D6Q2Y', subtitle: 'FUSED_SUCCESS • ₹12,450', href: '/customer-test/intent-journal?q=in_01JZ3A4D6Q2Y', keywords: ['in_01JZ3A4D6Q2Y', 'fused_success', '12450'] },
  { id: 'intent_2', type: 'intent', title: 'in_01JZ3ABH2P1M', subtitle: 'EXCEPTION • ₹8,900', href: '/customer-test/intent-journal?q=in_01JZ3ABH2P1M', keywords: ['in_01JZ3ABH2P1M', 'exception', '8900'] },
  { id: 'intent_3', type: 'intent', title: 'in_01JZ3AJK1N5R', subtitle: 'DLQ • ₹5,030', href: '/customer-test/intent-journal?q=in_01JZ3AJK1N5R', keywords: ['in_01JZ3AJK1N5R', 'dlq', '5030'] },
  { id: 'trace_1', type: 'trace', title: 'tr_0af88', subtitle: 'Trace for in_01JZ3A4D6Q2Y', href: '/customer-test/intent-journal?q=tr_0af88', keywords: ['tr_0af88', 'trace'] },
  { id: 'trace_2', type: 'trace', title: 'tr_0af96', subtitle: 'Trace for in_01JZ3ABH2P1M', href: '/customer-test/intent-journal?q=tr_0af96', keywords: ['tr_0af96', 'trace'] },
  { id: 'beneficiary_1', type: 'beneficiary', title: 'benef_tok_x9f4', subtitle: 'Beneficiary token for intent in_01JZ3A4D6Q2Y', href: '/customer-test/intent-journal?q=benef_tok_x9f4', keywords: ['benef_tok_x9f4', 'beneficiary', 'token'] },
  { id: 'beneficiary_2', type: 'beneficiary', title: 'benef_tok_a2k1', subtitle: 'Beneficiary token for intent in_01JZ3AJK1N5R', href: '/customer-test/intent-journal?q=benef_tok_a2k1', keywords: ['benef_tok_a2k1', 'beneficiary', 'token'] },
]

export function getCustomerTestSearchEntries(): CustomerTestSearchEntry[] {
  return [...routeEntries, ...intentEntries]
}

export function rankCustomerTestSearchEntries(
  query: string,
  entries: CustomerTestSearchEntry[],
  limit = 10
): CustomerTestSearchEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries.slice(0, limit)

  return entries
    .map((entry) => {
      const title = entry.title.toLowerCase()
      const subtitle = entry.subtitle.toLowerCase()
      const keywords = entry.keywords.join(' ').toLowerCase()
      let score = 0
      if (title === q) score += 100
      if (title.startsWith(q)) score += 60
      if (title.includes(q)) score += 40
      if (subtitle.includes(q)) score += 20
      if (keywords.includes(q)) score += 35
      return { entry, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.entry)
}
