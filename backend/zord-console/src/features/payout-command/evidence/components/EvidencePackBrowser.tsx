'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
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
  rows: PackTableRowVm[]
  search: string
  onSearchChange: (q: string) => void
  batchId: string
  onBatchChange: (id: string) => void
  batchOptions: { batch_id: string; finality_status?: string }[]
  intelBatches: IntelligenceBatchRow[]
  intentId: string
  onIntentChange: (id: string) => void
  intentOptions: { intentId: string; paymentRef: string }[]
  tenantReady: boolean
  packsLoading: boolean
  packListError: string | null
  filteredCount: number
  totalCount: number
}

const INTENT_FILTER_ALL = ''
const INTENT_FILTER_BATCH_ONLY = '__batch_only__'
const PACKS_PER_PAGE = 10

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

function ProofStatusChip({ label }: { label: string }) {
  const ready = label === 'Proof Ready' || label === 'Verified'
  const partial = label.includes('Partial') || label.includes('Missing')
  const tone = ready
    ? 'border-emerald-300/60 bg-emerald-50 text-emerald-800'
    : partial
      ? 'border-amber-200/80 bg-amber-50/80 text-amber-900'
      : 'border-slate-200 bg-white text-slate-700'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {label}
    </span>
  )
}

function ScopeChip({ scope }: { scope: PackTableRowVm['scope'] }) {
  if (scope === 'batch') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
        Batch pack
      </span>
    )
  }
  if (scope === 'intent') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
        Intent pack
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
      Evidence
    </span>
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

function intentToPickerOption(opt: { intentId: string; paymentRef: string }): PickerOption {
  return {
    value: opt.intentId,
    label: opt.paymentRef !== '—' ? opt.paymentRef : truncateId(opt.intentId),
    hint: opt.paymentRef !== '—' ? truncateId(opt.intentId) : undefined,
    secondary: 'intent pack',
    badgeTone: 'accent',
  }
}

export function EvidencePackBrowser({
  rows,
  search,
  onSearchChange,
  batchId,
  onBatchChange,
  batchOptions,
  intelBatches,
  intentId,
  onIntentChange,
  intentOptions,
  tenantReady,
  packsLoading,
  packListError,
  filteredCount,
  totalCount,
}: EvidencePackBrowserProps) {
  const batchPickerOptions: PickerOption[] = batchOptions.map((b) =>
    batchToPickerOption(b, intelBatches.some((x) => x.batch_id === b.batch_id)),
  )

  const intentPickerOptions: PickerOption[] = [
    { value: INTENT_FILTER_ALL, label: evidenceCopy.browser.intentAll, secondary: 'all packs' },
    { value: INTENT_FILTER_BATCH_ONLY, label: evidenceCopy.browser.intentBatchOnly, secondary: 'batch-level only' },
    ...intentOptions.map(intentToPickerOption),
  ]

  const intentPickerValue = intentId || INTENT_FILTER_ALL
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(rows.length / PACKS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * PACKS_PER_PAGE
  const pageRows = useMemo(
    () => rows.slice(pageStart, pageStart + PACKS_PER_PAGE),
    [rows, pageStart],
  )

  useEffect(() => {
    setPage(1)
  }, [batchId, intentId, search])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const countLine = packsLoading ? (
    <span className="font-medium text-slate-900">Loading packs…</span>
  ) : search.trim() ? (
    <>
      Showing <span className="font-semibold text-slate-900">{filteredCount}</span> of {totalCount} packs
    </>
  ) : (
    <>
      <span className="font-semibold text-slate-900">{totalCount}</span> pack{totalCount === 1 ? '' : 's'}
      {batchId ? (
        <>
          {' '}
          · batch <span className="font-mono text-slate-900">{batchId}</span>
        </>
      ) : null}
      {intentId && intentId !== INTENT_FILTER_BATCH_ONLY ? (
        <>
          {' '}
          · intent <span className="font-mono text-slate-900">{truncateId(intentId)}</span>
        </>
      ) : intentId === INTENT_FILTER_BATCH_ONLY ? (
        <> · batch-level only</>
      ) : null}
      {rows.length > 0 ? (
        <>
          {' '}
          · showing {pageStart + 1}-{Math.min(pageStart + PACKS_PER_PAGE, rows.length)}
        </>
      ) : null}
    </>
  )

  return (
    <section className={`${EVIDENCE_CARD} ${JOURNAL_DM_SANS}`}>
      <EvidenceSectionHeader
        title={evidenceCopy.browser.title}
        subtitle={evidenceCopy.browser.subtitle}
        live={!packsLoading && totalCount > 0}
      />
      <div className="border-b border-slate-100/90 px-5 pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[12.5px] tabular-nums text-slate-500">
              {countLine}
            </p>
            {packListError ? <p className="mt-2 text-[13px] font-medium text-amber-800">{packListError}</p> : null}
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 lg:max-w-[30rem]">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
              <SearchablePicker
                id="evidence-intent-picker"
                label={evidenceCopy.browser.intentLabel}
                value={intentPickerValue}
                onChange={onIntentChange}
                options={intentPickerOptions}
                placeholder={evidenceCopy.browser.intentAll}
                emptyState="No intent packs in this batch"
                searchPlaceholder="Search intent or payment ref…"
                recentStorageKey="zord:evidence:recent-intents"
                disabled={!tenantReady || !batchId}
              />
            </div>
            <div className="relative w-full">
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={evidenceCopy.browser.searchPlaceholder}
                className="h-10 w-full rounded-[0.75rem] border border-slate-200 bg-white pl-9 pr-3 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400/70 focus:ring-2 focus:ring-slate-300/45"
              />
              <Glyph name="search" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            </div>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-separate border-spacing-0 text-left text-[14px]">
          <thead>
            <tr className="bg-slate-50/70 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              <th className="border-b border-slate-200/80 px-5 py-3">Evidence Pack</th>
              <th className="border-b border-slate-200/80 px-4 py-3">Intent</th>
              <th className="border-b border-slate-200/80 px-4 py-3">Proof Root</th>
              <th className="border-b border-slate-200/80 px-4 py-3 text-right">Score</th>
              <th className="border-b border-slate-200/80 px-4 py-3 text-right">Leaves</th>
              <th className="border-b border-slate-200/80 px-4 py-3">Status</th>
              <th className="border-b border-slate-200/80 px-4 py-3 text-right">Generated</th>
              <th className="border-b border-slate-200/80 px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {packsLoading && pageRows.length === 0
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`loading-${i}`} className="align-top">
                    <td colSpan={8} className="px-5 py-3">
                      <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
                    </td>
                  </tr>
                ))
              : null}
            {pageRows.map((row) => {
              const merkleShort = shortHash(row.proofRoot)
              const href = `/payout-command-view/evidence-pack/${encodeURIComponent(row.packId)}?tab=graph${batchId ? `&batch_id=${encodeURIComponent(batchId)}` : ''}`
              return (
                <tr key={row.packId} className="group align-top transition-colors hover:bg-[#e8eef5]/40">
                  <td className="px-5 py-4">
                    <p className="font-mono text-[13px] font-semibold text-slate-900">{row.packId}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <ScopeChip scope={row.scope} />
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {row.modeLabel}
                      </span>
                    </div>
                    {row.contractId !== '—' ? (
                      <p className="mt-1.5 font-mono text-[11.5px] text-slate-500">
                        contract {truncateId(row.contractId)}
                      </p>
                    ) : null}
                  </td>
                  <td className="max-w-[10rem] px-4 py-4">
                    <p className="font-mono text-[13px] font-semibold text-slate-900" title={row.intentId}>
                      {truncateId(row.intentId)}
                    </p>
                  </td>
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
                    <span className="text-[14px] font-semibold text-slate-900">
                      {row.proofScore ?? '—'}
                    </span>
                    {row.proofScore != null ? <span className="text-[11px] text-slate-500">/100</span> : null}
                    {row.proofScoreIsEstimate ? (
                      <span className="mt-0.5 block text-[10.5px] text-slate-400">batch est.</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums text-[13px] text-slate-700">
                    {row.itemCount ?? '—'}/{row.totalItems}
                  </td>
                  <td className="px-4 py-4">
                    <ProofStatusChip label={row.proofStatus} />
                  </td>
                  <td className="px-4 py-4 text-right text-[13px] tabular-nums text-slate-600">
                    {formatIsoDate(row.generatedAt)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={href}
                      className="inline-flex items-center gap-1.5 rounded-[0.65rem] border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-900 transition group-hover:border-slate-900 group-hover:bg-slate-900 group-hover:text-white"
                    >
                      View graph
                      <Glyph name="arrow-up-right" className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              )
            })}
            {!packsLoading && pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-14 text-center">
                  <p className="text-[15px] font-semibold text-slate-900">{evidenceCopy.empty.noPack}</p>
                  <p className="mt-2 text-[13.5px] text-slate-500">{evidenceCopy.empty.noPackHint}</p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {rows.length > 0 ? (
        <div className="flex items-center justify-between border-t border-slate-100/90 px-5 py-3 text-[13px] text-slate-600">
          <p>
            Page <span className="font-semibold text-slate-900">{safePage}</span> of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1 || packsLoading}
              className="inline-flex h-8 items-center rounded-[0.6rem] border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages || packsLoading}
              className="inline-flex h-8 items-center rounded-[0.6rem] border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
