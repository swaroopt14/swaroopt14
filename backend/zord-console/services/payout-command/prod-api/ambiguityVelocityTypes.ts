import type { EmptyKpiResponse, MinorAmountField, Resolved } from './intelligenceTypes'

/** One bubble on the Ambiguity Velocity scatter (7-day window). */
export type AmbiguityVelocityScatterRow = {
  /** Calendar date YYYY-MM-DD. */
  date: string
  /** When the batch was observed (ISO-8601). Drives X-axis time position. */
  observed_at?: string
  batch_id: string
  total_amount_minor: MinorAmountField
  ambiguous_amount_minor: MinorAmountField
  /** Optional 0–100; if omitted, UI derives from ambiguous ÷ total. */
  ambiguity_level_pct?: number
}

export type AmbiguityVelocityScatterResolved = Resolved<{
  window_days: number
  window_start?: string
  window_end?: string
  batch_id?: string
  points: AmbiguityVelocityScatterRow[]
}>

export type AmbiguityVelocityScatterResponse =
  | AmbiguityVelocityScatterResolved
  | EmptyKpiResponse
