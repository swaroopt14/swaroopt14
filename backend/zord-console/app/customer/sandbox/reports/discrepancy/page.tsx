'use client'

import Link from 'next/link'
import { DISCREPANCY_ROWS } from '../../sandbox-fixtures'

export default function DiscrepancyEnginePage() {
  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-bold text-cx-text">Discrepancy Engine</h1>
        <p className="mt-0.5 text-sm text-cx-neutral">
          Expected vs observed state mismatches across provider, fusion, and ledger layers.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/70">
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">intent_id</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">expected_state</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">observed_state</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">variance_reason</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">severity</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {DISCREPANCY_ROWS.map((row) => (
              <tr key={`${row.intentId}_${row.varianceReason}`} className="hover:bg-gray-50/60">
                <td className="px-4 py-2.5 text-xs font-mono text-cx-purple-700">
                  <Link href={`/customer/sandbox/intents/${encodeURIComponent(row.intentId)}`} className="hover:underline">
                    {row.intentId}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-xs font-mono text-cx-text">{row.expectedState}</td>
                <td className="px-4 py-2.5 text-xs font-mono text-cx-text">{row.observedState}</td>
                <td className="px-4 py-2.5 text-xs text-cx-neutral">{row.varianceReason}</td>
                <td className="px-4 py-2.5 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${row.severity === 'High' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                    {row.severity}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs">
                  <Link
                    href={`/customer/sandbox/evidence/explorer?intent_id=${encodeURIComponent(row.intentId)}`}
                    className="rounded-lg border border-cx-purple-200 bg-cx-purple-50 px-2.5 py-1 font-semibold text-cx-purple-700"
                  >
                    Open Evidence
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
