export const LIVE_JOURNAL_POLL_MS = 8_000
export const JOURNAL_BATCH_IDS_BFF_PATH = '/api/prod/intents/batch-ids'
export const JOURNAL_PAYMENT_INTENTS_BFF_PATH = '/api/prod/intents/payment-intents'
export const JOURNAL_DLQ_ITEMS_BFF_PATH = '/api/prod/intents/dlq-items'

/** @deprecated Use JOURNAL_BATCH_IDS_BFF_PATH — journal no longer uses monolithic batches list. */
export const JOURNAL_BATCHES_BFF_PATH = '/api/prod/intents/batches'
