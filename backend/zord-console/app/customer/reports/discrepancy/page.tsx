'use client'

import Link from 'next/link'
import { MOCK_INTENT_IDS } from '../../mock'

interface Discrepancy {
  id: string
  intentId: string
  type: string
  description: string
  providerStatus: string
  zordStatus: string
  amount: string
  detectedAt: string
  severity: 'high' | 'medium' | 'low'
  status: 'open' | 'investigating' | 'resolved'
}

const discrepancies: Discrepancy[] = [
  { id: 'DIS-001', intentId: MOCK_INTENT_IDS[0], type: 'Status Mismatch', description: 'Provider says "success", bank settlement file missing', providerStatus: 'success', zordStatus: 'pending_settlement', amount: '₹45,000.00', detectedAt: '12:34:00', severity: 'high', status: 'open' },
  { id: 'DIS-002', intentId: MOCK_INTENT_IDS[1], type: 'Amount Mismatch', description: 'Settlement amount differs: provider ₹10,000 vs bank ₹9,800', providerStatus: 'settled_10000', zordStatus: 'settled_9800', amount: '₹200.00', detectedAt: '11:22:00', severity: 'medium', status: 'investigating' },
  { id: 'DIS-003', intentId: MOCK_INTENT_IDS[2], type: 'Status Mismatch', description: 'Provider returned failure but UTR found in bank file', providerStatus: 'failed', zordStatus: 'settled', amount: '₹7,500.00', detectedAt: 'Feb 9, 23:45', severity: 'high', status: 'open' },
  { id: 'DIS-004', intentId: MOCK_INTENT_IDS[3], type: 'Missing UTR', description: 'Provider ack received but no UTR in T+1 bank file', providerStatus: 'success', zordStatus: 'pending_utr', amount: '₹22,000.00', detectedAt: 'Feb 9, 22:10', severity: 'medium', status: 'open' },
  { id: 'DIS-005', intentId: MOCK_INTENT_IDS[4], type: 'Duplicate', description: 'Duplicate UTR detected in two different intents', providerStatus: 'success', zordStatus: 'duplicate_utr', amount: '₹15,600.00', detectedAt: 'Feb 8, 18:30', severity: 'low', status: 'resolved' },
  { id: 'DIS-006', intentId: MOCK_INTENT_IDS[1], type: 'Timing Mismatch', description: 'Settlement confirmed > 24h after provider ack', providerStatus: 'success', zordStatus: 'late_settlement', amount: '₹31,200.00', detectedAt: 'Feb 8, 14:00', severity: 'low', status: 'resolved' },
  { id: 'DIS-007', intentId: MOCK_INTENT_IDS[0], type: 'Status Mismatch', description: 'Provider webhook says refund_completed, no debit entry in ledger', providerStatus: 'refund_completed', zordStatus: 'refund_pending', amount: '₹5,400.00', detectedAt: '10:15:00', severity: 'high', status: 'open' },
]

const severityConfig = {
  high: { label: 'High', color: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  medium: { label: 'Medium', color: 'bg-cx-orange-50 text-cx-orange-700 border-cx-orange-200', dot: 'bg-cx-orange-500' },
  low: { label: 'Low', color: 'bg-gray-50 text-gray-600 border-gray-200', dot: 'bg-gray-400' },
}

const statusConfig = {
  open: { label: 'Open', color: 'bg-red-50 text-red-700' },
  investigating: { label: 'Investigating', color: 'bg-cx-purple-50 text-cx-purple-700' },
  resolved: { label: 'Resolved', color: 'bg-cx-teal-50 text-cx-teal-700' },
}

export default function DiscrepancyInboxPage() {
  const openCount = discrepancies.filter(d => d.status !== 'resolved').length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Discrepancy Inbox</h1>
          <p className="text-sm text-cx-neutral mt-0.5">Reconciliation mismatches requiring attention</p>
        </div>
        <span className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200">
          {openCount} Open
        </span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Discrepancies', value: discrepancies.length.toString(), color: 'border-l-cx-purple-500' },
          { label: 'Open', value: discrepancies.filter(d => d.status === 'open').length.toString(), color: 'border-l-red-500' },
          { label: 'Investigating', value: discrepancies.filter(d => d.status === 'investigating').length.toString(), color: 'border-l-cx-purple-500' },
          { label: 'Total Value at Risk', value: '₹1,26,900', color: 'border-l-cx-orange-500' },
        ].map((s) => (
          <div key={s.label} className={`bg-white rounded-xl border border-gray-100 border-l-4 ${s.color} p-4`}>
            <p className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">{s.label}</p>
            <p className="text-2xl font-bold text-cx-text mt-1 tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Discrepancy List */}
      <div className="space-y-3">
        {discrepancies.map((disc) => (
          <div key={disc.id} className={`bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-cx-purple-100 transition-all ${
            disc.status === 'resolved' ? 'opacity-60' : ''
          }`}>
            <div className="flex items-start gap-4">
              <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${severityConfig[disc.severity].dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-cx-neutral">{disc.id}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${severityConfig[disc.severity].color}`}>
                    {severityConfig[disc.severity].label}
                  </span>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-cx-text">{disc.type}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusConfig[disc.status].color}`}>
                    {statusConfig[disc.status].label}
                  </span>
                </div>
                <p className="text-sm font-medium text-cx-text mt-1.5">{disc.description}</p>
                <div className="flex items-center gap-6 mt-2 text-xs">
                  <div>
                    <span className="text-cx-neutral">Intent: </span>
                    <Link href={`/customer/intents/${disc.intentId}`} className="font-mono text-cx-purple-600 hover:underline">{disc.intentId}</Link>
                  </div>
                  <div>
                    <span className="text-cx-neutral">Amount: </span>
                    <span className="font-mono font-medium text-cx-text">{disc.amount}</span>
                  </div>
                  <div>
                    <span className="text-cx-neutral">Detected: </span>
                    <span className="text-cx-text">{disc.detectedAt}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-cx-neutral">Provider:</span>
                    <span className="font-mono px-1.5 py-0.5 bg-gray-100 rounded text-cx-text">{disc.providerStatus}</span>
                  </div>
                  <span className="text-cx-neutral">vs</span>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-cx-neutral">Zord:</span>
                    <span className="font-mono px-1.5 py-0.5 bg-gray-100 rounded text-cx-text">{disc.zordStatus}</span>
                  </div>
                </div>
              </div>
              {disc.status !== 'resolved' && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button className="px-3 py-1.5 text-xs font-semibold text-cx-purple-600 bg-cx-purple-50 border border-cx-purple-200 rounded-lg hover:bg-cx-purple-100 transition-colors">
                    Investigate
                  </button>
                  <button className="px-3 py-1.5 text-xs font-semibold text-cx-text bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    Resolve
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
