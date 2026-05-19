'use client'

import Link from 'next/link'
import type { AttentionPreviewRow } from '@/services/payout-command/batch-operations/useBatchOperationsFeed'
import { formatInrPrecise } from '@/services/payout-command/batch-model'
import {
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../today/_components/command-center/homeCommandCenterTokens'

type AttentionPreviewTableProps = {
  rows: AttentionPreviewRow[]
  totalCount: number
  intentJournalHref: string
  loading?: boolean
}

export function AttentionPreviewTable({
  rows,
  totalCount,
  intentJournalHref,
  loading,
}: AttentionPreviewTableProps) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className={COMMAND_CENTER_LABEL_GREEN}>Needs attention</div>
          <h2 className={`mt-2 text-[1.1rem] font-semibold tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>
            Preview ({rows.length} of {totalCount})
          </h2>
          <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>
            Failed DLQ and non-confirmed intents for this batch. Full search and filters live in Intent Journal.
          </p>
        </div>
        {totalCount > 0 ? (
          <Link
            href={intentJournalHref}
            className="inline-flex h-9 items-center rounded-xl border border-[#E5E5E5] bg-white px-3.5 text-[13px] font-medium text-[#0A0A0A] transition hover:bg-slate-50"
          >
            View all in Intent Journal
          </Link>
        ) : null}
      </div>

      {loading ? (
        <p className={`mt-6 text-center ${HOME_BODY_IMPERIAL_SM}`}>Loading batch rows…</p>
      ) : rows.length === 0 ? (
        <p className={`mt-6 text-center ${HOME_BODY_IMPERIAL_SM}`}>
          {totalCount === 0
            ? 'No items need attention for this batch.'
            : 'Select a batch or upload Step 1 to see attention items.'}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/90">
          <table className="min-w-full text-left text-[14px]">
            <thead>
              <tr className="border-b border-slate-200/90 bg-slate-50">
                {['Ref', 'Amount', 'Status', 'Reason', 'Updated'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.07em] text-[#888888] whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-mono text-[12px] text-[#0A0A0A]">{row.beneficiary}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#0A0A0A]">{formatInrPrecise(row.amount)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[12px] font-medium ${
                        row.kind === 'failure'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-slate-50 text-slate-800'
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#1A1A1A]">{row.reason}</td>
                  <td className="px-4 py-3 text-[#888888] whitespace-nowrap">{row.lastUpdated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
