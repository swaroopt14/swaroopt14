'use client'

import Link from 'next/link'
import type { SettlementBatchSummary } from '@/services/payout-command/batch-operations/useBatchOperationsFeed'
import { formatInrPrecise } from '@/services/payout-command/batch-model'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { HydrationSafeLocaleTime } from '../../command-center/RecommendedBlackCard'

type SettlementStatusCardProps = {
  batchId: string
  summary: SettlementBatchSummary | null
  settlementJournalHref: string | null
  syncAt: Date | null
  showSandboxLink: boolean
}

export function SettlementStatusCard({
  batchId,
  summary,
  settlementJournalHref,
  syncAt,
  showSandboxLink,
}: SettlementStatusCardProps) {
  return (
    <article className={`${COMMAND_CENTER_KPI_CARD} h-full`}>
      <div className={COMMAND_CENTER_LABEL_GREEN}>Settlement</div>
      <h2 className={`mt-2 text-[1.1rem] font-semibold tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>
        Observation summary
      </h2>
      {!batchId.trim() ? (
        <p className={`mt-3 ${HOME_BODY_IMPERIAL_SM}`}>Enter or select a Batch-Id to load settlement observations.</p>
      ) : summary && summary.observationCount > 0 ? (
        <>
          <p className={`mt-3 text-[28px] font-extrabold tabular-nums ${HOME_TITLE_BLACK}`}>
            {summary.settledPct.toFixed(0)}%
          </p>
          <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>
            {summary.observationCount.toLocaleString('en-IN')} observations ·{' '}
            {formatInrPrecise(summary.settledAmount)} settled of {formatInrPrecise(summary.grossAmount)} gross
          </p>
          {syncAt ? (
            <p className={`mt-2 text-[12px] text-[#888888]`}>
              Last sync · <HydrationSafeLocaleTime date={syncAt} />
            </p>
          ) : null}
          {settlementJournalHref && showSandboxLink ? (
            <Link
              href={settlementJournalHref}
              className="mt-4 inline-flex text-[13px] font-semibold text-indigo-800 underline underline-offset-2"
            >
              Open Settlement Journal
            </Link>
          ) : settlementJournalHref ? (
            <Link
              href={settlementJournalHref}
              className="mt-4 inline-flex text-[13px] font-semibold text-indigo-800 underline underline-offset-2"
            >
              View observations
            </Link>
          ) : (
            <p className={`mt-4 ${HOME_BODY_IMPERIAL_SM}`}>
              Observations load in Settlement Journal when the settlement service has processed this batch.
            </p>
          )}
        </>
      ) : (
        <p className={`mt-3 ${HOME_BODY_IMPERIAL_SM}`}>
          No settlement observations yet for <span className="font-mono text-[12px]">{batchId}</span>. Complete Step 2
          or wait for processing.
        </p>
      )}
    </article>
  )
}
