'use client'

import Link from 'next/link'
import { LEDGER_ROWS } from '../../sandbox-fixtures'

export default function LedgerReportPage() {
  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-bold text-cx-text">Ledger View</h1>
        <p className="mt-0.5 text-sm text-cx-neutral">
          Fusion final-state ledger for deterministic reconciliation against provider outcomes.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/70">
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">intent_id</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">amount</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">status</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">provider_ref</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">final_state</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">created_at</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {LEDGER_ROWS.map((row) => (
              <tr key={row.intentId} className="hover:bg-gray-50/60">
                <td className="px-4 py-2.5 text-xs font-mono text-cx-purple-700">
                  <Link href={`/customer/sandbox/intents/${encodeURIComponent(row.intentId)}`} className="hover:underline">
                    {row.intentId}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-xs font-semibold tabular-nums text-cx-text">₹{row.amount.toLocaleString('en-IN')}</td>
                <td className="px-4 py-2.5 text-xs text-cx-text">{row.status}</td>
                <td className="px-4 py-2.5 text-xs font-mono text-cx-neutral">{row.providerRef}</td>
                <td className="px-4 py-2.5 text-xs font-semibold text-cx-text">{row.finalState}</td>
                <td className="px-4 py-2.5 text-xs text-cx-neutral">{new Date(row.createdAt).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
