'use client'

import { useMemo } from 'react'
import { computeSettlementBatchSummary } from '../settlementJournalSidebarUtils'
import { useSettlementBatchSelection } from '../context/SettlementBatchSelectionContext'
import { useSettlementObservationRows } from './useSettlementObservationRows'

/** Hero / KPI / donut widgets — shares observation fetch with table via cache dedupe. */
export function useSettlementBatchSummary() {
  const { selectedClientBatchId, journalEnabled } = useSettlementBatchSelection()
  const { rows, loading } = useSettlementObservationRows(selectedClientBatchId, journalEnabled)

  return useMemo(
    () => ({
      rows,
      loading,
      ...computeSettlementBatchSummary(rows),
    }),
    [rows, loading],
  )
}
