/** Query param for `GET /api/prod/home/disbursement-trend` (and future dedicated service). */
export type DisbursementTrendRange = 'week' | 'month' | 'quarter' | 'year'

export type DisbursementTrendBucket = {
  /** Stable ordering key (ISO date or period id). */
  key: string
  /** Short label for X axis (e.g. "Mon 5", "Jan"). */
  label: string
  /** Sum of intent amounts in window (currency units from backend, typically INR). */
  total_amount: number
  /** Sum of amounts for intents considered bank-confirmed / settled. */
  confirmed_amount: number
  intent_count: number
  confirmed_count: number
}

/** Response from Next route today; swap `source` when a dedicated analytics service exists. */
export type DisbursementTrendResponse = {
  data_available: boolean
  range: DisbursementTrendRange
  currency: string
  buckets: DisbursementTrendBucket[]
  /** How this payload was produced — for debugging / migration. */
  source: 'intent_engine_aggregate' | 'analytics_service'
  /** When aggregating from paginated intents, caps applied. */
  note?: string
}
