'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'

type BatchStatus = 'Reconciled' | 'Pending' | 'Conflict' | 'Failed' | 'Processing'

type BatchTransaction = {
  paymentId: string
  date: string
  amount: string
  status: 'Matched' | 'Pending' | 'Mismatch'
}

type BatchException = {
  paymentId: string
  issue: string
  provider: string
}

type SettlementBatch = {
  id: string
  status: BatchStatus
  settlementDate: string
  provider: string
  processor: string
  paymentMethods: Array<'mastercard' | 'visa' | 'stripe' | 'sbi' | 'hdfc'>
  transactions: number
  currency: string
  netAmount: string
  details: {
    settlementDate: string
    provider: string
    transactions: number
    netAmount: string
    rows: BatchTransaction[]
    exceptions: BatchException[]
  }
}

const PROVIDER_LOGOS: Record<string, string> = {
  Razorpay: '/sources/razorpay-clean-clean.png',
  Cashfree: '/sources/cashfree-clean.png',
  Stripe: '/sources/stripe-clean.png',
  SBI: '/sources/sbi-clean.png',
  'HDFC Bank': '/sources/hdfc-bank-clean.png',
  Visa: '/sources/visa-clean.png',
  Mastercard: '/sources/mastercard-clean.png',
}

const BATCHES: SettlementBatch[] = [
  {
    id: 'SET-300',
    status: 'Reconciled',
    settlementDate: '21 Oct 2025',
    provider: 'Razorpay',
    processor: 'Checkout.com',
    paymentMethods: ['mastercard', 'visa', 'stripe'],
    transactions: 4678,
    currency: 'INR',
    netAmount: '₹21,240',
    details: {
      settlementDate: '21 Oct 2025',
      provider: 'Razorpay',
      transactions: 4678,
      netAmount: '₹21,240',
      rows: [
        { paymentId: 'pay_89321', date: '21 Oct', amount: '₹1,500', status: 'Matched' },
        { paymentId: 'pay_89322', date: '21 Oct', amount: '₹800', status: 'Matched' },
        { paymentId: 'pay_89323', date: '21 Oct', amount: '₹2,100', status: 'Matched' },
      ],
      exceptions: [],
    },
  },
  {
    id: 'SET-299',
    status: 'Reconciled',
    settlementDate: '21 Oct 2025',
    provider: 'Cashfree',
    processor: 'Klarna',
    paymentMethods: ['mastercard', 'visa', 'sbi'],
    transactions: 1902,
    currency: 'INR',
    netAmount: '₹20,000',
    details: {
      settlementDate: '21 Oct 2025',
      provider: 'Cashfree',
      transactions: 1902,
      netAmount: '₹20,000',
      rows: [
        { paymentId: 'pay_89251', date: '21 Oct', amount: '₹1,200', status: 'Matched' },
        { paymentId: 'pay_89252', date: '21 Oct', amount: '₹950', status: 'Matched' },
      ],
      exceptions: [],
    },
  },
  {
    id: 'SET-298',
    status: 'Reconciled',
    settlementDate: '21 Oct 2025',
    provider: 'Stripe',
    processor: 'Stripe',
    paymentMethods: ['mastercard', 'visa', 'stripe'],
    transactions: 3778,
    currency: 'EUR',
    netAmount: '€30,778',
    details: {
      settlementDate: '21 Oct 2025',
      provider: 'Stripe',
      transactions: 3778,
      netAmount: '€30,778',
      rows: [
        { paymentId: 'pay_89121', date: '21 Oct', amount: '€40', status: 'Matched' },
        { paymentId: 'pay_89122', date: '21 Oct', amount: '€18', status: 'Matched' },
      ],
      exceptions: [],
    },
  },
  {
    id: 'SET-297',
    status: 'Pending',
    settlementDate: '20 Oct 2025',
    provider: 'HDFC Bank',
    processor: 'dLocal',
    paymentMethods: ['mastercard', 'visa', 'hdfc'],
    transactions: 2891,
    currency: 'INR',
    netAmount: '₹22,000',
    details: {
      settlementDate: '20 Oct 2025',
      provider: 'HDFC Bank',
      transactions: 2891,
      netAmount: '₹22,000',
      rows: [
        { paymentId: 'pay_89511', date: '20 Oct', amount: '₹1,100', status: 'Pending' },
        { paymentId: 'pay_89512', date: '20 Oct', amount: '₹2,000', status: 'Matched' },
      ],
      exceptions: [],
    },
  },
  {
    id: 'SET-296',
    status: 'Reconciled',
    settlementDate: '18 Oct 2025',
    provider: 'Razorpay',
    processor: 'Klarna',
    paymentMethods: ['mastercard', 'visa', 'sbi'],
    transactions: 3791,
    currency: 'INR',
    netAmount: '₹28,000',
    details: {
      settlementDate: '18 Oct 2025',
      provider: 'Razorpay',
      transactions: 3791,
      netAmount: '₹28,000',
      rows: [
        { paymentId: 'pay_88701', date: '18 Oct', amount: '₹1,800', status: 'Matched' },
      ],
      exceptions: [],
    },
  },
  {
    id: 'SET-295',
    status: 'Reconciled',
    settlementDate: '18 Oct 2025',
    provider: 'Stripe',
    processor: 'Stripe',
    paymentMethods: ['mastercard', 'visa', 'stripe'],
    transactions: 4536,
    currency: 'EUR',
    netAmount: '€20,118',
    details: {
      settlementDate: '18 Oct 2025',
      provider: 'Stripe',
      transactions: 4536,
      netAmount: '€20,118',
      rows: [
        { paymentId: 'pay_88611', date: '18 Oct', amount: '€19', status: 'Matched' },
      ],
      exceptions: [],
    },
  },
  {
    id: 'SET-294',
    status: 'Conflict',
    settlementDate: '17 Oct 2025',
    provider: 'Cashfree',
    processor: 'Checkout.com',
    paymentMethods: ['mastercard', 'visa', 'hdfc'],
    transactions: 1600,
    currency: 'INR',
    netAmount: '₹12,430',
    details: {
      settlementDate: '17 Oct 2025',
      provider: 'Cashfree',
      transactions: 1600,
      netAmount: '₹12,430',
      rows: [
        { paymentId: 'pay_89350', date: '17 Oct', amount: '₹1,430', status: 'Mismatch' },
        { paymentId: 'pay_89351', date: '17 Oct', amount: '₹730', status: 'Matched' },
      ],
      exceptions: [
        { paymentId: 'pay_89350', issue: 'Amount mismatch', provider: 'Cashfree' },
      ],
    },
  },
  {
    id: 'SET-293',
    status: 'Failed',
    settlementDate: '16 Oct 2025',
    provider: 'SBI',
    processor: 'dLocal',
    paymentMethods: ['mastercard', 'visa', 'sbi'],
    transactions: 990,
    currency: 'INR',
    netAmount: '₹6,120',
    details: {
      settlementDate: '16 Oct 2025',
      provider: 'SBI',
      transactions: 990,
      netAmount: '₹6,120',
      rows: [
        { paymentId: 'pay_88220', date: '16 Oct', amount: '₹600', status: 'Mismatch' },
      ],
      exceptions: [
        { paymentId: 'pay_88220', issue: 'Provider report missing', provider: 'SBI' },
      ],
    },
  },
  {
    id: 'SET-292',
    status: 'Processing',
    settlementDate: '16 Oct 2025',
    provider: 'Stripe',
    processor: 'Stripe',
    paymentMethods: ['mastercard', 'visa', 'stripe'],
    transactions: 740,
    currency: 'EUR',
    netAmount: '€4,902',
    details: {
      settlementDate: '16 Oct 2025',
      provider: 'Stripe',
      transactions: 740,
      netAmount: '€4,902',
      rows: [
        { paymentId: 'pay_88299', date: '16 Oct', amount: '€22', status: 'Pending' },
      ],
      exceptions: [],
    },
  },
]

const FILTERS: Array<{ key: 'all' | BatchStatus; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'Reconciled', label: 'Reconciled' },
  { key: 'Pending', label: 'Pending' },
  { key: 'Conflict', label: 'Conflicts' },
  { key: 'Failed', label: 'Failed' },
]

function statusPillClass(status: BatchStatus) {
  if (status === 'Reconciled') return 'border-[#0D9488] bg-[#2DD4BF]/25 text-[#134E4A]'
  if (status === 'Pending') return 'border-[#6366F1] bg-[#A5B4FC]/40 text-[#312E81]'
  if (status === 'Conflict') return 'border-[#0F172A] bg-[#0F172A]/15 text-[#0F172A]'
  if (status === 'Failed') return 'border-[#B91C1C] bg-[#FEE2E2] text-[#991B1B]'
  return 'border-slate-300 bg-slate-100 text-slate-700'
}

function statusDotClass(status: BatchStatus) {
  if (status === 'Reconciled') return 'bg-emerald-500'
  if (status === 'Pending') return 'bg-indigo-500'
  if (status === 'Conflict') return 'bg-red-500'
  if (status === 'Failed') return 'bg-slate-500'
  return 'bg-slate-400'
}

function providerLogo(provider: string) {
  return PROVIDER_LOGOS[provider] ?? ''
}

function methodBadge(method: 'mastercard' | 'visa' | 'stripe' | 'sbi' | 'hdfc') {
  const logoByMethod: Record<typeof method, string> = {
    mastercard: '/sources/mastercard-clean.png',
    visa: '/sources/visa-clean.png',
    stripe: '/sources/stripe-clean.png',
    sbi: '/sources/sbi-clean.png',
    hdfc: '/sources/hdfc-bank-clean.png',
  }
  return (
    <span className="inline-flex h-6 min-w-[28px] items-center justify-center rounded-md border border-slate-200 bg-white px-1">
      <Image src={logoByMethod[method]} alt={method.toUpperCase()} width={22} height={16} className="h-4 w-auto object-contain" />
    </span>
  )
}

export default function CustomerTestSettlementReconPage() {
  const [filter, setFilter] = useState<'all' | BatchStatus>('all')
  const [selectedBatchId, setSelectedBatchId] = useState<string>(BATCHES[0].id)

  const counts = useMemo(
    () => ({
      Reconciled: BATCHES.filter((row) => row.status === 'Reconciled').length,
      Pending: BATCHES.filter((row) => row.status === 'Pending').length,
      Conflict: BATCHES.filter((row) => row.status === 'Conflict').length,
      Failed: BATCHES.filter((row) => row.status === 'Failed').length,
    }),
    []
  )

  const rows = useMemo(
    () => (filter === 'all' ? BATCHES : BATCHES.filter((row) => row.status === filter)),
    [filter]
  )

  const selectedBatch = useMemo(
    () => rows.find((row) => row.id === selectedBatchId) ?? rows[0] ?? null,
    [rows, selectedBatchId]
  )

  return (
    <div className="w-full p-6 lg:p-8">
      <main className="ct-main-panel mt-1 overflow-hidden">
        <section className="rounded-t-[28px] border-b border-white/20 bg-[linear-gradient(180deg,rgba(44,49,57,0.96)_0%,rgba(35,39,46,0.98)_100%)] px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight">Reconciliation</h1>
              <p className="mt-1 text-base text-slate-200">Date Range: Last 30 Days</p>
            </div>
            <button className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.28)] transition hover:bg-white/15">
              Export Report
            </button>
          </div>
        </section>

        <section className="px-6 pb-7 pt-5">
          <section className="grid gap-3 md:grid-cols-3">
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-medium text-slate-500">Reconciliation Rate</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">99.24%</p>
              <p className="mt-1 text-sm text-slate-600">Matched transactions out of total payments</p>
              <p className="mt-2 text-sm font-semibold text-emerald-700">↑ 4.81% vs previous month</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-medium text-slate-500">Total Settled Amount</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">₹3,20,43,200</p>
              <p className="mt-1 text-sm text-slate-600">Total amount settled to your account</p>
              <p className="mt-2 text-sm font-semibold text-rose-700">↓ 5.12% vs previous month</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-medium text-slate-500">Providers</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {['Razorpay', 'Cashfree', 'Stripe', 'SBI', 'HDFC Bank', 'Visa', 'Mastercard'].map((provider) => (
                  <span key={provider} className="inline-flex h-12 min-w-[116px] items-center justify-center rounded-md border border-gray-200 bg-white px-2">
                    <Image src={providerLogo(provider)} alt={provider} width={112} height={32} className="h-8 w-[112px] object-contain" />
                  </span>
                ))}
              </div>
              <p className="mt-2 text-sm text-slate-600">7 active payment partners</p>
            </article>
          </section>

          <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-[0_10px_22px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">Filters</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {FILTERS.map((item) => {
                const count =
                  item.key === 'Reconciled'
                    ? counts.Reconciled
                    : item.key === 'Pending'
                      ? counts.Pending
                      : item.key === 'Conflict'
                        ? counts.Conflict
                        : item.key === 'Failed'
                          ? counts.Failed
                          : BATCHES.length

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFilter(item.key)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                      filter === item.key
                        ? 'border-slate-700 bg-slate-700 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {item.label} ({count})
                  </button>
                )
              })}
            </div>
          </section>

          <section className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-base font-semibold uppercase tracking-wider text-slate-700">Settlement Batches</h2>
            </div>
            <div className="ct-sidebar-scroll overflow-auto">
              <table className="min-w-[1320px] w-full text-left text-base">
                <thead className="bg-gray-50 text-sm uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Batch status</th>
                    <th className="px-4 py-3">Batch ID</th>
                    <th className="px-4 py-3">Payout date</th>
                    <th className="px-4 py-3">Processor</th>
                    <th className="px-4 py-3">Payment method</th>
                    <th className="px-4 py-3"># Transactions</th>
                    <th className="px-4 py-3">Currency</th>
                    <th className="px-4 py-3">Payout amount</th>
                    <th className="px-4 py-3">Actions</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`cursor-pointer border-t border-gray-100 text-sm text-gray-700 ${
                        selectedBatch?.id === row.id ? 'bg-[#EEF2FF]' : 'hover:bg-gray-50/70'
                      }`}
                      onClick={() => setSelectedBatchId(row.id)}
                    >
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-sm font-semibold ${statusPillClass(row.status)}`}>
                          <span className={`h-2 w-2 rounded-full ${statusDotClass(row.status)}`} />
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.id}-Merchant...</td>
                      <td className="px-4 py-3">{row.settlementDate}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-indigo-600 text-xs font-bold text-white">
                            {row.processor.charAt(0)}
                          </span>
                          <span className="text-sm font-medium">{row.processor}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {row.paymentMethods.map((method, index) => (
                            <span key={`${row.id}_${method}_${index}`}>{methodBadge(method)}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">{row.transactions.toLocaleString()}</td>
                      <td className="px-4 py-3">{row.currency}</td>
                      <td className="px-4 py-3 font-semibold">{row.netAmount}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={(e) => e.stopPropagation()} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-slate-50 text-sm text-slate-700 hover:bg-gray-100">📄</button>
                          <button type="button" onClick={(e) => e.stopPropagation()} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-slate-50 text-sm text-slate-700 hover:bg-gray-100">⟳</button>
                          <button type="button" onClick={(e) => e.stopPropagation()} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-slate-50 text-sm text-slate-700 hover:bg-gray-100">↓</button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xl text-slate-500">›</td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-500" colSpan={10}>
                        No settlement batches found for selected filter.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          {selectedBatch ? (
            <section className="mt-4 grid gap-4 xl:grid-cols-2">
              <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="text-base font-semibold text-slate-800">Settlement Batch: {selectedBatch.id}</h2>
                </div>
                <div className="grid gap-3 p-4 text-sm text-slate-700">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <span className="font-semibold">Provider</span>
                    <div className="mt-2 inline-flex h-12 min-w-[116px] items-center justify-center rounded-md border border-gray-200 bg-white px-2">
                      <Image src={providerLogo(selectedBatch.details.provider)} alt={selectedBatch.details.provider} width={112} height={32} className="h-8 w-[112px] object-contain" />
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><span className="font-semibold">Settlement Date</span><p className="mt-1">{selectedBatch.details.settlementDate}</p></div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><span className="font-semibold">Transactions</span><p className="mt-1">{selectedBatch.details.transactions.toLocaleString()}</p></div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><span className="font-semibold">Net Settlement Amount</span><p className="mt-1">{selectedBatch.details.netAmount}</p></div>
                </div>
              </article>

              <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="text-base font-semibold text-slate-800">Download Options</h2>
                </div>
                <div className="p-4">
                  <div className="flex flex-wrap gap-2">
                    <button className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-gray-50">CSV Report</button>
                    <button className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-gray-50">Settlement Summary</button>
                    <button className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-gray-50">Accounting Report</button>
                  </div>
                </div>
              </article>

              <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)] xl:col-span-2">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="text-base font-semibold text-slate-800">Transactions</h2>
                </div>
                <div className="ct-sidebar-scroll overflow-auto">
                  <table className="min-w-[620px] w-full text-left text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3">Payment ID</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBatch.details.rows.map((row) => (
                        <tr key={row.paymentId} className="border-t border-gray-100 text-sm text-gray-700 hover:bg-gray-50/70">
                          <td className="px-4 py-3 font-medium">{row.paymentId}</td>
                          <td className="px-4 py-3">{row.date}</td>
                          <td className="px-4 py-3">{row.amount}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${
                              row.status === 'Matched'
                                ? 'border-[#0D9488] bg-[#2DD4BF]/25 text-[#134E4A]'
                                : row.status === 'Mismatch'
                                  ? 'border-[#0F172A] bg-[#0F172A]/15 text-[#0F172A]'
                                  : 'border-[#6366F1] bg-[#A5B4FC]/40 text-[#312E81]'
                            }`}>{row.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              {selectedBatch.details.exceptions.length > 0 ? (
                <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)] xl:col-span-2">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <h2 className="text-base font-semibold text-slate-800">Exceptions</h2>
                  </div>
                  <div className="ct-sidebar-scroll overflow-auto">
                    <table className="min-w-[720px] w-full text-left text-sm">
                      <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-4 py-3">Payment ID</th>
                          <th className="px-4 py-3">Issue</th>
                          <th className="px-4 py-3">Provider</th>
                          <th className="px-4 py-3">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedBatch.details.exceptions.map((row) => (
                          <tr key={row.paymentId} className="border-t border-gray-100 text-sm text-gray-700 hover:bg-gray-50/70">
                            <td className="px-4 py-3 font-medium">{row.paymentId}</td>
                            <td className="px-4 py-3">{row.issue}</td>
                            <td className="px-4 py-3">{row.provider}</td>
                            <td className="px-4 py-3">
                              <button className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-gray-50">Review</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ) : null}
            </section>
          ) : null}
        </section>
      </main>
    </div>
  )
}
