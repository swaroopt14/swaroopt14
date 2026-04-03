'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MOCK_INTENT_IDS } from '../mock'

type Priority = 'critical' | 'high' | 'medium' | 'low'
type WorkItemStatus = 'pending' | 'in_progress' | 'resolved'

interface WorkItem {
  id: string
  title: string
  description: string
  priority: Priority
  status: WorkItemStatus
  category: string
  age: string
  assignee?: string
  intentId?: string
}

const workItems: WorkItem[] = [
  { id: 'WQ-001', title: 'Webhook endpoint returning 503', description: '/webhooks/payment-status consistently failing', priority: 'critical', status: 'pending', category: 'Webhook', age: '2m', intentId: MOCK_INTENT_IDS[0] },
  { id: 'WQ-002', title: 'SLA breach on P95 ack latency', description: 'P95 ack latency at 480ms, threshold 450ms', priority: 'critical', status: 'in_progress', category: 'SLA', age: '15m', assignee: 'ops@acmepay.com' },
  { id: 'WQ-003', title: 'Schema validation spike', description: '47 intents failed payment_v3 schema in 1h', priority: 'high', status: 'pending', category: 'Validation', age: '45m' },
  { id: 'WQ-004', title: 'Settlement file delayed', description: 'Bank file processing lagging by 15+ min', priority: 'high', status: 'pending', category: 'Settlement', age: '22m' },
  { id: 'WQ-005', title: 'Stuck intent needs replay', description: 'Intent pending_ack > 35 minutes', priority: 'medium', status: 'pending', category: 'Replay', age: '35m', intentId: MOCK_INTENT_IDS[1] },
  { id: 'WQ-006', title: 'Discrepancy detected', description: 'Provider says success, bank file missing for 2 intents', priority: 'high', status: 'pending', category: 'Recon', age: '1h' },
  { id: 'WQ-007', title: 'Evidence pack generation failed', description: 'EP-2850 failed: missing vault hash', priority: 'medium', status: 'pending', category: 'Evidence', age: '52m' },
  { id: 'WQ-008', title: 'API rate limit approaching', description: '85% of rate limit consumed for /v1/intents', priority: 'low', status: 'pending', category: 'API', age: '2h' },
  { id: 'WQ-009', title: 'Refund intent timeout', description: 'Provider timeout after 30s', priority: 'medium', status: 'pending', category: 'Timeout', age: '38m', intentId: MOCK_INTENT_IDS[2] },
  { id: 'WQ-010', title: 'Duplicate intent detected', description: 'Possible duplicate for merchant_ref MR-88921', priority: 'low', status: 'resolved', category: 'Idempotency', age: '3h' },
  { id: 'WQ-011', title: 'Certificate expiry warning', description: 'mTLS cert for adapter_razorpay expires in 7 days', priority: 'low', status: 'pending', category: 'Security', age: '6h' },
  { id: 'WQ-012', title: 'Provider error spike', description: 'HDFC adapter returning 429 (rate limited)', priority: 'high', status: 'in_progress', category: 'Provider', age: '10m', assignee: 'ops@acmepay.com' },
]

const priorityConfig: Record<Priority, { label: string; color: string; dot: string }> = {
  critical: { label: 'Critical', color: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  high: { label: 'High', color: 'bg-cx-orange-50 text-cx-orange-700 border-cx-orange-200', dot: 'bg-cx-orange-500' },
  medium: { label: 'Medium', color: 'bg-cx-purple-50 text-cx-purple-700 border-cx-purple-200', dot: 'bg-cx-purple-500' },
  low: { label: 'Low', color: 'bg-gray-50 text-gray-600 border-gray-200', dot: 'bg-gray-400' },
}

export default function WorkQueuePage() {
  const [filter, setFilter] = useState<'all' | Priority>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | WorkItemStatus>('all')

  const filtered = workItems.filter(item => {
    if (filter !== 'all' && item.priority !== filter) return false
    if (statusFilter !== 'all' && item.status !== statusFilter) return false
    return true
  })

  const counts = {
    critical: workItems.filter(i => i.priority === 'critical' && i.status !== 'resolved').length,
    high: workItems.filter(i => i.priority === 'high' && i.status !== 'resolved').length,
    medium: workItems.filter(i => i.priority === 'medium' && i.status !== 'resolved').length,
    low: workItems.filter(i => i.priority === 'low' && i.status !== 'resolved').length,
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Work Queue</h1>
          <p className="text-sm text-cx-neutral mt-0.5">Actionable items requiring attention</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {Object.entries(counts).map(([priority, count]) => (
              <span key={priority} className={`px-2 py-1 text-[10px] font-bold rounded-full border ${priorityConfig[priority as Priority].color}`}>
                {count} {priority}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${
                filter === f ? 'bg-white text-cx-text shadow-sm' : 'text-cx-neutral hover:text-cx-text'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {(['all', 'pending', 'in_progress', 'resolved'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                statusFilter === f ? 'bg-white text-cx-text shadow-sm' : 'text-cx-neutral hover:text-cx-text'
              }`}
            >
              {f === 'all' ? 'All Status' : f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-xs text-cx-neutral ml-auto">{filtered.length} items</span>
      </div>

      {/* Work Items */}
      <div className="space-y-2">
        {filtered.map((item) => (
          <div
            key={item.id}
            className={`bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md hover:border-cx-purple-100 transition-all ${
              item.status === 'resolved' ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${priorityConfig[item.priority].dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-cx-neutral">{item.id}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${priorityConfig[item.priority].color}`}>
                    {priorityConfig[item.priority].label}
                  </span>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-cx-text">{item.category}</span>
                  {item.status === 'in_progress' && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cx-purple-100 text-cx-purple-700">In Progress</span>
                  )}
                  {item.status === 'resolved' && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cx-teal-50 text-cx-teal-700">Resolved</span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-cx-text mt-1">{item.title}</h3>
                <p className="text-xs text-cx-neutral mt-0.5">{item.description}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-[10px] text-cx-neutral">Created {item.age} ago</span>
                  {item.assignee && (
                    <span className="text-[10px] text-cx-purple-600">Assigned: {item.assignee}</span>
                  )}
                  {item.intentId && (
                    <Link href={`/customer/intents/${item.intentId}`} className="text-[10px] font-mono text-cx-purple-600 hover:underline">
                      {item.intentId}
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {item.status !== 'resolved' && (
                  <>
                    <button className="px-3 py-1.5 text-xs font-semibold text-cx-purple-600 bg-cx-purple-50 border border-cx-purple-200 rounded-lg hover:bg-cx-purple-100 transition-colors">
                      Investigate
                    </button>
                    <button className="px-3 py-1.5 text-xs font-semibold text-cx-text bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      Dismiss
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
