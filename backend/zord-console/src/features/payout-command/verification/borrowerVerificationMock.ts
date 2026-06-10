export type BorrowerQueueStatus = 'Safe' | 'Review' | 'Blocked' | 'Rejected'
export type SignalLevel = 'pass' | 'warn' | 'fail'

export type BorrowerQueueRow = {
  borrowerId: string
  borrowerName: string
  loanAmountInr: number
  kyc: SignalLevel
  bank: SignalLevel
  fraud: SignalLevel
  aml: SignalLevel
  status: BorrowerQueueStatus
  source: 'Sumsub' | 'Manual'
}

type BorrowerQueueBucket = {
  status: BorrowerQueueStatus
  count: number
  rows: BorrowerQueueRow[]
}

type FunnelStep = {
  label: string
  count: number
}

type RiskSignal = {
  label: string
  value: number
}

const TOTAL_BORROWERS = 910

const borrowerVerification = {
  verified: 842,
  highRisk: 21,
  rejected: 9,
}

const bankAccount = {
  verified: 780,
  nameMismatch: 18,
  verifyFailed: 9,
  pennyDropOk: 771,
}

const fraudRisk = {
  amlAlerts: 6,
  deviceRisk: 14,
  duplicates: 11,
  deepfakeSignal: 3,
}

const proofReadiness = {
  ready: 780,
  awaitingConfirm: 40,
  missingProof: 12,
}

const queueBuckets: BorrowerQueueBucket[] = [
  {
    status: 'Safe',
    count: 780,
    rows: [
      {
        borrowerId: 'R-1001',
        borrowerName: 'Ananya S.',
        loanAmountInr: 250000,
        kyc: 'pass',
        bank: 'pass',
        fraud: 'pass',
        aml: 'pass',
        status: 'Safe',
        source: 'Sumsub',
      },
      {
        borrowerId: 'R-1004',
        borrowerName: 'Nita R.',
        loanAmountInr: 120000,
        kyc: 'pass',
        bank: 'pass',
        fraud: 'pass',
        aml: 'pass',
        status: 'Safe',
        source: 'Sumsub',
      },
      {
        borrowerId: 'R-1009',
        borrowerName: 'Amit B.',
        loanAmountInr: 600000,
        kyc: 'pass',
        bank: 'pass',
        fraud: 'pass',
        aml: 'pass',
        status: 'Safe',
        source: 'Sumsub',
      },
    ],
  },
  {
    status: 'Review',
    count: 97,
    rows: [
      {
        borrowerId: 'R-1023',
        borrowerName: 'Ravi K.',
        loanAmountInr: 200000,
        kyc: 'pass',
        bank: 'warn',
        fraud: 'pass',
        aml: 'pass',
        status: 'Review',
        source: 'Sumsub',
      },
      {
        borrowerId: 'R-1138',
        borrowerName: 'Pooja D.',
        loanAmountInr: 180000,
        kyc: 'pass',
        bank: 'pass',
        fraud: 'warn',
        aml: 'pass',
        status: 'Review',
        source: 'Sumsub',
      },
    ],
  },
  {
    status: 'Blocked',
    count: 21,
    rows: [
      {
        borrowerId: 'R-1091',
        borrowerName: 'Meena P.',
        loanAmountInr: 500000,
        kyc: 'pass',
        bank: 'pass',
        fraud: 'pass',
        aml: 'fail',
        status: 'Blocked',
        source: 'Sumsub',
      },
      {
        borrowerId: 'R-1152',
        borrowerName: 'Kiran T.',
        loanAmountInr: 320000,
        kyc: 'fail',
        bank: 'fail',
        fraud: 'fail',
        aml: 'pass',
        status: 'Blocked',
        source: 'Sumsub',
      },
    ],
  },
  {
    status: 'Rejected',
    count: 12,
    rows: [
      {
        borrowerId: 'R-1124',
        borrowerName: 'Suresh M.',
        loanAmountInr: 400000,
        kyc: 'fail',
        bank: 'pass',
        fraud: 'fail',
        aml: 'pass',
        status: 'Rejected',
        source: 'Manual',
      },
    ],
  },
]

const riskSignals: RiskSignal[] = [
  { label: 'Device risk', value: fraudRisk.deviceRisk },
  { label: 'Duplicate identity', value: fraudRisk.duplicates },
  { label: 'Name mismatch', value: bankAccount.nameMismatch },
  { label: 'AML alert', value: fraudRisk.amlAlerts },
  { label: 'Deepfake signal', value: fraudRisk.deepfakeSignal },
]

const funnel: FunnelStep[] = [
  { label: 'Borrowers', count: TOTAL_BORROWERS },
  { label: 'Identity check', count: 880 },
  { label: 'Face verify', count: 858 },
  { label: 'Bank verify', count: 830 },
  { label: 'Fraud screen', count: 805 },
  { label: 'Safe to disburse', count: 780 },
]

const checkBreakdown = {
  borrowerVerification,
  bankAccount,
  fraudRisk,
  proofReadiness,
}

function percent(value: number, total: number): number {
  if (total <= 0) return 0
  return Number(((value / total) * 100).toFixed(1))
}

const queueCounts = queueBuckets.reduce<Record<'All' | BorrowerQueueStatus, number>>(
  (acc, bucket) => {
    acc[bucket.status] = bucket.count
    acc.All += bucket.count
    return acc
  },
  {
    All: 0,
    Safe: 0,
    Review: 0,
    Blocked: 0,
    Rejected: 0,
  },
)

const queueRows = queueBuckets.flatMap((bucket) => bucket.rows)

const passRate = percent(borrowerVerification.verified, TOTAL_BORROWERS)
const proofCoveragePct = 94

const summary = {
  safeToDisburse: queueCounts.Safe,
  blockedOrReview: queueCounts.All - queueCounts.Safe,
  exposurePreventedLabel: '₹3.2Cr',
  kycPassRate: passRate,
  proofCoveragePct,
}

export const BORROWER_VERIFICATION_MOCK = {
  header: {
    title: 'Borrower Verification Control Center',
    statusPill: 'Live',
    providerPill: 'KYC provider: Sumsub',
    syncLine: 'KYC sync healthy',
    lastPullMinutes: 2,
    manualReviewFallbackBorrowers: 11,
  },
  summary,
  totals: {
    totalBorrowers: queueCounts.All,
  },
  checkBreakdown,
  riskSignals,
  funnel,
  queueCounts,
  queueRows,
}
