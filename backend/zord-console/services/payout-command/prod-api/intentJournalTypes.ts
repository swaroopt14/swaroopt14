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
  intent_quality_score?: number
  intent_id?: string
  envelope_id?: string
  client_payout_ref?: string
}

export type IntentJournalPaymentIntentsResponse = {
  items: IntentJournalPaymentIntentItem[]
}

export type IntentJournalDlqItem = {
  dlq_id: string
  tenant_id?: string
  envelope_id?: string
  stage?: string
  reason_code?: string
  error_detail?: string
  replayable?: boolean
  client_batch_ref?: string
  created_at?: string
}

export type IntentJournalDlqItemsResponse = {
  items: IntentJournalDlqItem[]
}
