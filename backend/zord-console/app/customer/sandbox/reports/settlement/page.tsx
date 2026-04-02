'use client'

import Link from 'next/link'
import { SETTLEMENT_BATCHES } from '../../sandbox-fixtures'

export default function SettlementReportPage() {
  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Settlement View</h1>
          <p className="mt-0.5 text-sm text-cx-neutral">
            Batch-level settlement confidence and reconciliation outcomes.
          </p>
        </div>
        <Link
          href="/customer/sandbox/reports/discrepancy"
          className="rounded-lg border border-cx-purple-200 bg-cx-purple-50 px-3 py-2 text-xs font-semibold text-cx-purple-700"
        >
          Open Discrepancy Engine
        </Link>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/70">
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">settlement_batch_id</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">total_amount</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">success_count</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">failure_count</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">confidence_score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {SETTLEMENT_BATCHES.map((batch) => (
              <tr key={batch.settlementBatchId} className="hover:bg-gray-50/60">
                <td className="px-4 py-2.5 text-xs font-mono text-cx-purple-700">{batch.settlementBatchId}</td>
                <td className="px-4 py-2.5 text-xs tabular-nums text-cx-text">₹{batch.totalAmount.toLocaleString('en-IN')}</td>
                <td className="px-4 py-2.5 text-xs tabular-nums text-cx-text">{batch.successCount}</td>
                <td className="px-4 py-2.5 text-xs tabular-nums text-cx-text">{batch.failureCount}</td>
                <td className="px-4 py-2.5 text-xs font-semibold text-cx-text">{(batch.confidenceScore * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
