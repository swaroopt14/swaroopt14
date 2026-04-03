'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { MOCK_INTENT_IDS } from '../../mock'

interface ReplayCandidate {
  id: string
  intentId: string
  type: string
  amount: string
  failureReason: string
  failedAt: string
  attempts: number
  canAutoRetry: boolean
  needsApproval: boolean
  state?: 'ready' | 'replaying' | 'replayed'
}

const initialCandidates: ReplayCandidate[] = [
  { id: 'RPL-001', intentId: MOCK_INTENT_IDS[0], type: 'payment', amount: '₹25,000.00', failureReason: 'Provider timeout after 30s', failedAt: '14:15:44', attempts: 1, canAutoRetry: true, needsApproval: false },
  { id: 'RPL-002', intentId: MOCK_INTENT_IDS[1], type: 'payment', amount: '₹8,900.00', failureReason: 'Stuck in pending_ack > 35min', failedAt: '13:48:12', attempts: 0, canAutoRetry: true, needsApproval: false },
  { id: 'RPL-003', intentId: MOCK_INTENT_IDS[2], type: 'payment', amount: '₹2,100.00', failureReason: 'Provider returned transient 503', failedAt: '13:42:30', attempts: 2, canAutoRetry: true, needsApproval: false },
  { id: 'RPL-004', intentId: MOCK_INTENT_IDS[3], type: 'payout', amount: '₹56,000.00', failureReason: 'Bank connectivity issue — NEFT window', failedAt: '13:38:55', attempts: 1, canAutoRetry: false, needsApproval: true },
  { id: 'RPL-005', intentId: MOCK_INTENT_IDS[4], type: 'refund', amount: '₹4,200.00', failureReason: 'Refund provider timeout', failedAt: '13:32:10', attempts: 1, canAutoRetry: true, needsApproval: false },
]

export default function ReplayCenter() {
  const [items, setItems] = useState<ReplayCandidate[]>(() => initialCandidates.map((c) => ({ ...c, state: 'ready' })))
  const [selected, setSelected] = useState<string[]>([])
  const [showConfirm, setShowConfirm] = useState(false)
  const pushToast = (title: string, desc?: string, type: 'success' | 'warning' | 'error' | 'info' = 'info') => {
    window.dispatchEvent(new CustomEvent('cx:toast', { detail: { title, desc, type } }))
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  const selectAll = () => {
    if (selected.length === items.length) {
      setSelected([])
    } else {
      setSelected(items.map(c => c.id))
    }
  }

  useEffect(() => void 0, [])

  const selectedReplayable = useMemo(() => {
    const map = new Map(items.map((i) => [i.id, i]))
    return selected.map((id) => map.get(id)).filter(Boolean) as ReplayCandidate[]
  }, [selected, items])

  const simulateReplay = async (ids: string[]) => {
    if (!ids.length) return
    setItems((prev) => prev.map((it) => (ids.includes(it.id) ? { ...it, state: 'replaying' } : it)))
    pushToast('Replay started', `Replaying ${ids.length} intent(s)…`, 'info')
    await new Promise((r) => setTimeout(r, 1100))
    setItems((prev) =>
      prev.map((it) => {
        if (!ids.includes(it.id)) return it
        return { ...it, state: 'replayed', attempts: it.attempts + 1 }
      })
    )
    pushToast('Replay queued', 'Watch DLQ / Intent Journal for updates.', 'success')
  }

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-cx-neutral">
        <Link href="/customer/intents" className="hover:text-cx-purple-600 transition-colors">Intents</Link>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        <span className="text-cx-text font-medium">Retry / Replay Center</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Retry / Replay Center</h1>
          <p className="text-sm text-cx-neutral mt-0.5">Failed or stuck intents eligible for retry</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cx-purple-50 text-cx-purple-700 border border-cx-purple-200">
            {items.length} candidates
          </span>
          {selected.length > 0 && (
            <button
              onClick={() => setShowConfirm(true)}
              className="px-4 py-1.5 text-xs font-semibold bg-cx-purple-600 text-white rounded-lg hover:bg-cx-purple-700 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg>
              Replay Selected ({selected.length})
            </button>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-cx-purple-50 border border-cx-purple-200 rounded-xl p-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-cx-purple-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-cx-purple-800">Replay creates a new intent attempt with the same idempotency key.</p>
          <p className="text-xs text-cx-purple-600 mt-0.5">All replays are logged in the audit trail. Items marked &quot;Needs Approval&quot; require supervisor sign-off.</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50">
              <th className="px-5 py-3 text-left">
                <input
                  type="checkbox"
                  checked={items.length > 0 && selected.length === items.length}
                  onChange={selectAll}
                  className="w-4 h-4 rounded border-gray-300 text-cx-purple-600 focus:ring-cx-purple-500"
                />
              </th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Intent ID</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Type</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Amount</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Failure Reason</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Attempts</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Approval</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-5 py-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    disabled={item.state !== 'ready'}
                    className="w-4 h-4 rounded border-gray-300 text-cx-purple-600 focus:ring-cx-purple-500"
                  />
                </td>
                <td className="px-5 py-3">
                  <Link href={`/customer/intents/${item.intentId}`} className="text-sm font-mono text-cx-purple-600 hover:text-cx-purple-700 hover:underline">
                    {item.intentId}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-cx-text capitalize">{item.type}</span>
                </td>
                <td className="px-5 py-3 text-sm font-mono font-medium text-cx-text tabular-nums">{item.amount}</td>
                <td className="px-5 py-3 text-xs text-cx-neutral max-w-[200px] truncate">{item.failureReason}</td>
                <td className="px-5 py-3 text-sm font-bold text-cx-text tabular-nums">{item.attempts}</td>
                <td className="px-5 py-3">
                  {item.needsApproval ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cx-orange-50 text-cx-orange-700">Needs Approval</span>
                  ) : (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cx-teal-50 text-cx-teal-700">Auto-eligible</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {item.state === 'replayed' ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cx-teal-50 text-cx-teal-700 border border-cx-teal-200">
                      Queued
                    </span>
                  ) : (
                    <button
                      disabled={item.state !== 'ready'}
                      onClick={() => void simulateReplay([item.id])}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-cx-purple-600 rounded-lg hover:bg-cx-purple-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {item.state === 'replaying' ? 'Replaying…' : 'Replay'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-cx-text">Confirm Replay</h3>
            <p className="text-sm text-cx-neutral mt-2">
              You are about to replay <span className="font-bold text-cx-text">{selected.length}</span> intent(s).
              This will create new attempts with the same idempotency keys.
            </p>
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2 text-sm font-semibold text-cx-text bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const ids = selectedReplayable
                    .filter((x) => x.state === 'ready')
                    .map((x) => x.id)
                  setShowConfirm(false)
                  setSelected([])
                  await simulateReplay(ids)
                }}
                className="flex-1 py-2 text-sm font-semibold text-white bg-cx-purple-600 rounded-lg hover:bg-cx-purple-700 transition-colors"
              >
                Confirm Replay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts are rendered in the top bar */}
    </div>
  )
}
