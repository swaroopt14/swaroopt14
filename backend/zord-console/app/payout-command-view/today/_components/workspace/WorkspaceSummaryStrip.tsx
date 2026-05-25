'use client'

import { SUMMARY_TILE_LABELS } from './paymentOperationsCopy'
import type { PaymentOperationsSummary } from './paymentOperationsTypes'
import { WORKSPACE_CARD, WORKSPACE_TEXT_LABEL, WORKSPACE_TEXT_MUTED, WORKSPACE_TEXT_PRIMARY } from './workspaceTokens'

const TILE = `${WORKSPACE_CARD} flex min-h-[108px] flex-col justify-between`

function SummaryTile({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <article className={TILE}>
      <p className={`text-[11px] font-medium uppercase tracking-[0.1em] ${WORKSPACE_TEXT_LABEL}`}>{title}</p>
      <p className={`mt-2 text-[28px] font-light tracking-[-0.04em] tabular-nums ${WORKSPACE_TEXT_PRIMARY}`}>
        {value}
      </p>
      <p className={`mt-1 text-[12px] leading-snug ${WORKSPACE_TEXT_MUTED}`}>{sub}</p>
    </article>
  )
}

export function WorkspaceSummaryStrip({
  summary,
  loading,
}: {
  summary: PaymentOperationsSummary
  loading?: boolean
}) {
  const s = loading
    ? {
        inScope: '…',
        inScopeSub: '…',
        valueObserved: '…',
        valueObservedSub: '…',
        needingReview: '…',
        needingReviewSub: '…',
        matchConfidence: '…',
        matchConfidenceSub: '…',
        proofReadiness: '…',
        proofReadinessSub: '…',
      }
    : summary

  return (
    <div
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      data-testid="workspace-summary-strip"
    >
      <SummaryTile title={SUMMARY_TILE_LABELS.inScope} value={s.inScope} sub={s.inScopeSub} />
      <SummaryTile title={SUMMARY_TILE_LABELS.valueObserved} value={s.valueObserved} sub={s.valueObservedSub} />
      <SummaryTile title={SUMMARY_TILE_LABELS.needingReview} value={s.needingReview} sub={s.needingReviewSub} />
      <SummaryTile
        title={SUMMARY_TILE_LABELS.matchConfidence}
        value={s.matchConfidence}
        sub={s.matchConfidenceSub}
      />
      <SummaryTile title={SUMMARY_TILE_LABELS.proofReadiness} value={s.proofReadiness} sub={s.proofReadinessSub} />
    </div>
  )
}
