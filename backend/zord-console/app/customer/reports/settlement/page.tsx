'use client'

import { useState } from 'react'

interface SettlementBatch {
  id: string
  date: string
  totalIntents: number
  settledAmount: string
  pendingAmount: string
  status: 'reconciled' | 'partial' | 'pending' | 'discrepancy'
  matchRate: string
  provider: string
}

const batches: SettlementBatch[] = [
  { id: 'STL-2026-0210-001', date: '2026-02-10', totalIntents: 4821, settledAmount: '₹1,24,56,000', pendingAmount: '₹3,45,200', status: 'partial', matchRate: '99.2%', provider: 'HDFC' },
  { id: 'STL-2026-0210-002', date: '2026-02-10', totalIntents: 2103, settledAmount: '₹56,78,000', pendingAmount: '₹0', status: 'reconciled', matchRate: '100%', provider: 'ICICI' },
  { id: 'STL-2026-0209-001', date: '2026-02-09', totalIntents: 5234, settledAmount: '₹1,45,67,000', pendingAmount: '₹0', status: 'reconciled', matchRate: '100%', provider: 'HDFC' },
  { id: 'STL-2026-0209-002', date: '2026-02-09', totalIntents: 1892, settledAmount: '₹42,34,000', pendingAmount: '₹1,23,400', status: 'discrepancy', matchRate: '97.1%', provider: 'Razorpay' },
  { id: 'STL-2026-0208-001', date: '2026-02-08', totalIntents: 4567, settledAmount: '₹1,12,45,000', pendingAmount: '₹0', status: 'reconciled', matchRate: '100%', provider: 'HDFC' },
]

const statusBadge = {
  reconciled: { label: 'Reconciled', color: 'bg-cx-teal-50 text-cx-teal-700' },
  partial: { label: 'Partial', color: 'bg-amber-50 text-amber-700' },
  pending: { label: 'Pending', color: 'bg-cx-purple-50 text-cx-purple-700' },
  discrepancy: { label: 'Discrepancy', color: 'bg-red-50 text-red-700' },
}

export default function SettlementReconPage() {
  const [dateFilter, setDateFilter] = useState('today')

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Settlement & Reconciliation</h1>
          <p className="text-sm text-cx-neutral mt-0.5">Settlement batch status and reconciliation overview</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {['today', '7d', '30d'].map((d) => (
            <button
              key={d}
              onClick={() => setDateFilter(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                dateFilter === d ? 'bg-white text-cx-text shadow-sm' : 'text-cx-neutral'
              }`}
            >
              {d === 'today' ? 'Today' : d === '7d' ? '7 Days' : '30 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Settled', value: '₹3,81,80,000', color: 'border-l-cx-teal-500' },
          { label: 'Pending', value: '₹4,68,600', color: 'border-l-amber-500' },
          { label: 'Match Rate', value: '99.4%', color: 'border-l-cx-purple-500' },
          { label: 'Discrepancies', value: '2', color: 'border-l-red-500' },
        ].map((s) => (
          <div key={s.label} className={`bg-white rounded-xl border border-gray-100 border-l-4 ${s.color} p-4`}>
            <p className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">{s.label}</p>
            <p className="text-xl font-bold text-cx-text mt-1 tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Batches Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-cx-text">Settlement Batches</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50">
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Batch ID</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Date</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Provider</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Intents</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Settled</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Pending</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Match</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {batches.map((batch) => (
              <tr key={batch.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-5 py-3 text-sm font-mono text-cx-purple-600">{batch.id}</td>
                <td className="px-5 py-3 text-sm text-cx-text">{batch.date}</td>
                <td className="px-5 py-3 text-xs font-medium text-cx-text">{batch.provider}</td>
                <td className="px-5 py-3 text-sm tabular-nums text-cx-text">{batch.totalIntents.toLocaleString()}</td>
                <td className="px-5 py-3 text-sm font-medium tabular-nums text-cx-text">{batch.settledAmount}</td>
                <td className="px-5 py-3 text-sm tabular-nums text-cx-neutral">{batch.pendingAmount}</td>
                <td className="px-5 py-3 text-sm font-bold tabular-nums text-cx-text">{batch.matchRate}</td>
                <td className="px-5 py-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBadge[batch.status].color}`}>
                    {statusBadge[batch.status].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
