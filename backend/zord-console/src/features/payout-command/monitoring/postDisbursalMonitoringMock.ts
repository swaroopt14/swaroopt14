export type MonitoringQueueStatus = 'Confirmed' | 'Pending' | 'At risk'

export type LoanMonitoringRow = {
  loanId: string
  borrowerName: string
  amountInr: number
  confirmed: 'Yes' | 'Pending'
  repayment: 'On-time' | 'Late' | 'N/A'
  riskSignal: 'None' | 'Dormant' | 'Linked + Circular' | 'Device risk' | 'Instant withdrawal'
  evidence: 'Complete' | 'Partial'
  status: MonitoringQueueStatus
}

type BreakdownMetric = {
  label: string
  value: string
  tone?: 'good' | 'warn' | 'bad' | 'neutral'
}

type BreakdownCard = {
  title: string
  metrics: BreakdownMetric[]
}

type MoneyFlowRow = {
  label: string
  amount: string
  pct: string
  tone: 'blue' | 'green' | 'amber' | 'red' | 'olive'
}

type RiskRow = {
  label: string
  value: number
  tone: 'red' | 'amber'
}

type TrendRow = {
  label: string
  pct: number
  tone: 'green' | 'amber' | 'red'
}

const queueRows: LoanMonitoringRow[] = [
  {
    loanId: 'L-1001',
    borrowerName: 'Ananya S.',
    amountInr: 250000,
    confirmed: 'Yes',
    repayment: 'On-time',
    riskSignal: 'None',
    evidence: 'Complete',
    status: 'Confirmed',
  },
  {
    loanId: 'L-1023',
    borrowerName: 'Ravi K.',
    amountInr: 200000,
    confirmed: 'Yes',
    repayment: 'Late',
    riskSignal: 'Dormant',
    evidence: 'Partial',
    status: 'At risk',
  },
  {
    loanId: 'L-1091',
    borrowerName: 'Meena P.',
    amountInr: 500000,
    confirmed: 'Pending',
    repayment: 'N/A',
    riskSignal: 'None',
    evidence: 'Partial',
    status: 'Pending',
  },
  {
    loanId: 'L-1102',
    borrowerName: 'Suresh M.',
    amountInr: 400000,
    confirmed: 'Yes',
    repayment: 'Late',
    riskSignal: 'Linked + Circular',
    evidence: 'Partial',
    status: 'At risk',
  },
  {
    loanId: 'L-1138',
    borrowerName: 'Pooja D.',
    amountInr: 180000,
    confirmed: 'Yes',
    repayment: 'On-time',
    riskSignal: 'Device risk',
    evidence: 'Complete',
    status: 'Confirmed',
  },
  {
    loanId: 'L-1004',
    borrowerName: 'Nita R.',
    amountInr: 120000,
    confirmed: 'Yes',
    repayment: 'On-time',
    riskSignal: 'None',
    evidence: 'Complete',
    status: 'Confirmed',
  },
  {
    loanId: 'L-1009',
    borrowerName: 'Amit B.',
    amountInr: 600000,
    confirmed: 'Yes',
    repayment: 'Late',
    riskSignal: 'Instant withdrawal',
    evidence: 'Complete',
    status: 'At risk',
  },
]

const queueCounts = {
  All: 780,
  Confirmed: 693,
  Pending: 40,
  'At risk': 47,
} as const

const summaryCards = [
  { label: 'Total disbursed', value: '₹42Cr', sub: '780 loans sent', tone: 'neutral' as const },
  { label: 'Confirmed received', value: '₹38Cr', sub: '92% confirmed', tone: 'good' as const },
  { label: 'At risk', value: '₹3.8Cr', sub: '67 accounts', tone: 'bad' as const },
  { label: 'Recovered', value: '₹1.2Cr', sub: 'from at-risk pool', tone: 'good' as const },
  { label: 'Repayment rate', value: '68%', sub: 'on-time this week', tone: 'warn' as const },
] as const

const checkBreakdownCards: BreakdownCard[] = [
  {
    title: 'Loan disbursal status',
    metrics: [
      { label: 'Total sent', value: '₹42Cr' },
      { label: 'Confirmed', value: '₹38Cr', tone: 'good' },
      { label: 'Pending confirm', value: '₹3.2Cr', tone: 'warn' },
      { label: 'Confirmation rate', value: '92%' },
    ],
  },
  {
    title: 'Repayment health',
    metrics: [
      { label: 'Due this cycle', value: '₹5.4Cr' },
      { label: 'Received', value: '₹3.1Cr', tone: 'good' },
      { label: 'On-time rate', value: '68%', tone: 'warn' },
      { label: 'Bounce rate', value: '14%', tone: 'bad' },
    ],
  },
  {
    title: 'Suspicious activity',
    metrics: [
      { label: 'Dormant accounts', value: '22', tone: 'warn' },
      { label: 'Instant withdrawals', value: '18', tone: 'bad' },
      { label: 'Linked accounts', value: '11', tone: 'bad' },
      { label: 'Circular transfers', value: '7', tone: 'bad' },
    ],
  },
  {
    title: 'Evidence readiness',
    metrics: [
      { label: 'Complete', value: '720', tone: 'good' },
      { label: 'Partial', value: '85', tone: 'warn' },
      { label: 'Missing', value: '12', tone: 'bad' },
      { label: 'Dispute ready', value: '89%' },
    ],
  },
]

const moneyFlow: MoneyFlowRow[] = [
  { label: 'Sent', amount: '₹42Cr', pct: '100%', tone: 'blue' },
  { label: 'Confirmed', amount: '₹38Cr', pct: '90.5%', tone: 'green' },
  { label: 'Pending confirm', amount: '₹3.2Cr', pct: '7.6%', tone: 'amber' },
  { label: 'At risk', amount: '₹3.8Cr', pct: '9%', tone: 'red' },
  { label: 'Recovered', amount: '₹1.2Cr', pct: '2.9%', tone: 'olive' },
]

const suspiciousBehavior: RiskRow[] = [
  { label: 'Instant withdrawal', value: 18, tone: 'red' },
  { label: 'Dormant account', value: 22, tone: 'amber' },
  { label: 'Linked accounts', value: 11, tone: 'amber' },
  { label: 'Circular transfers', value: 7, tone: 'red' },
]

const repaymentTrend: TrendRow[] = [
  { label: 'Week 1', pct: 82, tone: 'green' },
  { label: 'Week 2', pct: 74, tone: 'amber' },
  { label: 'Week 3', pct: 68, tone: 'amber' },
  { label: 'Week 4', pct: 66, tone: 'red' },
]

const accountConnectionMap = [
  'Borrower A — L-1102',
  'Account X — SBI 001234',
  'Account Y — ICICI 009871',
  'Account Z — Axis 007891',
] as const

export const POST_DISBURSAL_MONITORING_MOCK = {
  header: {
    title: 'Post-Disbursal Monitoring',
    statusPill: 'Live',
  },
  summaryCards,
  checkBreakdownCards,
  moneyFlow,
  suspiciousBehavior,
  repaymentTrend,
  accountConnectionMap,
  queueCounts,
  queueRows,
}

