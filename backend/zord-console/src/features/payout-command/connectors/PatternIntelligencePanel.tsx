'use client'

import { Fragment, useState } from 'react'
import { COMMAND_CENTER_KPI_CARD, COMMAND_CENTER_LABEL_GREEN } from '@/features/payout-command/command-center/homeCommandCenterTokens'
import { CommandCenterCardGlow } from '@/features/payout-command/command-center/CommandCenterCardGlow'
import type { PatternIntelligenceView } from '@/services/payout-command/prod-api/intelligencePatternTypes'

type Props = {
  view: PatternIntelligenceView
}

function badgeTone(value: string): string {
  const normalized = value.toUpperCase()
  if (normalized.includes('CRITICAL') || normalized.includes('HIGH') || normalized.includes('RISK')) {
    return 'border-rose-200 bg-rose-50 text-rose-800'
  }
  if (normalized.includes('MEDIUM') || normalized.includes('PARTIAL') || normalized.includes('REVIEW')) {
    return 'border-amber-200 bg-amber-50 text-amber-800'
  }
  return 'border-emerald-200 bg-emerald-50 text-emerald-800'
}

function KpiStrip({ title, buckets, testId }: { title: string; buckets: Array<{ label: string; value: string; sub: string }>; testId: string }) {
  return (
    <section className={COMMAND_CENTER_KPI_CARD} data-testid={testId}>
      <CommandCenterCardGlow />
      <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>{title}</p>
      <div className="relative mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {buckets.map((bucket) => (
          <div key={bucket.label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{bucket.label}</p>
            <p className="mt-1 text-[18px] font-bold tabular-nums text-slate-900">{bucket.value}</p>
            <p className="mt-0.5 text-[12px] text-slate-600">{bucket.sub}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export function PatternIntelligencePanel({ view }: Props) {
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)

  return (
    <div className="space-y-4" data-testid="pattern-intelligence-panel">
      <section className="rounded-xl border border-slate-200 bg-white px-4 py-3" data-testid="pattern-meta-strip">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-slate-700">
          <span><strong className="text-slate-900">Tenant</strong> {view.meta.tenantId}</span>
          <span><strong className="text-slate-900">Snapshot</strong> {view.meta.snapshotType} · {view.meta.snapshotId}</span>
          <span><strong className="text-slate-900">Scope</strong> {view.meta.scopeType} {view.meta.scopeRef !== '—' ? `· ${view.meta.scopeRef}` : ''}</span>
          <span><strong className="text-slate-900">Window</strong> {view.meta.windowStart} → {view.meta.windowEnd}</span>
          <span><strong className="text-slate-900">Computed</strong> {view.meta.computedAt}</span>
          <span><strong className="text-slate-900">Model</strong> {view.meta.modelVersion}</span>
        </div>
      </section>

      <section className="flex flex-wrap gap-2" data-testid="pattern-status-row">
        <span className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${badgeTone(view.statusBadges.riskTier)}`}>
          Risk {view.statusBadges.riskTier}
        </span>
        <span className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${badgeTone(view.statusBadges.anomalyLevel)}`}>
          Anomaly {view.statusBadges.anomalyLevel}
        </span>
        <span className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${badgeTone(view.statusBadges.finalityStatus)}`}>
          Finality {view.statusBadges.finalityStatus}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-semibold text-slate-700">
          Batch {view.statusBadges.batchId}
        </span>
        {view.statusBadges.prepareAndSignRecommended ? (
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[12px] font-semibold text-indigo-800">
            Prepare & sign recommended
          </span>
        ) : null}
      </section>

      <KpiStrip title="Pattern scores" buckets={view.scoreKpis} testId="pattern-score-kpis" />
      <KpiStrip title="Batch volume" buckets={view.volumeKpis} testId="pattern-volume-kpis" />
      <KpiStrip title="Ambiguity summary" buckets={view.ambiguitySummary} testId="pattern-ambiguity-summary" />

      {(view.riskSignals.length > 0 || view.recommendedAction) ? (
        <section className={COMMAND_CENTER_KPI_CARD} data-testid="pattern-risk-signals">
          <CommandCenterCardGlow />
          <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Risk signals & recommended action</p>
          {view.recommendedAction ? (
            <p className="relative mt-3 inline-flex rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-[13px] font-semibold text-white">
              {view.recommendedAction}
            </p>
          ) : null}
          {view.riskSignals.length > 0 ? (
            <ul className="relative mt-3 space-y-2 text-[14px] text-slate-800">
              {view.riskSignals.map((signal, index) => (
                <li key={`${signal.signal ?? 'signal'}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="font-semibold text-slate-900">{signal.signal ?? 'Signal'}</span>
                  {' · '}
                  {signal.severity ?? 'INFO'} · value {signal.value ?? '—'} / threshold {signal.threshold ?? '—'}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {view.actionCatalog.length > 0 ? (
        <section className={COMMAND_CENTER_KPI_CARD} data-testid="pattern-action-catalog">
          <CommandCenterCardGlow />
          <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Pattern action catalog</p>
          <div className="relative mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {view.actionCatalog.map((card) => (
              <article key={card.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{card.code.replace(/_/g, ' ')}</p>
                <p className="mt-1 text-[14px] font-semibold text-slate-900">{card.title}</p>
                <p className="mt-1 text-[13px] text-slate-700">{card.impactLabel}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {view.categories.length > 0 ? (
        <section className={COMMAND_CENTER_KPI_CARD} data-testid="pattern-category-tables">
          <CommandCenterCardGlow />
          <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Pattern categories</p>
          <div className="relative mt-4 space-y-5">
            {view.categories.map((table) => (
              <div key={table.id}>
                <p className="mb-2 text-[14px] font-semibold text-slate-900">{table.title}</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                        {table.columns.map((col) => (
                          <th key={col.key} className="px-3 py-2">{col.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, rowIndex) => (
                        <tr key={`${table.id}-${rowIndex}`} className="border-b border-slate-100">
                          {table.columns.map((col) => (
                            <td key={col.key} className="px-3 py-2 text-slate-800">{row[col.key] ?? '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {view.history.length > 0 ? (
        <section className={COMMAND_CENTER_KPI_CARD} data-testid="pattern-history-table">
          <CommandCenterCardGlow />
          <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Snapshot history</p>
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Scope</th>
                  <th className="px-3 py-2">Batch</th>
                  <th className="px-3 py-2">Risk</th>
                  <th className="px-3 py-2">Anomaly</th>
                  <th className="px-3 py-2">Drilldown</th>
                </tr>
              </thead>
              <tbody>
                {view.history.map((row) => (
                  <Fragment key={row.id}>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-800">{row.createdAt || '—'}</td>
                      <td className="px-3 py-2 text-slate-800">{row.scopeType} {row.scopeRef !== '—' ? `· ${row.scopeRef}` : ''}</td>
                      <td className="px-3 py-2 text-slate-800">{row.batchId}</td>
                      <td className="px-3 py-2 text-slate-800">{row.riskTier}</td>
                      <td className="px-3 py-2 text-slate-800">{row.anomalyLevel}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 px-2 py-1 text-[12px] font-semibold text-slate-700"
                          onClick={() => setExpandedHistoryId(expandedHistoryId === row.id ? null : row.id)}
                        >
                          {expandedHistoryId === row.id ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                    {expandedHistoryId === row.id && row.snapshot ? (
                      <tr>
                        <td colSpan={6} className="bg-slate-50 px-3 py-3 text-[12px] text-slate-700">
                          <pre className="overflow-x-auto whitespace-pre-wrap font-mono">{JSON.stringify(row.snapshot, null, 2)}</pre>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
