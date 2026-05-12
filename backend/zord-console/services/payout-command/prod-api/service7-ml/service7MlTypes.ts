export type Service7ScopeType = 'tenant' | 'batch' | 'connector' | 'corridor' | 'source_system'

export type Service7KpiQuery = {
  scope?: Service7ScopeType
  scopeRef?: string
  from?: string
  to?: string
  batchId?: string
  tenantId?: string
}

export type Service7ValuePoint = {
  key: string
  value: number
  unit?: string
}

export type Service7MetricResponse = {
  snapshotId?: string
  scopeType?: string
  scopeRef?: string
  windowStart?: string
  windowEnd?: string
  values?: Record<string, number | string | null>
  points?: Service7ValuePoint[]
}

export type Service7TimeSeriesPoint = {
  ts: string
  value: number
}

export type Service7MlPrediction = {
  prediction_id: string
  model_id: string
  scope_type: 'INTENT' | 'BATCH' | 'PROVIDER' | 'CORRIDOR' | 'SOURCE_SYSTEM' | 'TENANT'
  scope_ref: string
  prediction_family: string
  prediction_value: string
  prediction_score: number
  confidence: number
  feature_row_id: string
  explanation: {
    top_features: string[]
    reason_codes: string[]
  }
  created_at: string
}

export type Service7MlPredictionsResponse = {
  items?: Service7MlPrediction[]
}

export type Service7RcaCluster = {
  cluster_id: string
  label: string
  impact_amount: number
  top_source: string
  recommended_fix: string
  examples: string[]
}

export type Service7RcaClustersResponse = {
  items?: Service7RcaCluster[]
}

