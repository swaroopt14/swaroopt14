import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { AmbiguityVelocityScatterResponse } from '@/services/payout-command/prod-api/ambiguityVelocityTypes'
import { coerceMinor } from '../../leakage-portfolio/utils/formatMinorInr'

export type AmbiguityScatterPoint = {
  batchId: string
  date: string
  observedAt: string
  /** Hours since window start (0 … windowDays×24). X-axis. */
  timeHours: number
  timeLabel: string
  dayLabel: string
  dayIndex: number
  /** 0–100 ambiguity level (Y-axis). */
  ambiguityLevelPct: number
  totalAmountMinor: number
  ambiguousAmountMinor: number
  /** Red = high ambiguity, green = low (bubble color). */
  bubbleColor: string
}

/** Soft pastel palette tuned for overlapping translucent bubbles. */
const COLOR_HIGH = '#f87171' // coral red — high ambiguity
const COLOR_MID = '#fbbf24' // amber — medium
const COLOR_LOW = '#4ade80' // mint green — low

/** Map ambiguity % → bubble color (high red, low green). */
export function bubbleColorForAmbiguity(pct: number): string {
  if (pct >= 35) return COLOR_HIGH
  if (pct <= 18) return COLOR_LOW
  return COLOR_MID
}

export const AMBIGUITY_BUBBLE_LEGEND = [
  { label: 'High ambiguity', color: COLOR_HIGH, hint: 'Large bubble' },
  { label: 'Medium', color: COLOR_MID, hint: '' },
  { label: 'Low ambiguity', color: COLOR_LOW, hint: 'Small bubble' },
] as const

export const MOCK_PREVIEW_BATCH_COUNT = 60
export const HOURS_PER_DAY = 24

/** Preview: 200 batches spread randomly across 7 days × 24h. */
export function getWindowMeta(days = 7): { start: Date; end: Date; totalHours: number } {
  const end = new Date()
  end.setMinutes(0, 0, 0)
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)
  return { start, end, totalHours: days * HOURS_PER_DAY }
}

/**
 * Mulberry32 — proper seeded PRNG.
 * Returns a fresh stream per `seed` so we can produce independent X/Y/etc.
 */
function rng(seed: number): () => number {
  let state = (seed >>> 0) || 1
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function ambiguityLevelPct(
  total: number,
  ambiguous: number,
  fromApi?: number,
): number {
  if (fromApi != null && Number.isFinite(fromApi)) {
    return Math.min(100, Math.max(0, fromApi))
  }
  if (total <= 0) return 0
  return Math.min(100, Math.round((ambiguous / total) * 1000) / 10)
}

function formatTimeLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

function hoursSinceWindow(observed: Date, windowStart: Date): number {
  const ms = observed.getTime() - windowStart.getTime()
  return Math.min(Math.max(ms / 3_600_000, 0), 7 * HOURS_PER_DAY)
}

function rowToPoint(
  row: {
    batch_id: string
    date: string
    observed_at?: string
    total_amount_minor: number | string
    ambiguous_amount_minor: number | string
    ambiguity_level_pct?: number
  },
  windowStart: Date,
): AmbiguityScatterPoint {
  const batchId = row.batch_id?.trim() || '—'

  const iso = row.observed_at?.trim() || `${row.date}T12:00:00.000Z`
  const observed = new Date(iso)
  const safeObserved = Number.isNaN(observed.getTime())
    ? new Date(`${row.date}T12:00:00`)
    : observed

  const timeHours = hoursSinceWindow(safeObserved, windowStart)
  const dayIndex = Math.floor(timeHours / HOURS_PER_DAY)
  const total = coerceMinor(row.total_amount_minor)
  const ambiguous = coerceMinor(row.ambiguous_amount_minor)
  const level = ambiguityLevelPct(total, ambiguous, row.ambiguity_level_pct)

  return {
    batchId,
    date: row.date,
    observedAt: safeObserved.toISOString(),
    timeHours,
    timeLabel: formatTimeLabel(safeObserved),
    dayLabel: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(safeObserved),
    dayIndex,
    ambiguityLevelPct: level,
    totalAmountMinor: total,
    ambiguousAmountMinor: ambiguous,
    bubbleColor: bubbleColorForAmbiguity(level),
  }
}

/**
 * Mock: each batch lands at a pseudo-random time in the 7-day window.
 * X and Y use independent hashes so points do not form diagonal stripes.
 */
export function buildAmbiguityVelocityMock(
  days = 7,
  batchCount = MOCK_PREVIEW_BATCH_COUNT,
  focusBatchId?: string,
): AmbiguityScatterPoint[] {
  const { start, totalHours } = getWindowMeta(days)
  const points: AmbiguityScatterPoint[] = []

  const focused = focusBatchId?.trim()
  const count = focused ? days * 4 : batchCount

  // Each axis gets its own seeded stream so X/Y/size are independent.
  const rngTime = rng(focused ? 9001 : 11)
  const rngLevel = rng(focused ? 7777 : 4242)
  const rngAmount = rng(focused ? 5050 : 8181)

  for (let b = 0; b < count; b++) {
    const batchId = focused ? focused : `BCH-2026-${String(b + 1).padStart(5, '0')}`

    const timeHours = focused
      ? Math.floor(b / 4) * HOURS_PER_DAY + (b % 4) * 5 + rngTime() * 4
      : rngTime() * totalHours

    const observed = new Date(start.getTime() + timeHours * 3_600_000)
    const total = 200_000 + Math.round(rngAmount() * 4_800_000)

    // Skewed distribution: most batches are low/medium ambiguity, a few are high.
    const noise = rngLevel()
    const level = Math.round(
      noise < 0.55 ? 4 + noise * 26 : noise < 0.85 ? 18 + (noise - 0.55) * 60 : 40 + (noise - 0.85) * 280,
    )
    const safeLevel = Math.min(85, Math.max(2, level))

    points.push(
      rowToPoint(
        {
          batch_id: batchId,
          date: observed.toISOString().slice(0, 10),
          observed_at: observed.toISOString(),
          total_amount_minor: total,
          ambiguous_amount_minor: Math.round((total * safeLevel) / 100),
          ambiguity_level_pct: safeLevel,
        },
        start,
      ),
    )
  }

  return points
}

export function mapAmbiguityVelocityScatter(
  res: AmbiguityVelocityScatterResponse | null,
): { points: AmbiguityScatterPoint[]; live: boolean } {
  if (!isDataAvailable(res) || !Array.isArray(res.points) || res.points.length === 0) {
    return { points: [], live: false }
  }

  const days = res.window_days ?? 7
  const start = res.window_start ? new Date(res.window_start) : getWindowMeta(days).start
  const points = res.points.map((row) =>
    rowToPoint(
      {
        batch_id: row.batch_id,
        date: row.date,
        observed_at: row.observed_at,
        total_amount_minor: row.total_amount_minor,
        ambiguous_amount_minor: row.ambiguous_amount_minor,
        ambiguity_level_pct: row.ambiguity_level_pct,
      },
      start,
    ),
  )

  return { points, live: true }
}

/** Day labels at noon; 6h marks show time only. */
export function scatterTimeAxisTicks(days = 7): { hours: number; label: string }[] {
  const { start } = getWindowMeta(days)
  const ticks: { hours: number; label: string }[] = []
  for (let h = 0; h <= days * HOURS_PER_DAY; h += 6) {
    const d = new Date(start.getTime() + h * 3_600_000)
    const isDayStart = h % HOURS_PER_DAY === 0
    ticks.push({
      hours: h,
      label: isDayStart
        ? new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d)
        : new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: true }).format(d),
    })
  }
  return ticks
}

export function scatterDensitySummary(points: AmbiguityScatterPoint[]): {
  batchCount: number
  pointCount: number
  perDay: { label: string; count: number }[]
} {
  const batchIds = new Set(points.map((p) => p.batchId))
  const dayCounts = new Map<string, number>()
  for (const p of points) {
    const key = p.dayLabel
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1)
  }
  return {
    batchCount: batchIds.size,
    pointCount: points.length,
    perDay: [...dayCounts.entries()].map(([label, count]) => ({ label, count })),
  }
}

export function fullDayLabel(isoDate: string): string {
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return isoDate
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}
