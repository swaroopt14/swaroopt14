/** Customer-facing copy for Settlement Journal (bank/PSP outcomes). */

export const settlementJournalCopy = {
  hero: {
    label: 'Observed Settlement Value',
    subtitle: 'Sum of observed amounts from settlement records',
  },
  kpi: {
    linkedBatch: 'Linked Batch',
    recordsReceived: 'Settlement Records Received',
    recordsMarkedSettled: 'Records Marked Settled',
    netSettled: 'Net Settled Value',
    matchedToIntents: 'Matched to Payment Intents',
    matchedFromIntentId: 'Linked via client ref or intent id',
    matchedAwaitingPipeline:
      'Matching pipeline has not linked settlement rows to intents yet',
  },
  sidebar: {
    batchLabel: 'Batch',
    records: 'settlement records',
    observedValue: 'observed value',
    selectBatch: 'Select a batch from the sidebar',
  },
  tabs: {
    observations: 'Settlement Observations',
    parseErrors: 'Review Items',
  },
  table: {
    sourceRow: 'Source Row',
    clientRef: 'Client Ref',
    bankRef: 'Bank Ref / UTR',
    observedAmount: 'Observed Amount',
    netSettled: 'Net Settled',
    fee: 'Fee',
    sourceStatus: 'Source Status',
    matchStatus: 'Match Status',
    matchedPayment: 'Matched Payment',
    matchConfidence: 'Match Confidence',
    observedAt: 'Observed At',
    missingClientRef: 'Missing Client Ref',
    missingBankRef: 'Missing Bank Ref',
    searchPlaceholder: 'Search client ref, bank ref, amount, status…',
  },
  dataHealth: {
    title: 'Settlement Data Health',
    recordsReceived: 'Records received',
    withBankRef: 'Records with bank reference',
    withClientRef: 'Records with client reference',
    matchedToIntents: 'Records matched to intents',
    matchedAwaitingPipeline:
      'Matching pipeline has not linked settlement rows to intents yet',
    matchedProvisional: 'Provisional match from attachment score',
    unmatchedValue: 'Unmatched / orphan value',
    avgMatchConfidence: 'Avg match confidence',
    missingRefRate: 'Missing reference rate',
  },
  netSettledNotProvided: 'Not provided in source file',
  export: {
    menuLabel: 'Export',
    records: 'Export settlement records',
    matchingReport: 'Export matching report',
    unmatchedOnly: 'Export unmatched only',
  },
} as const
