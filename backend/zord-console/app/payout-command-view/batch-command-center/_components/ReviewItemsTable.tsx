'use client'

import Link from 'next/link'
import type { JournalFailureRow, JournalIntentRow } from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import { formatInrPrecise } from '@/services/payout-command/batch-model'
import { BATCH_REVIEW_COPY } from '../copy/batchCommandCenterCopy'
import { PORTAL_CARD } from './portal/batchPortalTokens'

export type ReviewItemRow = {
  id: string
  paymentRef: string
  invoiceNo: string
  beneficiary: string
  amount: number
  issue: string
  confidence: string
  isDlq: boolean
}

function mapReviewRows(failures: JournalFailureRow[], intents: JournalIntentRow[]): ReviewItemRow[] {
  const failureItems: ReviewItemRow[] = failures.map((r) => ({
    id: r.requestId,
    paymentRef: r.reference || r.requestId,
    invoiceNo: '—',
    beneficiary: r.reference || r.requestId,
    amount: r.amount,
    issue: r.failureReason || r.failureStage,
    confidence: '—',
    isDlq: true,
  }))
  const intentItems: ReviewItemRow[] = intents
    .filter((r) => r.status === 'Needs Review' || r.status === 'Pending' || r.status === 'In Progress')
    .map((r) => ({
      id: r.requestId,
      paymentRef: r.reference || r.requestId,
      invoiceNo: r.reference || '—',
      beneficiary: r.paymentPartner || r.bank || r.reference,
      amount: r.amount,
      issue: r.match || r.status,
      confidence: r.confidenceLabel || (r.confidenceScore != null ? `${Math.round(r.confidenceScore * 100)}%` : '—'),
      isDlq: false,
    }))
  return [...failureItems, ...intentItems].slice(0, 25)
}

export function ReviewItemsTable({
  failures,
  intents,
  failuresTabHref,
  loading,
}: {
  failures: JournalFailureRow[]
  intents: JournalIntentRow[]
  failuresTabHref: string
  loading?: boolean
}) {
  const rows = mapReviewRows(failures, intents)
  const c = BATCH_REVIEW_COPY.reviewTable

  return (
    <section id="batch-review-items" className={`${PORTAL_CARD} scroll-mt-24 p-5 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-[#0f172a]">{c.title}</h2>
          <p className="mt-1 text-[13px] text-[#64748b]">{c.subtitle}</p>
        </div>
        <Link
          href={failuresTabHref}
          className="inline-flex h-9 items-center rounded-lg bg-[#2563eb] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
        >
          {c.reviewInEngine}
        </Link>
      </div>
      {loading ? (
        <p className="mt-6 text-[13px] text-[#64748b]">Loading review items…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-[13px] text-[#64748b]">{c.emptySelect}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-[#e2e8f0]">
          <table className="min-w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                {Object.values(c.columns).map((h) => (
                  <th key={h} className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748b]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc]">
                  <td className="px-3 py-2.5 font-mono text-[12px]">{row.paymentRef}</td>
                  <td className="px-3 py-2.5">{row.invoiceNo}</td>
                  <td className="px-3 py-2.5">{row.beneficiary}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{formatInrPrecise(row.amount)}</td>
                  <td className="px-3 py-2.5 max-w-[200px] truncate" title={row.issue}>
                    {row.issue}
                  </td>
                  <td className="px-3 py-2.5">{row.confidence}</td>
                  <td className="px-3 py-2.5">
                    <Link href={failuresTabHref} className="font-semibold text-[#2563eb] underline">
                      {c.actions.review}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
