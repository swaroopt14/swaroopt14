'use client'

import {
  JOURNAL_HERO_BLACK_CARD,
  JOURNAL_INSIGHT_DARK_LABEL,
  JOURNAL_INSIGHT_DARK_MUTED,
} from '../../command-center/homeCommandCenterTokens'
import { useJournalBatchFromList } from '../hooks/useJournalBatchFromList'
import { useJournalBatchSelection } from '../context/JournalBatchSelectionContext'

function formatInrRupees(rupees: number): string {
  if (!Number.isFinite(rupees)) return '—'
  const r = Math.abs(rupees)
  if (r >= 10_000_000) return `₹${(r / 10_000_000).toFixed(2)} Cr`
  if (r >= 100_000) return `₹${(r / 100_000).toFixed(2)} L`
  if (r >= 1000) return `₹${(r / 1000).toFixed(1)} K`
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(r)
}

type IntentJournalHeroBannerProps = {
  onExport: () => void
  exportDisabled?: boolean
}

export function IntentJournalHeroBanner({ onExport, exportDisabled }: IntentJournalHeroBannerProps) {
  const { selectedBatchId, journalEnabled } = useJournalBatchSelection()
  const { batch, loading } = useJournalBatchFromList(selectedBatchId, journalEnabled)

  const valueLabel = batch ? formatInrRupees(batch.totalValue) : '—'
  const program = batch?.apiType ?? batch?.type ?? '—'

  return (
    <section className={`mb-4 ${JOURNAL_HERO_BLACK_CARD}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_72%_18%,rgba(255,255,255,0.08)_0%,transparent_58%)]" aria-hidden />
      <div className="relative flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className={JOURNAL_INSIGHT_DARK_MUTED}>Batch gross value</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">INR · intent-engine</p>
          {loading && !batch ? (
            <p className={`mt-3 text-[15px] ${JOURNAL_INSIGHT_DARK_LABEL}`}>Loading batch value…</p>
          ) : (
            <>
              <p className="mt-2 text-[2.25rem] font-extrabold tabular-nums tracking-[-0.03em] text-white">{valueLabel}</p>
              <p className="mt-1 font-mono text-[13px] text-white/55">
                {selectedBatchId || 'Select a batch'} · {program}
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled || !selectedBatchId}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/25 bg-white/5 px-4 text-[14px] font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
          Export
        </button>
      </div>
    </section>
  )
}
