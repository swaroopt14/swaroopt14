'use client'

import { MOCK_INTENT_IDS } from '../../mock'

const ledgerEntries = [
  { id: 'LE-001', timestamp: '14:23:48', intentId: MOCK_INTENT_IDS[0], type: 'CREDIT', account: 'Merchant Settlement', amount: '₹12,500.00', balance: '₹1,24,56,000.00', ref: 'UTR20260210HDFC991827' },
  { id: 'LE-002', timestamp: '14:18:15', intentId: MOCK_INTENT_IDS[1], type: 'CREDIT', account: 'Merchant Settlement', amount: '₹8,900.00', balance: '₹1,24,43,500.00', ref: 'UTR20260210HDFC991826' },
  { id: 'LE-003', timestamp: '14:14:25', intentId: MOCK_INTENT_IDS[2], type: 'DEBIT', account: 'Refund Pool', amount: '₹750.00', balance: '₹1,24,34,600.00', ref: 'REF20260210HDFC001' },
  { id: 'LE-004', timestamp: '14:12:13', intentId: MOCK_INTENT_IDS[3], type: 'CREDIT', account: 'Merchant Settlement', amount: '₹6,400.00', balance: '₹1,24,35,350.00', ref: 'UTR20260210ICICI887722' },
  { id: 'LE-005', timestamp: '12:00:00', intentId: '-', type: 'CREDIT', account: 'Settlement Batch', amount: '₹56,78,000.00', balance: '₹1,24,28,950.00', ref: 'STL-2026-0210-002' },
  { id: 'LE-006', timestamp: '09:00:00', intentId: '-', type: 'DEBIT', account: 'MDR Fee', amount: '₹12,340.00', balance: '₹67,50,950.00', ref: 'MDR-2026-0210-001' },
]

export default function LedgerViewPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Ledger View</h1>
          <p className="text-sm text-cx-neutral mt-0.5">Read-only summary of ledger movements</p>
        </div>
        <span className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-gray-100 text-cx-neutral border border-gray-200">
          Read-Only
        </span>
      </div>

      {/* Balance Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Current Balance', value: '₹1,24,56,000.00', sub: 'Merchant Settlement Account', color: 'border-l-cx-purple-500' },
          { label: 'Total Credits (Today)', value: '₹1,84,56,300.00', sub: '6,924 credit entries', color: 'border-l-cx-teal-500' },
          { label: 'Total Debits (Today)', value: '₹60,00,300.00', sub: '892 debit entries', color: 'border-l-cx-orange-500' },
        ].map((s) => (
          <div key={s.label} className={`bg-white rounded-xl border border-gray-100 border-l-4 ${s.color} p-5`}>
            <p className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">{s.label}</p>
            <p className="text-2xl font-bold text-cx-text mt-1 tabular-nums">{s.value}</p>
            <p className="text-xs text-cx-neutral mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-cx-text">Recent Ledger Entries</h3>
          <span className="text-xs text-cx-neutral">Showing latest 6 entries</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50">
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Time</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Intent</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Type</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Account</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Amount</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Running Balance</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Ref</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {ledgerEntries.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-5 py-3 text-xs font-mono text-cx-neutral">{entry.timestamp}</td>
                <td className="px-5 py-3 text-xs font-mono text-cx-purple-600">{entry.intentId}</td>
                <td className="px-5 py-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    entry.type === 'CREDIT' ? 'bg-cx-teal-50 text-cx-teal-700' : 'bg-cx-orange-50 text-cx-orange-700'
                  }`}>
                    {entry.type}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-cx-text">{entry.account}</td>
                <td className="px-5 py-3 text-sm font-mono font-medium tabular-nums text-cx-text">
                  <span className={entry.type === 'CREDIT' ? 'text-cx-teal-600' : 'text-cx-orange-600'}>
                    {entry.type === 'CREDIT' ? '+' : '-'}{entry.amount}
                  </span>
                </td>
                <td className="px-5 py-3 text-sm font-mono tabular-nums text-cx-text">{entry.balance}</td>
                <td className="px-5 py-3 text-xs font-mono text-cx-neutral truncate max-w-[140px]">{entry.ref}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Disclaimer */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 flex items-start gap-3">
        <svg className="w-4 h-4 text-cx-neutral flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
        <p className="text-xs text-cx-neutral">
          This is a read-only summary view of ledger movements. The authoritative ledger is maintained by the settlement engine and is immutable. All entries are hash-anchored for audit trail.
        </p>
      </div>
    </div>
  )
}
