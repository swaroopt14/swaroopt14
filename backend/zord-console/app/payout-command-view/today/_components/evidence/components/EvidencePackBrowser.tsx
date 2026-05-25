'use client'

import Link from 'next/link'
import { Glyph } from '../../shared'
import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { evidenceCopy } from '../copy/evidenceCopy'
import type { PackTableRowVm } from '../types/evidenceViewModels'
import { formatIsoDate, shortHash, EVIDENCE_ASK } from '../utils/evidenceFormat'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'

type EvidencePackBrowserProps = {
  rows: PackTableRowVm[]
  search: string
  onSearchChange: (q: string) => void
  batchId: string
  onBatchChange: (id: string) => void
  batchOptions: { batch_id: string; finality_status?: string }[]
  intelBatches: IntelligenceBatchRow[]
  tenantReady: boolean
  packsLoading: boolean
  packListError: string | null
  filteredCount: number
  totalCount: number
}

function CopyProofRootButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      title="Copy proof root"
      onClick={() => void navigator.clipboard?.writeText(text)}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border ${EVIDENCE_ASK.border} bg-white text-[#6f716d] transition hover:border-[#4ADE80]/30 hover:text-[#111111]`}
    >
      <Glyph name="copy" className="h-3.5 w-3.5" />
    </button>
  )
}

function ProofStatusChip({ label }: { label: string }) {
  const ready = label === 'Proof Ready' || label === 'Verified'
  const partial = label.includes('Partial') || label.includes('Missing')
  const tone = ready
    ? 'border-[#4ADE80]/40 bg-[#f0fdf4] text-[#166534]'
    : partial
      ? 'border-amber-200/80 bg-amber-50/80 text-amber-900'
      : `border ${EVIDENCE_ASK.border} bg-white text-[#475569]`
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-semibold ${tone}`}>
      {label}
    </span>
  )
}

export function EvidencePackBrowser({
  rows,
  search,
  onSearchChange,
  batchId,
  onBatchChange,
  batchOptions,
  intelBatches,
  tenantReady,
  packsLoading,
  packListError,
  filteredCount,
  totalCount,
}: EvidencePackBrowserProps) {
  return (
    <section className={COMMAND_CENTER_KPI_CARD}>
      <CommandCenterCardGlow />
      <div className="relative border-b border-slate-100 px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className={`text-[17px] font-semibold ${HOME_TITLE_BLACK}`}>{evidenceCopy.browser.title}</p>
            <p className={`mt-0.5 max-w-xl ${HOME_BODY_IMPERIAL_SM}`}>{evidenceCopy.browser.subtitle}</p>
            <p className="mt-2 text-[13px] tabular-nums text-[#8a8a86]">
              {packsLoading ? (
                <span className="font-medium text-[#111111]">Loading packs…</span>
              ) : search.trim() ? (
                <>
                  Showing <span className="font-semibold text-[#111111]">{filteredCount}</span> of {totalCount} packs
                </>
              ) : (
                <>
                  <span className="font-semibold text-[#111111]">{totalCount}</span> packs for batch{' '}
                  <span className="font-mono text-[#111111]">{batchId || '—'}</span>
                </>
              )}
            </p>
            {packListError ? <p className="mt-2 text-[13px] font-medium text-amber-800">{packListError}</p> : null}
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 lg:max-w-[24rem] lg:items-end">
            <label
              className={`flex w-full flex-col gap-1 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a8a86] lg:items-end`}
            >
              {evidenceCopy.browser.batchLabel}
              <select
                value={batchId}
                disabled={!tenantReady || (!batchId && batchOptions.length === 0)}
                onChange={(e) => onBatchChange(e.target.value)}
                className={`h-10 w-full rounded-[0.85rem] border ${EVIDENCE_ASK.border} ${EVIDENCE_ASK.field} px-3 font-mono text-[14px] font-semibold text-[#111111] outline-none lg:max-w-[20rem]`}
              >
                {!tenantReady ? (
                  <option value="">Sign in (tenant)</option>
                ) : batchOptions.length === 0 ? (
                  <option value="">No batch — ingest intelligence or evidence</option>
                ) : (
                  batchOptions.map((b) => {
                    const inIntel = intelBatches.some((x) => x.batch_id === b.batch_id)
                    return (
                      <option key={b.batch_id} value={b.batch_id}>
                        {b.batch_id}
                        {inIntel ? ` · ${b.finality_status ?? 'intel'}` : ' · evidence only'}
                      </option>
                    )
                  })
                )}
              </select>
            </label>
            <div className="relative w-full">
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={evidenceCopy.browser.searchPlaceholder}
                className={`h-10 w-full rounded-[0.85rem] border ${EVIDENCE_ASK.border} ${EVIDENCE_ASK.field} pl-9 pr-3 text-[15px] text-[#111111] outline-none transition placeholder:text-[#8a8a86] focus:border-[#4ADE80]/40 focus:bg-white focus:shadow-[0_0_0_3px_rgba(74,222,128,0.12)]`}
              />
              <Glyph name="search" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#8a8a86]" />
            </div>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[960px] w-full border-separate border-spacing-0 text-left text-[15px]">
          <thead>
            <tr className={`border-b ${EVIDENCE_ASK.border} bg-[#fcfcfa] text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a8a86]`}>
              <th className="border-b px-5 py-3.5">Evidence Pack</th>
              <th className="border-b px-4 py-3.5">Payment Ref / Intent</th>
              <th className="border-b px-4 py-3.5">Proof Root</th>
              <th className="border-b px-4 py-3.5 text-right">Proof Score</th>
              <th className="border-b px-4 py-3.5 text-right">Proof Items</th>
              <th className="border-b px-4 py-3.5">Proof Status</th>
              <th className="border-b px-4 py-3.5 text-right">Generated At</th>
              <th className="border-b px-5 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E5E5]">
            {rows.map((row) => {
              const merkleShort = shortHash(row.proofRoot)
              const href = `/payout-command-view/evidence-pack/${encodeURIComponent(row.packId)}?tab=summary${batchId ? `&batch_id=${encodeURIComponent(batchId)}` : ''}`
              return (
                <tr key={row.packId} className="group align-top transition-colors hover:bg-[#fcfcfa]">
                  <td className="px-5 py-4">
                    <p className="font-mono text-[14px] font-semibold text-[#111111]">{row.packId}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <ProofStatusChip label={row.proofStatus} />
                      <span className={`rounded-full border ${EVIDENCE_ASK.border} px-2 py-0.5 text-[11px] font-medium text-[#475569]`}>
                        Mode: {row.modeLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-[#6f716d]">
                      Proof score: {row.proofScore ?? '—'}
                      {row.proofScore != null ? '/100' : ''}
                      {row.proofScoreIsEstimate ? ' (batch estimate)' : ''} · Proof items:{' '}
                      {row.itemCount ?? '—'}/{row.totalItems}
                    </p>
                  </td>
                  <td className="max-w-[14rem] px-4 py-4">
                    <p className="font-mono text-[13px] font-semibold text-[#111111]">{row.intentId}</p>
                    <p className="mt-1 text-[13px] text-[#6f716d]">{row.summaryLine}</p>
                  </td>
                  <td className="min-w-[12rem] px-4 py-4">
                    <div className={`rounded-[0.95rem] border ${EVIDENCE_ASK.border} ${EVIDENCE_ASK.inset} p-3`}>
                      <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate font-mono text-[12px]" title={row.proofRoot}>
                          {merkleShort}
                        </code>
                        <CopyProofRootButton text={row.proofRoot} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums font-semibold">{row.proofScore ?? '—'}</td>
                  <td className="px-4 py-4 text-right tabular-nums">
                    {row.itemCount ?? '—'}/{row.totalItems}
                  </td>
                  <td className="px-4 py-4">
                    <ProofStatusChip label={row.proofStatus} />
                  </td>
                  <td className="px-4 py-4 text-right text-[14px] tabular-nums">{formatIsoDate(row.generatedAt)}</td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={href}
                      className={`inline-flex items-center gap-1.5 rounded-[0.85rem] border ${EVIDENCE_ASK.border} ${EVIDENCE_ASK.field} px-3 py-2 text-[14px] font-semibold text-[#111111] transition group-hover:border-[#111111]/20 group-hover:bg-[#111111] group-hover:text-white`}
                    >
                      Open
                      <Glyph name="arrow-up-right" className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-14 text-center">
                  <p className="text-[16px] font-semibold text-[#111111]">{evidenceCopy.empty.noPack}</p>
                  <p className="mt-2 text-[15px] text-[#6f716d]">{evidenceCopy.empty.noPackHint}</p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
