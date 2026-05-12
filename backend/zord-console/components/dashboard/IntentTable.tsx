'use client'

type IntentRow = {
  intentId: string
  tenant: string
  amount: string
  status: 'SUCCESS' | 'PENDING' | 'FAILED'
  confidence: number
  provider: string
}

const rows: IntentRow[] = [
  { intentId: 'int_01HZZ7', tenant: 'merchant_A', amount: '₹1,500', status: 'SUCCESS', confidence: 0.94, provider: 'Razorpay' },
  { intentId: 'int_01HZZ8', tenant: 'merchant_B', amount: '₹2,450', status: 'PENDING', confidence: 0.89, provider: 'Cashfree' },
  { intentId: 'int_01HZZ9', tenant: 'merchant_A', amount: '₹980', status: 'SUCCESS', confidence: 0.96, provider: 'Stripe' },
  { intentId: 'int_01HZZA', tenant: 'merchant_C', amount: '₹7,300', status: 'FAILED', confidence: 0.67, provider: 'Razorpay' },
  { intentId: 'int_01HZZB', tenant: 'merchant_D', amount: '₹3,900', status: 'SUCCESS', confidence: 0.93, provider: 'PayPal' },
  { intentId: 'int_01HZZC', tenant: 'merchant_E', amount: '₹2,150', status: 'PENDING', confidence: 0.84, provider: 'SBI' },
]

function statusClass(status: IntentRow['status']) {
  if (status === 'SUCCESS') return 'bg-green-100 text-green-700 border-green-200'
  if (status === 'PENDING') return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-red-100 text-red-700 border-red-200'
}

export function IntentTable() {
  return (
    <section className="rounded-[20px] border border-gray-200 bg-white p-6 shadow-[0_16px_30px_rgba(15,23,42,0.06)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">Intent Activity Log</h3>
        <div className="flex items-center gap-2">
          <button className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">This hour ▼</button>
          <button className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">Download Evidence</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              {['Intent ID', 'Tenant', 'Amount', 'Status', 'Confidence', 'Provider', 'Evidence'].map((header) => (
                <th key={header} className="border-b border-slate-200 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.intentId} className="hover:bg-slate-50">
                <td className="border-b border-slate-100 px-3 py-3 text-sm font-medium text-slate-900">{row.intentId}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{row.tenant}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{row.amount}</td>
                <td className="border-b border-slate-100 px-3 py-3">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(row.status)}`}>{row.status}</span>
                </td>
                <td className="border-b border-slate-100 px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-10 text-xs text-slate-600">{row.confidence.toFixed(2)}</span>
                    <div className="h-2 w-20 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-[#6366F1]" style={{ width: `${Math.round(row.confidence * 100)}%` }} />
                    </div>
                  </div>
                </td>
                <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{row.provider}</td>
                <td className="border-b border-slate-100 px-3 py-3">
                  <button className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
