'use client'

import Link from 'next/link'
import { Glyph } from '../../shared'
import { JOURNAL_DM_SANS } from '../../journal/journalFonts'
import { evidenceCopy } from '../copy/evidenceCopy'
import { EVIDENCE_CARD } from '../evidencePageTokens'
import { EvidenceSectionHeader } from './EvidenceSectionHeader'
import type { PackTableRowVm } from '../types/evidenceViewModels'
import { formatIsoDate, shortHash } from '../utils/evidenceFormat'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { SearchablePicker, type PickerOption } from './SearchablePicker'

type EvidencePackBrowserProps = {
  batchRow: PackTableRowVm | null
  intentPackCount: number
  batchId: string
  onBatchChange: (id: string) => void
  batchOptions: { batch_id: string; finality_status?: string }[]
  intelBatches: IntelligenceBatchRow[]
  tenantReady: boolean
  packsLoading: boolean
  packListError: string | null
}

function CopyProofRootButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      title="Copy proof root"
      onClick={() => void navigator.clipboard?.writeText(text)}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-slate-200 bg-white text-slate-500 transition hover:border-emerald-300/60 hover:text-slate-900"
    >
      <Glyph name="copy" className="h-3.5 w-3.5" />
    </button>
  )
}

function truncateId(id: string, head = 8): string {
  const v = id.trim()
  if (!v || v === '—') return '—'
  if (v.length <= head + 4) return v
  return `${v.slice(0, head)}…`
}

function batchToPickerOption(
  b: { batch_id: string; finality_status?: string },
  inIntel: boolean,
): PickerOption {
  const status = b.finality_status ?? (inIntel ? 'intel' : 'journal')
  const upper = status.toUpperCase()
  let tone: PickerOption['badgeTone'] = 'neutral'
  if (upper.includes('SETTLED') || upper.includes('FINAL')) tone = 'success'
  else if (upper.includes('PEND') || upper.includes('PROC')) tone = 'warn'
  else if (inIntel) tone = 'accent'
  return {
    value: b.batch_id,
    label: b.batch_id,
    secondary: status,
    badgeTone: tone,
  }
}

export function EvidencePackBrowser({
  batchRow,
  intentPackCount,
  batchId,
  onBatchChange,
  batchOptions,
  intelBatches,
  tenantReady,
  packsLoading,
  packListError,
}: EvidencePackBrowserProps) {
  const batchPickerOptions: PickerOption[] = batchOptions.map((b) =>
    batchToPickerOption(b, intelBatches.some((x) => x.batch_id === b.batch_id)),
  )

  const countLine = packsLoading ? (
    <span className="font-medium text-slate-900">Loading batch proof…</span>
  ) : batchRow ? (
    <>
      <span className="font-semibold text-slate-900">1</span> {evidenceCopy.browser.batchProofCount}
      {intentPackCount > 0 ? (
        <>
          {' '}
          · <span className="font-semibold text-slate-900">{intentPackCount}</span>{' '}
          {evidenceCopy.browser.intentProofCount}
        </>
      ) : null}
      {batchId ? (
        <>
          {' '}
          · batch <span className="font-mono text-slate-900">{batchId}</span>
        </>
      ) : null}
    </>
  ) : (
    <>No batch proof for this batch</>
  )

  return (
    <section className={`${EVIDENCE_CARD} ${JOURNAL_DM_SANS}`}>
      <EvidenceSectionHeader
        title={evidenceCopy.browser.title}
        subtitle={evidenceCopy.browser.subtitle}
        live={!packsLoading && Boolean(batchRow)}
      />
      <div className="border-b border-slate-100/90 px-5 pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[12.5px] tabular-nums text-slate-500">{countLine}</p>
            {packListError ? <p className="mt-2 text-[13px] font-medium text-amber-800">{packListError}</p> : null}
          </div>
          <div className="w-full shrink-0 lg:max-w-[18rem]">
            <SearchablePicker
              id="evidence-batch-picker"
              label={evidenceCopy.browser.batchLabel}
              value={batchId}
              onChange={onBatchChange}
              options={batchPickerOptions}
              placeholder={!tenantReady ? 'Sign in (tenant)' : 'Select batch'}
              emptyState="No batches — ingest intents first"
              searchPlaceholder="Search batch id…"
              recentStorageKey="zord:evidence:recent-batches"
              disabled={!tenantReady}
              fallbackLabelForUnknownValue={(v) => v}
            />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-separate border-spacing-0 text-left text-[14px]">
          <thead>
            <tr className="bg-slate-50/70 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              <th className="border-b border-slate-200/80 px-5 py-3">Evidence Pack</th>
              <th className="border-b border-slate-200/80 px-4 py-3">Scope</th>
              <th className="border-b border-slate-200/80 px-4 py-3">Proof Root</th>
              <th className="border-b border-slate-200/80 px-4 py-3 text-right">Score</th>
              <th className="border-b border-slate-200/80 px-4 py-3 text-right">Leaves</th>
              <th className="border-b border-slate-200/80 px-4 py-3 text-right">Generated</th>
              <th className="border-b border-slate-200/80 px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {packsLoading && !batchRow
              ? Array.from({ length: 1 }).map((_, i) => (
                  <tr key={`loading-${i}`} className="align-top">
                    <td colSpan={7} className="px-5 py-3">
                      <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
                    </td>
                  </tr>
                ))
              : null}
            {batchRow ? (
              (() => {
                const row = batchRow
                const merkleShort = shortHash(row.proofRoot)
                const href = `/payout-command-view/evidence-pack/${encodeURIComponent(row.packId)}?tab=graph${batchId ? `&batch_id=${encodeURIComponent(batchId)}` : ''}`
                return (
                  <tr key={row.packId} className="group align-top bg-sky-50/40 transition-colors hover:bg-sky-50/70">
                    <td className="px-5 py-4">
                      <p className="font-mono text-[13px] font-semibold text-slate-900">{row.packId}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                          Batch proof
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {row.modeLabel}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-[13px] font-semibold text-slate-700">Batch-wide</td>
                    <td className="min-w-[12rem] px-4 py-4">
                      <div className="rounded-[0.75rem] border border-slate-200 bg-slate-50/60 p-2.5">
                        <div className="flex items-center gap-2">
                          <code className="min-w-0 flex-1 truncate font-mono text-[11.5px]" title={row.proofRoot}>
                            {merkleShort}
                          </code>
                          <CopyProofRootButton text={row.proofRoot} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums">
                      <span className="text-[14px] font-semibold text-slate-900">{row.proofScore ?? '—'}</span>
                      {row.proofScore != null ? <span className="text-[11px] text-slate-500">/100</span> : null}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums text-[13px] text-slate-700">
                      {row.itemCount ?? '—'}/{row.totalItems}
                    </td>
                    <td className="px-4 py-4 text-right text-[13px] tabular-nums text-slate-600">
                      {formatIsoDate(row.generatedAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={href}
                        className="inline-flex items-center gap-1.5 rounded-[0.65rem] border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-900 transition group-hover:border-slate-900 group-hover:bg-slate-900 group-hover:text-white"
                      >
                        {evidenceCopy.browser.viewBatchProof}
                        <Glyph name="arrow-up-right" className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })()
            ) : null}
            {!packsLoading && !batchRow ? (
              <tr>
                <td colSpan={7} className="px-5 py-14 text-center">
                  <p className="text-[15px] font-semibold text-slate-900">{evidenceCopy.empty.noPack}</p>
                  <p className="mt-2 text-[13.5px] text-slate-500">{evidenceCopy.empty.noPackHint}</p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
