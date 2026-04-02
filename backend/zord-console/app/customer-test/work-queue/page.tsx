'use client'

import { useEffect, useMemo, useState } from 'react'
import { TenantIdentity } from '../_components/TenantIdentity'

type QueueTab = 'pending' | 'retries' | 'manual_review' | 'dead_letter'
type Priority = 'High' | 'Medium' | 'Low'
type JobStatus = 'Pending' | 'Processing' | 'Retrying' | 'Failed' | 'Completed' | 'Open'
type TimeRangeKey = '1H' | '6H' | '24H'

type WorkQueueJob = {
  id: string
  queue: QueueTab
  created: string
  minutesAgo: number
  jobType: string
  intentId: string
  tenant: string
  priority?: Priority
  status: JobStatus
  attempts: number
  lastError?: string
  nextRetry?: string
  reason?: string
  assigned?: string
  worker: string
  timeline: string[]
}

const TIME_RANGES: Record<TimeRangeKey, { label: string; minutes: number }> = {
  '1H': { label: 'Last 1h', minutes: 60 },
  '6H': { label: 'Last 6h', minutes: 360 },
  '24H': { label: 'Last 24h', minutes: 1440 },
}

const WORK_QUEUE_JOBS: WorkQueueJob[] = [
  {
    id: 'job_001',
    queue: 'pending',
    created: '12:03',
    minutesAgo: 2,
    jobType: 'Payout Execution',
    intentId: 'int_89321',
    tenant: 'Zomato',
    priority: 'High',
    status: 'Pending',
    attempts: 0,
    worker: 'worker_12',
    timeline: ['Job Enqueued', 'Queue Validation Complete', 'Awaiting Worker Pickup'],
  },
  {
    id: 'job_002',
    queue: 'pending',
    created: '12:01',
    minutesAgo: 4,
    jobType: 'Statement Parse',
    intentId: 'int_89319',
    tenant: 'Swiggy',
    priority: 'Medium',
    status: 'Pending',
    attempts: 0,
    worker: 'worker_7',
    timeline: ['File Received', 'Parser Task Created', 'Awaiting Worker Pickup'],
  },
  {
    id: 'job_003',
    queue: 'pending',
    created: '11:57',
    minutesAgo: 8,
    jobType: 'Reconciliation Sync',
    intentId: 'int_89316',
    tenant: 'Flipkart',
    priority: 'Low',
    status: 'Processing',
    attempts: 1,
    worker: 'worker_4',
    timeline: ['Job Enqueued', 'Worker Started', 'Matching Ledger Entries'],
  },
  {
    id: 'job_011',
    queue: 'pending',
    created: '11:53',
    minutesAgo: 12,
    jobType: 'Settlement Dispatch',
    intentId: 'int_89315',
    tenant: 'Amazon',
    priority: 'High',
    status: 'Pending',
    attempts: 0,
    worker: 'worker_10',
    timeline: ['Settlement Ready', 'Dispatch Job Created', 'Awaiting Worker Pickup'],
  },
  {
    id: 'job_012',
    queue: 'pending',
    created: '11:49',
    minutesAgo: 16,
    jobType: 'Dispute Sync',
    intentId: 'int_89310',
    tenant: 'Ajio',
    priority: 'Medium',
    status: 'Processing',
    attempts: 1,
    worker: 'worker_1',
    timeline: ['Dispute Event Received', 'Sync Job Started', 'Waiting on Provider ACK'],
  },
  {
    id: 'job_013',
    queue: 'pending',
    created: '11:41',
    minutesAgo: 24,
    jobType: 'Payout Audit Trail',
    intentId: 'int_89301',
    tenant: 'Zomato',
    priority: 'Low',
    status: 'Pending',
    attempts: 0,
    worker: 'worker_12',
    timeline: ['Audit Triggered', 'Trail Generation Queued', 'Awaiting Worker Pickup'],
  },
  {
    id: 'job_014',
    queue: 'pending',
    created: '11:37',
    minutesAgo: 28,
    jobType: 'Balance Snapshot',
    intentId: 'int_89298',
    tenant: 'Zomato',
    priority: 'Medium',
    status: 'Pending',
    attempts: 0,
    worker: 'worker_7',
    timeline: ['Snapshot Request Received', 'Snapshot Job Queued', 'Awaiting Worker Pickup'],
  },
  {
    id: 'job_004',
    queue: 'retries',
    created: '11:59',
    minutesAgo: 6,
    jobType: 'Webhook Delivery',
    intentId: 'int_89324',
    tenant: 'Zomato',
    status: 'Retrying',
    attempts: 3,
    lastError: 'DELIVERY_FAILED',
    nextRetry: '2m',
    worker: 'worker_8',
    timeline: ['Webhook Attempt 1 → 500 Error', 'Webhook Attempt 2 → Timeout', 'Webhook Attempt 3 → 500 Error'],
  },
  {
    id: 'job_005',
    queue: 'retries',
    created: '11:55',
    minutesAgo: 10,
    jobType: 'Provider Call',
    intentId: 'int_89318',
    tenant: 'Swiggy',
    status: 'Retrying',
    attempts: 2,
    lastError: 'PROVIDER_TIMEOUT',
    nextRetry: '5m',
    worker: 'worker_3',
    timeline: ['Provider Call 1 → Timeout', 'Provider Call 2 → Timeout', 'Retry Scheduled'],
  },
  {
    id: 'job_006',
    queue: 'retries',
    created: '11:48',
    minutesAgo: 17,
    jobType: 'Adapter Poll',
    intentId: 'int_89311',
    tenant: 'Amazon',
    status: 'Retrying',
    attempts: 4,
    lastError: 'AUTH_FAILURE',
    nextRetry: '8m',
    worker: 'worker_2',
    timeline: ['Poll Attempt 1 → 401', 'Credential Refresh Triggered', 'Poll Attempt 4 → 401'],
  },
  {
    id: 'job_007',
    queue: 'manual_review',
    created: '11:50',
    minutesAgo: 15,
    jobType: 'Reconciliation Conflict',
    intentId: 'int_89312',
    tenant: 'Zomato',
    status: 'Open',
    attempts: 1,
    reason: 'AMOUNT_MISMATCH',
    assigned: 'Ops Team',
    worker: 'worker_11',
    timeline: ['Auto Reconciliation Failed', 'Conflict Rule Triggered', 'Manual Review Created'],
  },
  {
    id: 'job_008',
    queue: 'manual_review',
    created: '11:44',
    minutesAgo: 21,
    jobType: 'Compliance Review',
    intentId: 'int_89303',
    tenant: 'Ajio',
    status: 'Open',
    attempts: 0,
    reason: 'KYC_REFRESH_REQUIRED',
    assigned: 'Risk Ops',
    worker: 'worker_6',
    timeline: ['Risk Rule Triggered', 'KYC Staleness Detected', 'Case Assigned'],
  },
  {
    id: 'job_009',
    queue: 'dead_letter',
    created: '11:30',
    minutesAgo: 35,
    jobType: 'Webhook Delivery',
    intentId: 'int_89305',
    tenant: 'Swiggy',
    status: 'Failed',
    attempts: 10,
    lastError: 'ENDPOINT_UNREACHABLE',
    worker: 'worker_9',
    timeline: ['10 delivery attempts exhausted', 'Backoff max reached', 'Moved to DLQ'],
  },
  {
    id: 'job_010',
    queue: 'dead_letter',
    created: '11:18',
    minutesAgo: 47,
    jobType: 'Settlement Reconcile',
    intentId: 'int_89296',
    tenant: 'Flipkart',
    status: 'Failed',
    attempts: 8,
    lastError: 'LEDGER_HASH_MISMATCH',
    worker: 'worker_5',
    timeline: ['Hash mismatch on retry 6', 'Secondary verification failed', 'Moved to DLQ'],
  },
  {
    id: 'job_015',
    queue: 'dead_letter',
    created: '11:12',
    minutesAgo: 53,
    jobType: 'Provider Reconcile',
    intentId: 'int_89290',
    tenant: 'Flipkart',
    status: 'Failed',
    attempts: 9,
    lastError: 'CONNECTOR_DISCONNECTED',
    worker: 'worker_4',
    timeline: ['Retry budget exhausted', 'Connector still unavailable', 'Moved to DLQ'],
  },
]

const TAB_META: Record<QueueTab, { label: string }> = {
  pending: { label: 'Pending' },
  retries: { label: 'Retries' },
  manual_review: { label: 'Manual Review' },
  dead_letter: { label: 'Dead Letter' },
}

function priorityBadgeClass(priority: Priority) {
  if (priority === 'High') return 'border-[#FB923C] bg-[#FFF7ED] text-[#9A3412] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]'
  if (priority === 'Medium') return 'border-[#818CF8] bg-[#EEF2FF] text-[#3730A3] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]'
  return 'border-[#5EEAD4] bg-[#F0FDFA] text-[#115E59] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]'
}

function statusBadgeClass(status: JobStatus) {
  if (status === 'Pending') return 'border-[#93C5FD] bg-[#EFF6FF] text-[#1D4ED8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]'
  if (status === 'Processing') return 'border-[#5EEAD4] bg-[#F0FDFA] text-[#0F766E] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]'
  if (status === 'Retrying') return 'border-[#FDBA74] bg-[#FFF7ED] text-[#B45309] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]'
  if (status === 'Failed') return 'border-[#FDA4AF] bg-[#FFF1F2] text-[#BE123C] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]'
  if (status === 'Completed') return 'border-[#86EFAC] bg-[#F0FDF4] text-[#15803D] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]'
  return 'border-[#C4B5FD] bg-[#F5F3FF] text-[#6D28D9] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]'
}

export default function WorkQueuePage() {
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('24H')
  const [tab, setTab] = useState<QueueTab>('pending')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string>(WORK_QUEUE_JOBS[0]?.id ?? '')
  const [lastAction, setLastAction] = useState<string>('')

  const tabCounts = useMemo(
    () => ({
      pending: WORK_QUEUE_JOBS.filter((job) => job.queue === 'pending').length,
      retries: WORK_QUEUE_JOBS.filter((job) => job.queue === 'retries').length,
      manual_review: WORK_QUEUE_JOBS.filter((job) => job.queue === 'manual_review').length,
      dead_letter: WORK_QUEUE_JOBS.filter((job) => job.queue === 'dead_letter').length,
    }),
    []
  )
  const queueHealth = useMemo(
    () => [
      { label: 'Pending Jobs', value: String(tabCounts.pending), queue: 'pending' as QueueTab },
      { label: 'Retry Jobs', value: String(tabCounts.retries), queue: 'retries' as QueueTab },
      { label: 'Manual Review', value: String(tabCounts.manual_review), queue: 'manual_review' as QueueTab },
      { label: 'Dead Letter Queue', value: String(tabCounts.dead_letter), queue: 'dead_letter' as QueueTab },
      { label: 'Workers Active', value: String(new Set(WORK_QUEUE_JOBS.map((job) => job.worker)).size) },
    ],
    [tabCounts]
  )

  const rows = useMemo(() => {
    const minutes = TIME_RANGES[timeRange].minutes
    const normalized = query.trim().toLowerCase()
    return WORK_QUEUE_JOBS.filter((job) => {
      if (job.queue !== tab) return false
      if (job.minutesAgo > minutes) return false
      if (!normalized) return true
      return `${job.jobType} ${job.intentId} ${job.tenant} ${job.worker} ${job.lastError || ''} ${job.reason || ''}`
        .toLowerCase()
        .includes(normalized)
    })
  }, [query, tab, timeRange])

  const selected = rows.find((job) => job.id === selectedId) ?? rows[0] ?? null

  useEffect(() => {
    if (!rows.length) {
      setSelectedId('')
      return
    }
    if (!selectedId || !rows.some((job) => job.id === selectedId)) {
      setSelectedId(rows[0].id)
    }
  }, [rows, selectedId])

  const triggerAction = (action: string) => {
    if (!selected) return
    setLastAction(`${action} queued for ${selected.intentId} (${selected.jobType})`)
  }

  return (
    <div className="w-full p-6 lg:p-8">
      <main className="ct-main-panel mt-1 overflow-hidden">
        <section className="rounded-t-[28px] border-b border-white/20 bg-[linear-gradient(180deg,rgba(44,49,57,0.96)_0%,rgba(35,39,46,0.98)_100%)] px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight">Work Queue</h1>
              <p className="mt-1 text-base text-slate-200">Scan, prioritize, and act on pending, retrying, and manual operations work.</p>
            </div>
            <button className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.28)] transition duration-200 ease-out hover:-translate-y-[1px] hover:bg-white/15">
              Refresh Queue
            </button>
          </div>
        </section>

        <section className="px-6 pb-7 pt-5">
          <section className="grid gap-3 md:grid-cols-5">
            {queueHealth.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  if (!('queue' in item)) return
                  setTab(item.queue)
                }}
                className={`rounded-xl border p-3 text-left text-base text-slate-700 shadow-[0_14px_28px_rgba(15,23,42,0.1),0_4px_10px_rgba(15,23,42,0.06)] ${
                  'queue' in item
                    ? `cursor-pointer transition hover:-translate-y-[1px] ${
                        tab === item.queue ? 'border-slate-500 bg-slate-200' : 'border-slate-200 bg-slate-50'
                      }`
                    : 'cursor-default border-slate-200 bg-slate-50'
                }`}
              >
                <span className="font-medium">{item.label}</span>
                <span className="float-right font-semibold">{item.value}</span>
              </button>
            ))}
          </section>

          <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-[0_10px_22px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(TAB_META) as QueueTab[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                    tab === key
                      ? 'border-slate-700 bg-slate-700 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {TAB_META[key].label} ({tabCounts[key]})
                </button>
              ))}
            </div>
          </section>

          <section className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_170px]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search intent_id / tenant / job type / worker"
              className="h-12 rounded-xl border border-slate-200 bg-white/95 px-3 text-base text-slate-700 outline-none shadow-[0_6px_14px_rgba(15,23,42,0.06)] transition focus:border-slate-400"
            />
            <select
              value={timeRange}
              onChange={(event) => setTimeRange(event.target.value as TimeRangeKey)}
              className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-700 outline-none shadow-[0_6px_14px_rgba(15,23,42,0.06)] transition"
            >
              {Object.entries(TIME_RANGES).map(([key, range]) => (
                <option key={key} value={key}>
                  Time: {range.label}
                </option>
              ))}
            </select>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
            <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h2 className="text-base font-semibold uppercase tracking-wider text-slate-700">Queue Backlog</h2>
                <span className="text-sm text-slate-500">{TAB_META[tab].label} view</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-[#f8fafc] px-4 py-3">
                <p className="text-sm text-slate-600">
                  Showing <span className="font-semibold text-slate-700">{rows.length}</span> jobs
                </p>
                <button className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-slate-700">Manage Columns</button>
              </div>
              <div className="ct-sidebar-scroll overflow-auto">
                <table className="min-w-[1080px] w-full text-left text-base">
                  <thead className="bg-gray-50 text-sm uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">
                        <input type="checkbox" aria-label="Select all jobs" className="h-4 w-4 rounded border-gray-300" />
                      </th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">{tab === 'manual_review' ? 'Case Type' : 'Job Type'}</th>
                      <th className="px-4 py-3">Intent ID</th>
                      <th className="px-4 py-3">Tenant</th>
                      {tab === 'pending' ? <th className="px-4 py-3">Priority</th> : null}
                      {tab !== 'manual_review' ? <th className="px-4 py-3">Status</th> : null}
                      <th className="px-4 py-3">Attempts</th>
                      {tab === 'retries' || tab === 'dead_letter' ? <th className="px-4 py-3">{tab === 'retries' ? 'Last Error' : 'Error'}</th> : null}
                      {tab === 'retries' ? <th className="px-4 py-3">Next Retry</th> : null}
                      {tab === 'manual_review' ? <th className="px-4 py-3">Reason</th> : null}
                      {tab === 'manual_review' ? <th className="px-4 py-3">Assigned</th> : null}
                      {tab !== 'manual_review' ? <th className="px-4 py-3">Worker</th> : null}
                      <th className="px-4 py-3">{tab === 'manual_review' ? 'Action' : 'Inspect'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((job) => (
                      <tr
                        key={job.id}
                        onClick={() => setSelectedId(job.id)}
                        className={`cursor-pointer border-t border-gray-100 text-sm text-gray-700 ${
                          job.id === selected?.id ? 'bg-[#EEF2FF]' : 'hover:bg-gray-50/70'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input type="checkbox" aria-label={`Select ${job.id}`} className="h-4 w-4 rounded border-gray-300" />
                        </td>
                        <td className="px-4 py-3">{job.created}</td>
                        <td className="px-4 py-3">{job.jobType}</td>
                        <td className="px-4 py-3 font-mono">{job.intentId}</td>
                        <td className="px-4 py-3"><TenantIdentity tenant={job.tenant} /></td>
                        {tab === 'pending' ? (
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${priorityBadgeClass(job.priority || 'Low')}`}>
                              {job.priority || 'Low'}
                            </span>
                          </td>
                        ) : null}
                        {tab !== 'manual_review' ? (
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(job.status)}`}>{job.status}</span>
                          </td>
                        ) : null}
                        <td className="px-4 py-3">{job.attempts}</td>
                        {tab === 'retries' || tab === 'dead_letter' ? <td className="px-4 py-3 font-semibold">{job.lastError}</td> : null}
                        {tab === 'retries' ? <td className="px-4 py-3">{job.nextRetry}</td> : null}
                        {tab === 'manual_review' ? <td className="px-4 py-3">{job.reason}</td> : null}
                        {tab === 'manual_review' ? <td className="px-4 py-3">{job.assigned}</td> : null}
                        {tab !== 'manual_review' ? <td className="px-4 py-3">{job.worker}</td> : null}
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedId(job.id)
                            }}
                            className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-700 shadow-[0_4px_10px_rgba(15,23,42,0.08)] transition hover:bg-gray-100 hover:shadow-[0_8px_16px_rgba(15,23,42,0.12)]"
                          >
                            {tab === 'manual_review' ? 'Review' : tab === 'pending' ? 'View' : 'Debug'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!rows.length ? (
                      <tr>
                        <td className="px-4 py-6 text-sm text-slate-500" colSpan={13}>
                          No queue items found for current filters.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>

            <aside className="sticky top-24 h-fit rounded-2xl border border-white/15 bg-[linear-gradient(180deg,rgba(44,49,57,0.94)_0%,rgba(35,39,46,0.96)_100%)] p-4 text-slate-100 shadow-[0_24px_50px_rgba(15,23,42,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
              <h2 className="text-base font-semibold uppercase tracking-wider text-slate-100">Job Detail</h2>
              {!selected ? (
                <p className="mt-3 text-sm text-slate-300">Select a job from the queue to inspect and act.</p>
              ) : (
                <div className="mt-3 space-y-3 text-sm text-slate-200">
                  <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"><span className="font-semibold text-white">Job Type:</span> {selected.jobType}</div>
                  <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"><span className="font-semibold text-white">Intent ID:</span> <span className="font-mono">{selected.intentId}</span></div>
                  <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                    <span className="font-semibold text-white">Tenant:</span>{' '}
                    <span className="inline-flex align-middle"><TenantIdentity tenant={selected.tenant} /></span>
                  </div>
                  <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"><span className="font-semibold text-white">Status:</span> {selected.status}</div>
                  <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"><span className="font-semibold text-white">Attempts:</span> {selected.attempts}</div>
                  <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"><span className="font-semibold text-white">Worker:</span> {selected.worker}</div>
                  {selected.lastError ? (
                    <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"><span className="font-semibold text-white">Last Error:</span> {selected.lastError}</div>
                  ) : null}
                  {selected.nextRetry ? (
                    <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"><span className="font-semibold text-white">Next Retry:</span> {selected.nextRetry}</div>
                  ) : null}
                  <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                    <p className="font-semibold text-white">Execution Timeline</p>
                    <p className="mt-1 text-xs text-slate-300">{selected.timeline.join(' → ')}</p>
                  </div>

                  <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                    <p className="font-semibold text-white">Operator Actions</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => triggerAction('Retry Job')} className="rounded-md border border-white/25 bg-white/10 px-2 py-1.5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(15,23,42,0.2)] transition hover:bg-white/20">Retry Job</button>
                      <button type="button" onClick={() => triggerAction('Cancel Job')} className="rounded-md border border-white/25 bg-white/10 px-2 py-1.5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(15,23,42,0.2)] transition hover:bg-white/20">Cancel Job</button>
                      <button type="button" onClick={() => triggerAction('Reassign Worker')} className="rounded-md border border-white/25 bg-white/10 px-2 py-1.5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(15,23,42,0.2)] transition hover:bg-white/20">Reassign Worker</button>
                      <button type="button" onClick={() => triggerAction('Move to Dead Letter')} className="rounded-md border border-white/25 bg-white/10 px-2 py-1.5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(15,23,42,0.2)] transition hover:bg-white/20">Move to DLQ</button>
                      <button type="button" onClick={() => triggerAction('Escalate to Manual Review')} className="col-span-2 rounded-md border border-white/25 bg-white/10 px-2 py-1.5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(15,23,42,0.2)] transition hover:bg-white/20">Escalate to Manual Review</button>
                    </div>
                    {lastAction ? <p className="mt-2 text-xs text-slate-300">{lastAction}</p> : null}
                  </div>
                </div>
              )}
            </aside>
          </section>
        </section>
      </main>
    </div>
  )
}
