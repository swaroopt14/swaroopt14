'use client'

const railMetrics = [
  { rail: 'UPI', successRate: 92.8, p95Ms: 1380, volume: 128440, dropReason: 'Issuer timeout' },
  { rail: 'Cards', successRate: 89.6, p95Ms: 1810, volume: 84220, dropReason: '3DS challenge fail' },
  { rail: 'Netbanking', successRate: 94.1, p95Ms: 1640, volume: 31210, dropReason: 'Bank redirect abandon' },
]

const hourly = [
  { hour: '08:00', success: '95.1%', fail: '4.9%' },
  { hour: '12:00', success: '93.8%', fail: '6.2%' },
  { hour: '16:00', success: '92.9%', fail: '7.1%' },
  { hour: '20:00', success: '90.4%', fail: '9.6%' },
]

export default function CustomerPaymentIntelligencePage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-cx-text">Payment Intelligence</h1>
        <p className="text-sm text-cx-neutral mt-0.5">Conversion and failure intelligence by rail, time, and reason code.</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Overall Success', value: '92.4%' },
          { label: 'P95 End-to-End', value: '1.52s' },
          { label: 'Top Drop Reason', value: 'Issuer timeout' },
          { label: 'Recovery Uplift', value: '+2.1%' },
        ].map((summary) => (
          <div key={summary.label} className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">{summary.label}</p>
            <p className="mt-1.5 text-xl font-bold text-cx-text">{summary.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <header className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-cx-text">Rail Performance</h2>
        </header>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/70">
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Rail</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Success Rate</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">P95 Latency</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Volume</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Top Failure Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {railMetrics.map((row) => (
              <tr key={row.rail} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 text-sm font-medium text-cx-text">{row.rail}</td>
                <td className="px-4 py-3 text-xs font-semibold text-cx-text">{row.successRate.toFixed(1)}%</td>
                <td className="px-4 py-3 text-xs font-mono text-cx-text">{row.p95Ms} ms</td>
                <td className="px-4 py-3 text-xs tabular-nums text-cx-text">{row.volume.toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 text-xs text-cx-neutral">{row.dropReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <header className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-cx-text">Hourly Trend Snapshot</h2>
        </header>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/70">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Hour</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Success</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Fail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {hourly.map((row) => (
              <tr key={row.hour}>
                <td className="px-4 py-2.5 text-xs text-cx-text">{row.hour}</td>
                <td className="px-4 py-2.5 text-xs text-emerald-700">{row.success}</td>
                <td className="px-4 py-2.5 text-xs text-red-600">{row.fail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
