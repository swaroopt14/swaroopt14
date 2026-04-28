export type BatchStepState = 'done' | 'active' | 'warning' | 'upcoming'
export type BatchRowStatus = 'Success' | 'Failed' | 'Pending' | 'Processing'

export type BatchTimelineStep = {
  label: string
  state: BatchStepState
}

export type BatchRowTimelineStep = {
  label: string
  time: string
  state: 'done' | 'active' | 'pending'
}

export type BatchRow = {
  refId: string
  amount: number
  beneficiary: string
  status: BatchRowStatus
  stage: string
  reason: string
  time: string
  actionLabel: string
  provider: 'RazorpayX' | 'Cashfree' | 'PayU' | 'Stripe'
  dispatchId: string
  bankReference: string
  timeline: BatchRowTimelineStep[]
}

export type BatchSummary = {
  totalRows: number
  processed: number
  success: number
  failed: number
  pending: number
}

export const FAILURE_REASON_ORDER = [
  'Insufficient Balance',
  'Invalid Account',
  'Bank Timeout',
  'Duplicate',
  'Unknown',
] as const

const BENEFICIARY_MASKS = [
  'XXXXX1234',
  'XXXXX5678',
  'XXXXX9923',
  'XXXXX7711',
  'XXXXX4408',
  'XXXXX2910',
  'XXXXX8214',
] as const

const STAGES_BY_STATUS: Record<BatchRowStatus, string> = {
  Success: 'Confirmed',
  Failed: 'Dispatched',
  Pending: 'Awaiting Bank',
  Processing: 'Rows Processing',
}

const PROVIDERS: BatchRow['provider'][] = ['RazorpayX', 'Cashfree', 'PayU', 'Stripe']
const FRIENDLY_REASONS = [...FAILURE_REASON_ORDER]

function seedFor(index: number) {
  return Math.abs(Math.sin(index * 12.9898) * 43758.5453)
}

function seededPick<T>(items: readonly T[], index: number): T {
  return items[Math.floor(seedFor(index) % items.length)]
}

function resolveStatus(index: number): BatchRowStatus {
  const value = seedFor(index) % 100
  if (value < 63) return 'Success'
  if (value < 72) return 'Processing'
  if (value < 86) return 'Pending'
  return 'Failed'
}

function buildTimeline(status: BatchRowStatus, rowTime: string): BatchRowTimelineStep[] {
  const base = [
    { label: 'Ingested', time: '10:01:02', state: 'done' as const },
    { label: 'Canonicalized', time: '10:01:05', state: 'done' as const },
    { label: 'Validated', time: '10:01:07', state: 'done' as const },
    { label: 'Dispatched', time: '10:01:10', state: 'done' as const },
  ]

  if (status === 'Success') {
    return [...base, { label: 'Awaiting Bank', time: '10:02:04', state: 'done' }, { label: 'Confirmed (UTR)', time: rowTime, state: 'done' }]
  }

  if (status === 'Failed') {
    return [...base, { label: 'Awaiting Bank', time: '-', state: 'active' }, { label: 'Confirmed (UTR)', time: '-', state: 'pending' }]
  }

  if (status === 'Pending') {
    return [...base, { label: 'Awaiting Bank', time: '-', state: 'active' }, { label: 'Confirmed (UTR)', time: '-', state: 'pending' }]
  }

  return [...base, { label: 'Awaiting Bank', time: '-', state: 'active' }, { label: 'Confirmed (UTR)', time: '-', state: 'pending' }]
}

export function formatInr(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

export function formatClock(offsetSeconds: number) {
  const baseSeconds = 10 * 3600 + 2 * 60 + 30
  const total = baseSeconds + offsetSeconds
  const hh = String(Math.floor(total / 3600) % 24).padStart(2, '0')
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function actionFor(status: BatchRowStatus) {
  if (status === 'Success') return 'Export evidence'
  if (status === 'Failed') return 'Retry row'
  if (status === 'Pending') return 'Inspect queue'
  return 'Track progress'
}

function reasonFor(status: BatchRowStatus, index: number) {
  if (status !== 'Failed') return '-'
  return seededPick(FRIENDLY_REASONS, index)
}

export function createRow(index: number): BatchRow {
  const status = resolveStatus(index)
  const secondsOffset = Math.floor(seedFor(index + 3) % 900)
  const time = status === 'Pending' ? '-' : formatClock(secondsOffset)
  const refId = `P${String(123 + index).padStart(5, '0')}`
  const amount = 500 + Math.floor(seedFor(index + 9) % 80_000)
  const beneficiary = seededPick(BENEFICIARY_MASKS, index)
  const provider = seededPick(PROVIDERS, index)
  const reason = reasonFor(status, index)
  const stage = STAGES_BY_STATUS[status]
  return {
    refId,
    amount,
    beneficiary,
    status,
    stage,
    reason,
    time,
    actionLabel: actionFor(status),
    provider,
    dispatchId: `disp_${Math.floor(seedFor(index + 33) % 99_999)}`,
    bankReference: `UTR${Math.floor(seedFor(index + 41) % 99999999999)
      .toString()
      .padStart(11, '0')}`,
    timeline: buildTimeline(status, time),
  }
}

export function buildDefaultBatchRows(count = 180): BatchRow[] {
  return Array.from({ length: count }, (_, index) => createRow(index))
}

export function buildSeedSummary(): BatchSummary {
  return {
    totalRows: 10_000,
    processed: 7_000,
    success: 6_500,
    failed: 300,
    pending: 200,
  }
}

export function deriveTimeline(summary: BatchSummary, fileUploaded: boolean): BatchTimelineStep[] {
  const processing = Math.max(0, summary.totalRows - summary.processed)
  const hasPendingFinality = summary.pending > 0
  const isFinalized = processing === 0 && summary.pending === 0

  return [
    { label: 'Batch Received', state: fileUploaded ? 'done' : 'active' },
    { label: 'File Processed', state: fileUploaded ? 'done' : 'upcoming' },
    { label: 'Rows Processing', state: processing > 0 ? 'active' : 'done' },
    { label: 'Dispatch In Progress', state: processing > 0 ? 'active' : 'done' },
    { label: 'Awaiting Finality', state: hasPendingFinality ? 'warning' : 'done' },
    { label: 'Batch Finalized', state: isFinalized ? 'done' : 'upcoming' },
  ]
}

export function computeFailureCounts(rows: BatchRow[]) {
  const map = new Map<string, number>()
  for (const key of FAILURE_REASON_ORDER) map.set(key, 0)
  for (const row of rows) {
    if (row.status === 'Failed' && row.reason !== '-') {
      map.set(row.reason, (map.get(row.reason) ?? 0) + 1)
    }
  }
  return [...map.entries()].map(([reason, count]) => ({ reason, count }))
}

export function progressFromSummary(summary: BatchSummary) {
  const successPct = (summary.success / summary.totalRows) * 100
  const failedPct = (summary.failed / summary.totalRows) * 100
  const pendingPct = (summary.pending / summary.totalRows) * 100
  const processedPct = (summary.processed / summary.totalRows) * 100
  const processingPct = Math.max(0, 100 - processedPct)
  return {
    successPct,
    failedPct,
    pendingPct,
    processedPct,
    processingPct,
  }
}

export function sortRowsByLatest(rows: BatchRow[], sortMode: 'Latest' | 'Oldest') {
  const valueFor = (time: string) => {
    if (!time || time === '-') return -1
    const [h, m, s] = time.split(':').map(Number)
    if ([h, m, s].some(Number.isNaN)) return -1
    return h * 3600 + m * 60 + s
  }
  const sorted = [...rows].sort((a, b) => valueFor(b.time) - valueFor(a.time))
  return sortMode === 'Latest' ? sorted : sorted.reverse()
}

export async function parseUploadedSheet(file: File): Promise<BatchRow[]> {
  const isCsv = file.name.toLowerCase().endsWith('.csv')
  if (!isCsv) {
    return buildDefaultBatchRows(120)
  }

  const text = await file.text()
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length <= 1) return buildDefaultBatchRows(60)

  const [headerLine, ...dataLines] = lines
  const headers = headerLine.split(',').map((header) => header.trim().toLowerCase())

  const refIdx = headers.findIndex((header) => header.includes('ref'))
  const amountIdx = headers.findIndex((header) => header.includes('amount'))
  const beneficiaryIdx = headers.findIndex((header) => header.includes('beneficiary') || header.includes('account'))
  const statusIdx = headers.findIndex((header) => header.includes('status'))
  const reasonIdx = headers.findIndex((header) => header.includes('reason') || header.includes('error'))

  const rows = dataLines.slice(0, 1200).map((line, index) => {
    const cells = line.split(',').map((cell) => cell.trim())
    const seeded = createRow(index)

    const rawStatus = statusIdx >= 0 ? cells[statusIdx]?.toLowerCase() : ''
    const status: BatchRowStatus =
      rawStatus.includes('success')
        ? 'Success'
        : rawStatus.includes('fail')
          ? 'Failed'
          : rawStatus.includes('pend')
            ? 'Pending'
            : rawStatus.includes('process')
              ? 'Processing'
              : seeded.status

    const amountValue = amountIdx >= 0 ? Number(cells[amountIdx]?.replace(/[^0-9.-]/g, '')) : Number.NaN

    return {
      ...seeded,
      refId: refIdx >= 0 && cells[refIdx] ? cells[refIdx] : seeded.refId,
      amount: Number.isFinite(amountValue) && amountValue > 0 ? amountValue : seeded.amount,
      beneficiary: beneficiaryIdx >= 0 && cells[beneficiaryIdx] ? cells[beneficiaryIdx] : seeded.beneficiary,
      status,
      stage: STAGES_BY_STATUS[status],
      reason: status === 'Failed' ? (reasonIdx >= 0 && cells[reasonIdx] ? cells[reasonIdx] : seeded.reason) : '-',
      actionLabel: actionFor(status),
      timeline: buildTimeline(status, seeded.time),
    }
  })

  return rows.length ? rows : buildDefaultBatchRows(120)
}

