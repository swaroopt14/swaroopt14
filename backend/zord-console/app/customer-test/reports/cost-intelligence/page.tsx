'use client'

import Image from 'next/image'

const LOGOS: Record<string, string> = {
  Razorpay: '/sources/razorpay-clean-clean.png',
  Cashfree: '/sources/cashfree-clean.png',
  Stripe: '/sources/stripe-clean.png',
  'HDFC Bank': '/sources/hdfc-bank-clean.png',
  SBI: '/sources/sbi-clean.png',
  Mastercard: '/sources/mastercard-clean.png',
  Visa: '/sources/visa-clean.png',
}

const PROVIDER_BREAKDOWN = [
  { provider: 'Razorpay', fees: '₹49,000', grossVolume: '₹5,36,700' },
  { provider: 'Cashfree', fees: '₹64,000', grossVolume: '₹6,89,200' },
  { provider: 'Stripe', fees: '₹45,000', grossVolume: '₹5,10,200' },
  { provider: 'HDFC Bank', fees: '₹62,000', grossVolume: '₹6,88,900' },
  { provider: 'SBI', fees: '₹38,000', grossVolume: '₹4,31,800' },
]

const METHOD_BREAKDOWN = [
  { method: 'Mastercard', transactions: '2,100', fees: '₹10,400' },
  { method: 'Visa', transactions: '2,000', fees: '₹9,600' },
  { method: 'Stripe', transactions: '1,200', fees: '₹7,000' },
  { method: 'SBI', transactions: '900', fees: '₹3,200' },
  { method: 'HDFC', transactions: '750', fees: '₹2,900' },
]

const TRANSACTION_FEES = [
  { date: '9 Mar', paymentId: 'pay_89321', method: 'Mastercard', amount: '₹1,500', fee: '₹22', net: '₹1,478' },
  { date: '9 Mar', paymentId: 'pay_89322', method: 'Visa', amount: '₹3,200', fee: '₹64', net: '₹3,136' },
  { date: '9 Mar', paymentId: 'pay_89323', method: 'Stripe', amount: '₹2,100', fee: '₹31', net: '₹2,069' },
  { date: '8 Mar', paymentId: 'pay_89290', method: 'SBI', amount: '₹1,820', fee: '₹19', net: '₹1,801' },
]

const FEE_TRENDS = [
  { month: 'Jan', value: '₹2,10,000', width: 'w-2/3' },
  { month: 'Feb', value: '₹2,85,000', width: 'w-5/6' },
  { month: 'Mar', value: '₹3,20,432', width: 'w-full' },
]

export default function CustomerTestCostIntelligencePage() {
  return (
    <div className="w-full p-6 lg:p-8">
      <main className="ct-main-panel mt-1 overflow-hidden">
        <section className="rounded-t-[28px] border-b border-white/20 bg-[linear-gradient(180deg,rgba(44,49,57,0.96)_0%,rgba(35,39,46,0.98)_100%)] px-6 py-4 text-white">
          <h1 className="text-[28px] font-semibold tracking-tight">Costs</h1>
          <p className="mt-1 text-base text-slate-200">Date Range: Last 30 Days</p>
        </section>

        <section className="px-6 pb-7 pt-5">
          <section className="grid gap-3 md:grid-cols-4">
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-medium text-slate-500">Total Fees (30d)</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">₹3,20,432</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-medium text-slate-500">Gross Volume</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">₹53,67,004</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-medium text-slate-500">Net Settlement</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">₹50,46,572</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-medium text-slate-500">Average Fee Rate</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">2.4%</p>
            </article>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-2">
            <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-base font-semibold uppercase tracking-wider text-slate-700">Provider Breakdown</h2>
              </div>
              <div className="ct-sidebar-scroll overflow-auto">
                <table className="min-w-[520px] w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Provider</th>
                      <th className="px-4 py-3">Fees</th>
                      <th className="px-4 py-3">Gross Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PROVIDER_BREAKDOWN.map((row) => (
                      <tr key={row.provider} className="border-t border-gray-100 text-sm text-gray-700 hover:bg-gray-50/70">
                        <td className="px-4 py-3 font-medium">
                          <span className="inline-flex h-12 min-w-[116px] items-center justify-center rounded-md border border-gray-200 bg-white px-2">
                            <Image src={LOGOS[row.provider]} alt={row.provider} width={112} height={32} className="h-8 w-[112px] object-contain" />
                          </span>
                        </td>
                        <td className="px-4 py-3">{row.fees}</td>
                        <td className="px-4 py-3">{row.grossVolume}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-base font-semibold uppercase tracking-wider text-slate-700">Payment Method Breakdown</h2>
              </div>
              <div className="ct-sidebar-scroll overflow-auto">
                <table className="min-w-[520px] w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Payment Method</th>
                      <th className="px-4 py-3">Transactions</th>
                      <th className="px-4 py-3">Fees</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METHOD_BREAKDOWN.map((row) => (
                      <tr key={row.method} className="border-t border-gray-100 text-sm text-gray-700 hover:bg-gray-50/70">
                        <td className="px-4 py-3 font-medium">
                          <span className="inline-flex h-12 min-w-[116px] items-center justify-center rounded-md border border-gray-200 bg-white px-2">
                            <Image src={LOGOS[row.method === 'HDFC' ? 'HDFC Bank' : row.method]} alt={row.method} width={112} height={32} className="h-8 w-[112px] object-contain" />
                          </span>
                        </td>
                        <td className="px-4 py-3">{row.transactions}</td>
                        <td className="px-4 py-3">{row.fees}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-base font-semibold uppercase tracking-wider text-slate-700">Transaction Fee Table</h2>
              </div>
              <div className="ct-sidebar-scroll overflow-auto">
                <table className="min-w-[760px] w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Payment ID</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Fee</th>
                      <th className="px-4 py-3">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TRANSACTION_FEES.map((row) => (
                      <tr key={row.paymentId} className="border-t border-gray-100 text-sm text-gray-700 hover:bg-gray-50/70">
                        <td className="px-4 py-3">{row.date}</td>
                        <td className="px-4 py-3 font-medium">{row.paymentId}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex h-10 min-w-[96px] items-center justify-center rounded-md border border-gray-200 bg-white px-2">
                            <Image src={LOGOS[row.method === 'HDFC' ? 'HDFC Bank' : row.method]} alt={row.method} width={92} height={24} className="h-6 w-[92px] object-contain" />
                          </span>
                        </td>
                        <td className="px-4 py-3">{row.amount}</td>
                        <td className="px-4 py-3">{row.fee}</td>
                        <td className="px-4 py-3 font-semibold">{row.net}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-base font-semibold uppercase tracking-wider text-slate-700">Fees Over Time</h2>
              </div>
              <div className="space-y-3 p-4">
                {FEE_TRENDS.map((row) => (
                  <div key={row.month}>
                    <div className="mb-1 flex items-center justify-between text-sm text-slate-700">
                      <span className="font-medium">{row.month}</span>
                      <span>{row.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className={`h-2 rounded-full bg-[#6366F1] ${row.width}`} />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </section>
      </main>
    </div>
  )
}
