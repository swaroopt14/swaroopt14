export type DashboardPeriod = 'daily' | 'weekly' | 'monthly'
export type DashboardRange = '1m' | '3m' | '6m'
export type ActivityMode = 'transactions' | 'customers'

export type DriverTone = 'positive' | 'neutral' | 'warning'
export type RetentionHealth = 'Healthy' | 'Watch' | 'At Risk'

export type AppFinalDashboardQuery = {
  tenant_id: string
  period?: DashboardPeriod
  range?: DashboardRange
  activity_mode?: ActivityMode
  from?: string
  to?: string
}

export type PaymentsStage = {
  key: string
  label: string
  value: number
  display: string
  pct?: number | null
  pct_of?: number | null
}

export type GrossVolumeCategory = {
  key: string
  label: string
  amount: number
  amount_display: string
  share_pct: number
}

export type GrossVolumeChip = {
  key: string
  label: string
  value: string
  sub: string
}

export type RetentionPayload = {
  range: DashboardRange
  current_pct: number
  target_pct: number
  gap_pts: number
  health: RetentionHealth
}

export type ActivityPayload = {
  mode: ActivityMode
  value: string
  unit: string
  peak_day: string
  delta: string
  delta_label: string
  fill_target: number
}

export type InsightDriver = {
  label: string
  value: string
  tone: DriverTone
}

export type InsightChip = {
  label: string
  value: string
  color: string
  width: number
}

export type InsightPayload = {
  score: number
  status_label: string
  status_color: string
  confidence: number
  updated_label: string
  progress: number
  title: string
  description: string
  drivers: InsightDriver[]
  chips: InsightChip[]
}

export type AppFinalDashboardResponse = {
  tenant_id: string
  generated_at: string
  period: DashboardPeriod
  range: DashboardRange
  activity_mode: ActivityMode
  payments_funnel: {
    stages: PaymentsStage[]
  }
  gross_volume: {
    total: number
    total_display: string
    growth_pct: number
    categories: GrossVolumeCategory[]
    chips: GrossVolumeChip[]
  }
  retention: RetentionPayload
  activity: ActivityPayload
  ai_insights: InsightPayload
}
