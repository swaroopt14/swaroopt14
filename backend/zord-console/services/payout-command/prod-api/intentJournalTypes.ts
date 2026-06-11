/** Raw shapes from zord-intent-engine journal split endpoints (port 8083). */

export type IntentJournalBatchIdItem = {
  batch_id: string
}

export type IntentJournalBatchIdsResponse = {
  items: IntentJournalBatchIdItem[]
}

export type IntentJournalPaymentIntentItem = {
  tenant_id?: string
  amount?: string | number
  currency?: string
  intended_execution_at?: string
  provider_hint?: string
  rail_hint?: string
  intent_quality_score?: number | null
  /** Batch-level aggregate confidence (same value on every intent in the batch). */
  aggregate_confidence_score?: number | null
  intent_id?: string
  envelope_id?: string
  batch_id?: string
  client_payout_ref?: string
  client_batch_ref?: string
  source_row_num?: number
  beneficiary_type?: string | null
  beneficiary?: Record<string, unknown> | null
  routing_hints_json?: Record<string, unknown> | null
  status?: string | null
  governance_state?: string | null
  business_state?: string | null
}

export type IntentJournalPaymentIntentsResponse = {
  items: IntentJournalPaymentIntentItem[]
  pagination?: {
    page?: number
    page_size?: number
    total?: number
  }
}

export type IntentJournalDlqItem = {
  dlq_id: string
  tenant_id?: string
  envelope_id?: string
  stage?: string
  reason_code?: string
  error_detail?: string
  dlq_status?: string
  intent_context?: Record<string, unknown> | null
  trace_id?: string
  replayable?: boolean
  client_batch_ref?: string
  batch_id?: string
  source_row_num?: number
  created_at?: string
}

export type IntentJournalDlqItemsResponse = {
  items: IntentJournalDlqItem[]
  pagination?: {
    page?: number
    page_size?: number
    total?: number
  }
}
