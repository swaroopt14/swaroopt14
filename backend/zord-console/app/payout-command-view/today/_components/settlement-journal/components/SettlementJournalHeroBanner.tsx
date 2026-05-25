'use client'

import {
  JOURNAL_HERO_BLACK_CARD,
  JOURNAL_INSIGHT_DARK_LABEL,
  JOURNAL_INSIGHT_DARK_MUTED,
} from '../../command-center/homeCommandCenterTokens'
import { formatJournalMoney } from '../../intent-journal/formatJournalMoney'
import { useSettlementBatchSelection } from '../context/SettlementBatchSelectionContext'
import { useSettlementBatchSummary } from '../hooks/useSettlementBatchSummary'
import { settlementJournalCopy } from '../copy/settlementJournalCopy'

type SettlementJournalHeroBannerProps = {
  onExport: () => void
  exportDisabled?: boolean
}

export function SettlementJournalHeroBanner({ onExport, exportDisabled }: SettlementJournalHeroBannerProps) {
  const { selectedClientBatchId } = useSettlementBatchSelection()
  const { totalAmount, loading, rows } = useSettlementBatchSummary()

  const grossLabel = formatJournalMoney(totalAmount)
  const countLine = rows.length.toLocaleString('en-IN')

  return (
    <section className={`mb-4 ${JOURNAL_HERO_BLACK_CARD}`}>
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_72%_18%,rgba(255,255,255,0.08)_0%,transparent_58%)]"
        aria-hidden
      />
      <div className="relative flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className={JOURNAL_INSIGHT_DARK_MUTED}>{settlementJournalCopy.hero.label}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">
            {settlementJournalCopy.hero.subtitle}
          </p>
          {loading && !rows.length ? (
            <p className={`mt-3 text-[15px] ${JOURNAL_INSIGHT_DARK_LABEL}`}>Loading settlement records…</p>
          ) : (
            <>
              <p className="mt-2 text-[2.25rem] font-extrabold tabular-nums tracking-[-0.03em] text-white">{grossLabel}</p>
              <p className="mt-1 font-mono text-[13px] text-white/55">
                {selectedClientBatchId || settlementJournalCopy.sidebar.selectBatch} · {countLine}{' '}
                {settlementJournalCopy.sidebar.records}
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled || !selectedClientBatchId}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/25 bg-white/5 px-4 text-[14px] font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
          {settlementJournalCopy.export.menuLabel}
        </button>
      </div>
    </section>
  )
}
