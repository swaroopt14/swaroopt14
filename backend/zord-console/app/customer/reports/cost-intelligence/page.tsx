'use client'

const providerCosts = [
  { provider: 'Razorpay', txns: 92014, grossMdrBps: 214, refundsBps: 18, netCostBps: 232, trend: '+6 bps' },
  { provider: 'Cashfree', txns: 58201, grossMdrBps: 198, refundsBps: 14, netCostBps: 212, trend: '-3 bps' },
  { provider: 'Direct Bank', txns: 22184, grossMdrBps: 161, refundsBps: 11, netCostBps: 172, trend: '-8 bps' },
]

export default function CustomerCostIntelligencePage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-cx-text">Cost Intelligence</h1>
        <p className="text-sm text-cx-neutral mt-0.5">Provider-level fee analytics, leakage tracking, and margin pressure signals.</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Effective Cost / Txn', value: '₹5.82' },
          { label: 'Net MDR (blended)', value: '218 bps' },
          { label: 'Fee Leakage (MTD)', value: '₹2,18,440' },
          { label: 'Potential Savings', value: '₹3,94,000' },
        ].map((summary) => (
          <div key={summary.label} className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">{summary.label}</p>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-cx-text">{summary.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <header className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-cx-text">Provider Cost Breakdown (MTD)</h2>
        </header>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/70">
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Provider</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Transactions</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Gross MDR</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Refund Cost</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Net Cost</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {providerCosts.map((row) => (
              <tr key={row.provider} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 text-sm font-medium text-cx-text">{row.provider}</td>
                <td className="px-4 py-3 text-xs tabular-nums text-cx-text">{row.txns.toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 text-xs font-mono text-cx-text">{row.grossMdrBps} bps</td>
                <td className="px-4 py-3 text-xs font-mono text-cx-text">{row.refundsBps} bps</td>
                <td className="px-4 py-3 text-xs font-mono font-semibold text-cx-text">{row.netCostBps} bps</td>
                <td className="px-4 py-3 text-xs text-cx-neutral">{row.trend}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
