'use client'

import type { BatchDetailResponse } from '@/services/payout-command/prod-api/intelligenceTypes'
import {
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import {
  BATCH_FILTERS,
  JOURNAL_BORDER,
  JOURNAL_PANEL_BG,
  batchQualityScore,
  confidencePctFromBatch,
  formatInrRupees,
  resolveBatchHealthStatus,
  statusTone,
  usdCompact,
  type BatchFilter,
  type BatchRecord,
  type SidebarMode,
} from '../intentJournalSidebarUtils'

export type IntentJournalBatchSidebarProps = {
  batches: BatchRecord[]
  sourceCount: number
  sidebarMode: SidebarMode
  setSidebarMode: (mode: SidebarMode) => void
  batchFilter: BatchFilter
  setBatchFilter: (filter: BatchFilter) => void
  setSidebarPage: (updater: (page: number) => number) => void
  journalUsesBackendFeed: boolean
  sidebarPageRows: BatchRecord[]
  selectedBatchId: string
  selectBatch: (batchId: string) => void
  liveBatchDetail: BatchDetailResponse | null
  selectedDlqTotal: number
  selectedEngineIntentTotal: number
  safeSidebarPage: number
  sidebarTotalPages: number
  needsAttentionCount: number
}

export function IntentJournalBatchSidebar({
  batches,
  sourceCount,
  sidebarMode,
  setSidebarMode,
  batchFilter,
  setBatchFilter,
  setSidebarPage,
  journalUsesBackendFeed,
  sidebarPageRows,
  selectedBatchId,
  selectBatch,
  liveBatchDetail,
  selectedDlqTotal,
  selectedEngineIntentTotal,
  safeSidebarPage,
  sidebarTotalPages,
  needsAttentionCount,
}: IntentJournalBatchSidebarProps) {
  return (
        <aside className={`flex h-full flex-col overflow-hidden border-r ${JOURNAL_BORDER} bg-white`}>
          <div className="border-b border-[#E5E5E5] px-4 pb-3 pt-4">
            <h2 className={`text-[14px] font-medium ${HOME_TITLE_BLACK}`}>Batches</h2>
            <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>
              {batches.length} listed · {sourceCount} sources
            </p>
            <div className={`mt-3 rounded-[10px] border ${JOURNAL_BORDER} ${JOURNAL_PANEL_BG} p-1`}>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setSidebarMode('listed')}
                  className={`rounded-[8px] px-3 py-1.5 text-[15px] font-medium transition ${sidebarMode === 'listed' ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#64748b] hover:text-[#0f172a]'}`}
                >
                  Listed <span className="ml-1 text-[#94a3b8]">{batches.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarMode('sectors')}
                  className={`rounded-[8px] px-3 py-1.5 text-[15px] font-medium transition ${sidebarMode === 'sectors' ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#64748b] hover:text-[#0f172a]'}`}
                >
                  Sectors <span className="ml-1 text-[#94a3b8]">{sourceCount}</span>
                </button>
              </div>
            </div>
            <div className="mt-3">
              <select
                value={batchFilter}
                onChange={(e) => {
                  setBatchFilter(e.target.value as BatchFilter)
                  setSidebarPage(() => 1)
                }}
                className="w-full rounded-[8px] border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-[15px] text-[#0f172a] shadow-sm"
              >
                {BATCH_FILTERS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {journalUsesBackendFeed && sidebarPageRows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#E5E5E5] bg-slate-50 px-3 py-4 text-center text-[15px] leading-relaxed text-[#94a3b8]">
                No batches yet for this tenant. After ingest, batches load from{' '}
                <span className="font-mono text-[13px] text-[#64748b]">GET /api/prod/intents/batch-ids</span>
                ; if empty, the UI may fall back to intelligence batch list when available.
              </p>
            ) : null}
            {sidebarPageRows.map((batch) => {
              const selected = batch.batchId === selectedBatchId
              const score = batchQualityScore(batch)
              const detailRow =
                journalUsesBackendFeed && selected && liveBatchDetail?.batch?.batch_id === batch.batchId
                  ? liveBatchDetail.batch
                  : null
              const liveSuccess =
                journalUsesBackendFeed
                  ? (detailRow?.success_count ?? batch.intelligenceCounts?.success_count ?? batch.confirmedCount ?? 0)
                  : null
              const liveTotalRaw = journalUsesBackendFeed
                ? (detailRow?.total_count ?? batch.transactions ?? 0)
                : batch.transactions
              const liveTotal = Math.max(liveTotalRaw, 0)
              const liveFinality = detailRow?.finality_status ?? batch.intelligenceCounts?.finality_status
              const dlqCount = selected
                ? selectedDlqTotal
                : batch.engineSidebar && batch.transactions > 0 && batch.confirmedCount === 0
                  ? batch.transactions
                  : batch.unresolvedCount + batch.mismatchCount
              const intentCount = selected
                ? selectedEngineIntentTotal
                : batch.engineSidebar
                  ? batch.confirmedCount
                  : batch.transactions
              const engineConfPct = confidencePctFromBatch(batch)
              const status = resolveBatchHealthStatus(batch, {
                dlqCount,
                intentCount,
                finality: liveFinality,
              })
              const sidebarScoreDisplay =
                engineConfPct != null
                  ? `${engineConfPct}%`
                  : status === 'Critical' || status === 'Risk'
                    ? status
                    : journalUsesBackendFeed && liveSuccess !== null
                      ? liveSuccess.toLocaleString('en-US')
                      : String(score)
              const progressWidthPct =
                engineConfPct != null
                  ? engineConfPct
                  : status === 'Critical'
                    ? Math.min(100, dlqCount > 0 ? 100 : 15)
                    : status === 'Risk'
                      ? 45
                      : journalUsesBackendFeed && liveSuccess !== null
                        ? liveTotal === 0
                          ? 0
                          : Math.min(100, Math.round((liveSuccess / liveTotal) * 100))
                        : score
              const tone = statusTone(status)
              const dotColor =
                status === 'Strong' || status === 'Stable'
                  ? 'bg-emerald-500'
                  : status === 'Risk'
                    ? 'bg-amber-500'
                    : 'bg-rose-500'

              const liveMoneyLine =
                journalUsesBackendFeed &&
                selected &&
                liveBatchDetail?.batch_health &&
                liveBatchDetail.batch?.batch_id === batch.batchId
                  ? formatInrRupees(Number(liveBatchDetail.batch_health.total_confirmed_amount_minor))
                  : null

              return (
                <button
                  key={batch.batchId}
                  type="button"
                  onClick={() => selectBatch(batch.batchId)}
                  className={`mb-1.5 w-full rounded-[10px] border px-3 py-2 text-left transition ${
                    selected
                      ? 'border-[#111111] bg-slate-100'
                      : 'border-transparent hover:border-[#E5E5E5] hover:bg-slate-50'
                  }`}
                >
                  {/* Line 1: status dot + batch ID + success count (live) or quality score (sandbox) */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} aria-hidden />
                      <span className={`truncate text-[14px] font-medium ${HOME_TITLE_BLACK}`}>{batch.batchId}</span>
                    </div>
                    <span
                      className={`shrink-0 text-[15px] font-semibold tabular-nums ${tone.text}`}
                      title={
                        engineConfPct != null
                          ? 'Avg aggregate confidence from intent-engine sidebar (0–1 API → percent)'
                          : journalUsesBackendFeed
                            ? batch.intelligenceCounts
                              ? 'success_count from intelligence batch (detail when selected)'
                              : batch.engineSidebar
                                ? 'Confirmed-style count from intent-engine batch aggregates (sidebar)'
                                : 'Batch quality score'
                            : 'Batch quality score'
                      }
                    >
                      {sidebarScoreDisplay}
                    </span>
                  </div>

                  {/* Line 2: type · value · intent count (live: INR when batch_health loaded for selection) */}
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-4 text-[14px] text-[#64748b]">
                    <span>{batch.type}</span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">
                      {liveMoneyLine ??
                        (batch.engineSidebar && batch.totalValue > 0
                          ? formatInrRupees(batch.totalValue)
                          : batch.totalValue > 0
                            ? usdCompact(batch.totalValue)
                            : journalUsesBackendFeed
                              ? '—'
                              : usdCompact(0))}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">
                      {(journalUsesBackendFeed ? liveTotalRaw : batch.transactions).toLocaleString('en-US')} intents
                    </span>
                  </div>
                  {journalUsesBackendFeed && liveFinality ? (
                    <p className="mt-0.5 pl-4 text-[13px] font-medium uppercase tracking-wide text-slate-500">
                      {String(liveFinality).replace(/_/g, ' ')}
                    </p>
                  ) : null}

                  {/* Selected = expanded score-bar + status pill */}
                  {selected ? (
                    <div className="mt-2 space-y-1.5 pl-4">
                      <div className="h-1 w-full overflow-hidden rounded-full bg-[#E5E5E5]">
                        <div
                          className={`h-full rounded-full ${
                            status === 'Strong' || status === 'Stable'
                              ? 'bg-emerald-500'
                              : status === 'Risk'
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                          }`}
                          style={{ width: `${progressWidthPct}%` }}
                        />
                      </div>
                      <div className={`inline-flex items-center rounded-full px-2 py-0.5 text-[13px] font-semibold ${tone.text} ${
                        status === 'Risk'
                          ? 'bg-amber-100'
                          : status === 'Critical'
                            ? 'bg-rose-100'
                            : 'bg-emerald-100'
                      }`}>
                        {status}
                      </div>
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
          <div className="border-t border-[#E5E5E5] bg-slate-50 px-3 py-2 text-[15px] text-[#64748b]">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSidebarPage((p) => Math.max(1, p - 1))}
                disabled={safeSidebarPage <= 1}
                className="rounded-md border border-[#E5E5E5] bg-white px-2 py-1 text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>
              <span className="tabular-nums">
                {safeSidebarPage} / {sidebarTotalPages}
              </span>
              <button
                type="button"
                onClick={() => setSidebarPage((p) => Math.min(sidebarTotalPages, p + 1))}
                disabled={safeSidebarPage >= sidebarTotalPages}
                className="rounded-md border border-[#E5E5E5] bg-white px-2 py-1 text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
            <p className="mt-1 text-center text-[14px]">
              {batches.length} active · {needsAttentionCount} need attention
            </p>
          </div>
        </aside>
  )
}
