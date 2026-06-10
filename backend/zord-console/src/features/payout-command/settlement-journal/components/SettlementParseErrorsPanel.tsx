'use client'

import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import type { SettlementParseErrorRow } from '@/services/payout-command/prod-api/settlementObservations'

type SettlementParseErrorsPanelProps = {
  rows: SettlementParseErrorRow[]
  loading: boolean
  selectedClientBatchId: string
}

function parseRowNumber(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export function SettlementParseErrorsPanel({
  rows,
  loading,
  selectedClientBatchId,
}: SettlementParseErrorsPanelProps) {
  if (!selectedClientBatchId) return null

  const sortedRows = [...rows].sort((a, b) => {
    const an = parseRowNumber(a.source_row_ref)
    const bn = parseRowNumber(b.source_row_ref)
    if (an != null && bn != null) return bn - an
    if (an != null) return -1
    if (bn != null) return 1
    return 0
  })

  return (
    <section className={`relative mb-4 overflow-hidden ${COMMAND_CENTER_KPI_CARD} !p-0`}>
      <CommandCenterCardGlow />
      <div className="relative border-b border-slate-100 bg-slate-50 px-4 py-3">
        <p className={COMMAND_CENTER_LABEL_GREEN}>Settlement parse failures</p>
        <p className={`mt-1 text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>Settlement parse errors (DLQ-style review)</p>
        <p className={HOME_BODY_IMPERIAL_SM}>
          {loading ? 'Loading settlement parse errors…' : `${sortedRows.length.toLocaleString('en-US')} failure row(s)`}
        </p>
      </div>

      <div className="overflow-x-auto px-2 py-2">
        <table className="w-full min-w-[620px] border-collapse text-left text-[13px]">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-3 py-2">Source Row</th>
              <th className="px-3 py-2">Error Stage</th>
              <th className="px-3 py-2">Reason Code</th>
              <th className="px-3 py-2">Severity</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-[13px] text-slate-500">
                  {loading
                    ? 'Fetching failure rows…'
                    : 'No settlement parse failures for this batch.'}
                </td>
              </tr>
            ) : (
              sortedRows.map((row, index) => (
                <tr key={`${row.source_row_ref ?? 'row'}-${row.reason_code ?? 'code'}-${index}`} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-slate-900">{row.source_row_ref || '—'}</td>
                  <td className="px-3 py-2 text-slate-700">{row.error_stage || '—'}</td>
                  <td className="px-3 py-2 text-rose-700">{row.reason_code || '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        (row.severity || '').toUpperCase() === 'ERROR'
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}
                    >
                      {row.severity || '—'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
