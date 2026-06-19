/** Shared smoke tenant + rolling dated batch catalogue for home trend + journals. */

export const TENANT_ID =
  process.env.SMOKE_TENANT_ID?.trim() || '00000000-0000-0000-0000-000000000001'

export const SMOKE_API_KEY = process.env.SMOKE_API_KEY?.trim() || 'smoke-local-api-key'

export function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Rows per batch for intents + settlement observations. */
export const SMOKE_ROWS_PER_DAY = 15

/** How many rolling demo days to materialize (week/month/quarter filters). */
export const SMOKE_DEMO_DAY_COUNT = parsePositiveInt(process.env.SMOKE_DEMO_DAY_COUNT, 30)

/** Varied intent vs settlement profiles — cycled for rolling windows. */
const SMOKE_DAY_PROFILES = [
  {
    labelSuffix: 'payroll',
    intentRupees: 55_000,
    settlementRupees: 44_000,
    dlqCount: 2,
    settledRows: 11,
    pendingRows: 3,
    failedRows: 1,
    matchConfidence: 0.72,
    partner: 'razorpay',
    finality: 'PARTIALLY_SETTLED',
  },
  {
    labelSuffix: 'vendor run',
    intentRupees: 68_000,
    settlementRupees: 61_000,
    dlqCount: 0,
    settledRows: 14,
    pendingRows: 1,
    failedRows: 0,
    matchConfidence: 0.88,
    partner: 'cashfree',
    finality: 'FULLY_SETTLED',
  },
  {
    labelSuffix: 'refunds',
    intentRupees: 48_000,
    settlementRupees: 51_000,
    dlqCount: 1,
    settledRows: 12,
    pendingRows: 2,
    failedRows: 1,
    matchConfidence: 0.68,
    partner: 'razorpay',
    finality: 'PARTIALLY_SETTLED',
  },
  {
    labelSuffix: 'contractor',
    intentRupees: 71_000,
    settlementRupees: 52_000,
    dlqCount: 3,
    settledRows: 10,
    pendingRows: 4,
    failedRows: 1,
    matchConfidence: 0.61,
    partner: 'cashfree',
    finality: 'OPEN',
  },
  {
    labelSuffix: 'incentives',
    intentRupees: 53_000,
    settlementRupees: 49_000,
    dlqCount: 1,
    settledRows: 13,
    pendingRows: 1,
    failedRows: 1,
    matchConfidence: 0.79,
    partner: 'razorpay',
    finality: 'PARTIALLY_SETTLED',
  },
  {
    labelSuffix: 'peak run',
    intentRupees: 88_000,
    settlementRupees: 72_000,
    dlqCount: 0,
    settledRows: 15,
    pendingRows: 0,
    failedRows: 0,
    matchConfidence: 0.91,
    partner: 'cashfree',
    finality: 'FULLY_SETTLED',
  },
  {
    labelSuffix: 'micro-batch',
    intentRupees: 41_000,
    settlementRupees: 35_000,
    dlqCount: 2,
    settledRows: 9,
    pendingRows: 5,
    failedRows: 1,
    matchConfidence: 0.58,
    partner: 'razorpay',
    finality: 'OPEN',
  },
  {
    labelSuffix: 'partner payouts',
    intentRupees: 67_000,
    settlementRupees: 61_000,
    dlqCount: 1,
    settledRows: 14,
    pendingRows: 1,
    failedRows: 0,
    matchConfidence: 0.85,
    partner: 'cashfree',
    finality: 'FULLY_SETTLED',
  },
  {
    labelSuffix: 'sweep',
    intentRupees: 59_000,
    settlementRupees: 45_000,
    dlqCount: 2,
    settledRows: 11,
    pendingRows: 3,
    failedRows: 1,
    matchConfidence: 0.7,
    partner: 'razorpay',
    finality: 'PARTIALLY_SETTLED',
  },
  {
    labelSuffix: 'close-out',
    intentRupees: 76_000,
    settlementRupees: 68_000,
    dlqCount: 0,
    settledRows: 15,
    pendingRows: 0,
    failedRows: 0,
    matchConfidence: 0.89,
    partner: 'cashfree',
    finality: 'FULLY_SETTLED',
  },
]

function isoDateUtc(d) {
  return d.toISOString().slice(0, 10)
}

function dayChartLabel(iso) {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Pin fixed Jun 12–21 demo batches so journal/evidence URLs stay stable in smoke. */
const PINNED_DEMO_DAYS = [
  { date: '2026-06-12', labelSuffix: 'payroll', intentRupees: 55_000, settlementRupees: 44_000, dlqCount: 2, settledRows: 11, pendingRows: 3, failedRows: 1, matchConfidence: 0.72, partner: 'razorpay', finality: 'PARTIALLY_SETTLED' },
  { date: '2026-06-13', labelSuffix: 'vendor run', intentRupees: 68_000, settlementRupees: 61_000, dlqCount: 0, settledRows: 14, pendingRows: 1, failedRows: 0, matchConfidence: 0.88, partner: 'cashfree', finality: 'FULLY_SETTLED' },
  { date: '2026-06-14', labelSuffix: 'refunds', intentRupees: 48_000, settlementRupees: 51_000, dlqCount: 1, settledRows: 12, pendingRows: 2, failedRows: 1, matchConfidence: 0.68, partner: 'razorpay', finality: 'PARTIALLY_SETTLED' },
  { date: '2026-06-15', labelSuffix: 'contractor', intentRupees: 71_000, settlementRupees: 52_000, dlqCount: 3, settledRows: 10, pendingRows: 4, failedRows: 1, matchConfidence: 0.61, partner: 'cashfree', finality: 'OPEN' },
  { date: '2026-06-16', labelSuffix: 'incentives', intentRupees: 53_000, settlementRupees: 49_000, dlqCount: 1, settledRows: 13, pendingRows: 1, failedRows: 1, matchConfidence: 0.79, partner: 'razorpay', finality: 'PARTIALLY_SETTLED' },
  { date: '2026-06-17', labelSuffix: 'peak run', intentRupees: 88_000, settlementRupees: 72_000, dlqCount: 0, settledRows: 15, pendingRows: 0, failedRows: 0, matchConfidence: 0.91, partner: 'cashfree', finality: 'FULLY_SETTLED' },
  { date: '2026-06-18', labelSuffix: 'micro-batch', intentRupees: 41_000, settlementRupees: 35_000, dlqCount: 2, settledRows: 9, pendingRows: 5, failedRows: 1, matchConfidence: 0.58, partner: 'razorpay', finality: 'OPEN' },
  { date: '2026-06-19', labelSuffix: 'partner payouts', intentRupees: 67_000, settlementRupees: 61_000, dlqCount: 1, settledRows: 14, pendingRows: 1, failedRows: 0, matchConfidence: 0.85, partner: 'cashfree', finality: 'FULLY_SETTLED' },
  { date: '2026-06-20', labelSuffix: 'sweep', intentRupees: 59_000, settlementRupees: 45_000, dlqCount: 2, settledRows: 11, pendingRows: 3, failedRows: 1, matchConfidence: 0.7, partner: 'razorpay', finality: 'PARTIALLY_SETTLED' },
  { date: '2026-06-21', labelSuffix: 'close-out', intentRupees: 76_000, settlementRupees: 68_000, dlqCount: 0, settledRows: 15, pendingRows: 0, failedRows: 0, matchConfidence: 0.89, partner: 'cashfree', finality: 'FULLY_SETTLED' },
]

/** Rolling demo days ending today UTC — keeps week/month/quarter filters populated. */
export function buildSmokeDemoDays() {
  const total = SMOKE_DEMO_DAY_COUNT
  const today = new Date()
  today.setUTCHours(12, 0, 0, 0)
  const days = []
  for (let i = 0; i < total; i += 1) {
    const profile = SMOKE_DAY_PROFILES[i % SMOKE_DAY_PROFILES.length]
    const cycle = Math.floor(i / SMOKE_DAY_PROFILES.length)
    const swing = cycle * 4_500 + (i % 3) * 1_200
    const d = new Date(today)
    d.setUTCDate(today.getUTCDate() - (total - 1 - i))
    const date = isoDateUtc(d)
    days.push({
      date,
      label: dayChartLabel(date),
      intentRupees: profile.intentRupees + swing,
      settlementRupees: Math.max(28_000, profile.settlementRupees + Math.round(swing * 0.78)),
      dlqCount: profile.dlqCount,
      settledRows: profile.settledRows,
      pendingRows: profile.pendingRows,
      failedRows: profile.failedRows,
      matchConfidence: profile.matchConfidence,
      partner: profile.partner,
      finality: profile.finality,
    })
  }
  return days
}

function dayChartLabelFromIso(iso) {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function buildSmokeDemoDaysMerged() {
  const rolling = buildSmokeDemoDays()
  const byDate = new Map(rolling.map((d) => [d.date, d]))
  for (const pinned of PINNED_DEMO_DAYS) {
    byDate.set(pinned.date, {
      date: pinned.date,
      label: dayChartLabelFromIso(pinned.date),
      intentRupees: pinned.intentRupees,
      settlementRupees: pinned.settlementRupees,
      dlqCount: pinned.dlqCount,
      settledRows: pinned.settledRows,
      pendingRows: pinned.pendingRows,
      failedRows: pinned.failedRows,
      matchConfidence: pinned.matchConfidence,
      partner: pinned.partner,
      finality: pinned.finality,
      labelSuffix: pinned.labelSuffix,
    })
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

export const SMOKE_DEMO_DAYS = buildSmokeDemoDaysMerged()

export function buildSmokeBatches() {
  return SMOKE_DEMO_DAYS.map((d) => ({
    id: `smoke-batch-${d.date}`,
    label: `${d.label} ${d.labelSuffix ?? ''}`.trim(),
    date: d.date,
    intentCount: SMOKE_ROWS_PER_DAY,
    observationCount: SMOKE_ROWS_PER_DAY,
    intentTotalRupees: d.intentRupees,
    settlementTotalRupees: d.settlementRupees,
    dlqCount: d.dlqCount,
    settledRows: d.settledRows,
    pendingRows: d.pendingRows,
    failedRows: d.failedRows,
    matchConfidence: d.matchConfidence,
    partner: d.partner,
    finality: d.finality,
    totalIntendedMinor: d.intentRupees,
  }))
}

export const BATCH_COUNT = parsePositiveInt(process.env.SMOKE_BATCH_COUNT, SMOKE_DEMO_DAYS.length)

const ALL_BATCHES = buildSmokeBatches()
export const BATCHES =
  BATCH_COUNT >= ALL_BATCHES.length ? ALL_BATCHES : ALL_BATCHES.slice(-BATCH_COUNT)

export const PRIMARY_BATCH = BATCHES[BATCHES.length - 1]?.id ?? `smoke-batch-${isoDateUtc(new Date())}`

/** Stable demo batch for journal / evidence deep-links. */
export const EVIDENCE_BATCH = 'smoke-batch-2026-06-12'
export function batchPackId(batchId) {
  return `pack-${batchId}`
}

/** @deprecated Legacy alias — prefer batchPackId(batchId). */
export const PACK_BATCH = batchPackId('smoke-batch-2026-06-12')
export const PACK_INTENT_A = 'pack-intent-smoke-a'
export const PACK_INTENT_B = 'pack-intent-smoke-b'

export function intentId(batchId, index) {
  return `smoke-intent-${batchId.replace(/[^a-z0-9]/gi, '')}-${String(index + 1).padStart(3, '0')}`
}
