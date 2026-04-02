'use client'

import { useEffect, useMemo, useState } from 'react'
import { TenantIdentity } from '../../_components/TenantIdentity'
import { IntegrationsTabs } from '../_components/IntegrationsTabs'
import { TIME_RANGES, TimeRangeKey, WEBHOOK_EVENTS, stringifyMasked, type WebhookEntry } from '../_lib/mock'

type ProviderFilter = 'ALL' | 'Stripe' | 'Razorpay' | 'Cashfree'
type DeliveryStatus = 'ALL' | 'Delivered' | 'Failed' | 'Rejected'

function providerBadgeClass(provider: WebhookEntry['provider']) {
  if (provider === 'Stripe') return 'border-slate-200 bg-slate-50 text-slate-600'
  if (provider === 'Razorpay') return 'border-slate-300 bg-slate-100 text-slate-700'
  return 'border-slate-400 bg-slate-200 text-slate-800'
}

function deliveryBadgeClass(status: WebhookEntry['status']) {
  void status
  return 'border-slate-200 bg-slate-100 text-slate-700'
}

function signatureBadgeClass(signature: WebhookEntry['signatureVerification']) {
  return signature === 'Valid' ? 'border-slate-200 bg-slate-100 text-slate-700' : 'border-slate-400 bg-slate-200 text-slate-900'
}

function responseTextClass(response: string) {
  if (response.includes('200')) return 'text-slate-500'
  if (response.includes('401') || response.includes('4')) return 'text-slate-700'
  return 'text-slate-900'
}

export default function IntegrationsWebhooksPage() {
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus>('ALL')
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('1H')
  const [selectedId, setSelectedId] = useState<string>(WEBHOOK_EVENTS[0]?.id ?? '')

  const filteredRows = useMemo(() => {
    const rangeMinutes = TIME_RANGES[timeRange].minutes
    return WEBHOOK_EVENTS.filter((row) => {
      if (row.minutesAgo > rangeMinutes) return false
      if (providerFilter !== 'ALL' && row.provider !== providerFilter) return false
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false
      return true
    })
  }, [providerFilter, statusFilter, timeRange])
  const selected = filteredRows.find((row) => row.id === selectedId) ?? filteredRows[0] ?? null

  useEffect(() => {
    if (filteredRows.length === 0) {
      setSelectedId('')
      return
    }
    if (!selectedId || !filteredRows.some((row) => row.id === selectedId)) {
      setSelectedId(filteredRows[0].id)
    }
  }, [filteredRows, selectedId])

  const success = WEBHOOK_EVENTS.filter((row) => row.status === 'Delivered').length
  const failed = WEBHOOK_EVENTS.filter((row) => row.status !== 'Delivered').length
  const successRate = `${((success / WEBHOOK_EVENTS.length) * 100).toFixed(1)}%`
  const avgRetry = (
    WEBHOOK_EVENTS.reduce((acc, row) => acc + row.attempts, 0) / WEBHOOK_EVENTS.length
  ).toFixed(1)

  return (
    <div className="w-full p-6 lg:p-8">
      <main className="ct-main-panel mt-1 overflow-hidden">
        <section className="rounded-t-[28px] border-b border-white/20 bg-[linear-gradient(180deg,rgba(44,49,57,0.96)_0%,rgba(35,39,46,0.98)_100%)] px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight">Webhooks</h1>
              <p className="mt-1 text-sm text-slate-200">Delivery reliability monitoring with signature and payload inspection.</p>
            </div>
            <button className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.28)] transition duration-200 ease-out hover:-translate-y-[1px] hover:bg-white/15 hover:shadow-[0_16px_28px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.32)] active:translate-y-[1px]">
              Delivery Report
            </button>
          </div>
        </section>

        <section className="px-6 pb-7 pt-5">
          <IntegrationsTabs />

          <section className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value as ProviderFilter)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none shadow-[0_6px_14px_rgba(15,23,42,0.06)] transition focus:shadow-[0_10px_18px_rgba(15,23,42,0.1)]"
            >
              <option value="ALL">Provider: All</option>
              <option value="Stripe">Stripe</option>
              <option value="Razorpay">Razorpay</option>
              <option value="Cashfree">Cashfree</option>
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as DeliveryStatus)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none shadow-[0_6px_14px_rgba(15,23,42,0.06)] transition focus:shadow-[0_10px_18px_rgba(15,23,42,0.1)]"
            >
              <option value="ALL">Status: All</option>
              <option value="Delivered">Delivered</option>
              <option value="Failed">Failed</option>
              <option value="Rejected">Rejected</option>
            </select>
            <select
              value={timeRange}
              onChange={(event) => setTimeRange(event.target.value as TimeRangeKey)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none shadow-[0_6px_14px_rgba(15,23,42,0.06)] transition focus:shadow-[0_10px_18px_rgba(15,23,42,0.1)]"
            >
              {Object.entries(TIME_RANGES).map(([key, range]) => (
                <option key={key} value={key}>
                  Time: {range.label}
                </option>
              ))}
            </select>
          </section>

          <section className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 shadow-[0_14px_28px_rgba(15,23,42,0.1),0_4px_10px_rgba(15,23,42,0.06)]">
              <span className="font-medium">Success Rate</span>
              <span className="font-semibold">{successRate}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 shadow-[0_14px_28px_rgba(15,23,42,0.1),0_4px_10px_rgba(15,23,42,0.06)]">
              <span className="font-medium">Failed Events</span>
              <span className="font-semibold">{failed}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 shadow-[0_14px_28px_rgba(15,23,42,0.1),0_4px_10px_rgba(15,23,42,0.06)]">
              <span className="font-medium">Avg Retry Count</span>
              <span className="font-semibold">{avgRetry}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 shadow-[0_14px_28px_rgba(15,23,42,0.1),0_4px_10px_rgba(15,23,42,0.06)]">
              <span className="font-medium">Secret Rotation</span>
              <span className="font-semibold">Enabled</span>
            </div>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="ct-sidebar-scroll overflow-auto">
            <table className="min-w-[920px] w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Attempts</th>
                  <th className="px-4 py-3">Response</th>
                  <th className="px-4 py-3">Inspect</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={`border-t border-gray-100 text-xs text-gray-700 ${
                      row.id === selected?.id ? 'bg-slate-100/80' : 'hover:bg-gray-50/70'
                    } cursor-pointer`}
                  >
                    <td className="px-4 py-3">{row.time}</td>
                    <td className="px-4 py-3 font-mono">{row.event}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${providerBadgeClass(row.provider)}`}>{row.provider}</span>
                    </td>
                    <td className="px-4 py-3"><TenantIdentity tenant={row.tenant} /></td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${deliveryBadgeClass(row.status)}`}>{row.status}</span>
                    </td>
                    <td className="px-4 py-3">{row.attempts}</td>
                    <td className={`px-4 py-3 font-semibold ${responseTextClass(row.response)}`}>{row.response}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelectedId(row.id)
                        }}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            </article>

            <aside className="ct-frost-card sticky top-24 h-fit rounded-2xl p-4 shadow-[0_18px_36px_rgba(15,23,42,0.14),0_4px_12px_rgba(15,23,42,0.08)]">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">Webhook Inspector</h2>
            {!selected ? (
              <p className="mt-3 text-sm text-slate-600">Select a webhook event to inspect details.</p>
            ) : (
              <div className="mt-3 space-y-3 text-xs text-slate-700">
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3"><span className="font-semibold">Event:</span> {selected.event}</div>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3">
                  <span className="font-semibold">Provider:</span>{' '}
                  <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${providerBadgeClass(selected.provider)}`}>{selected.provider}</span>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3"><span className="font-semibold">Tenant:</span> {selected.tenant}</div>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3">
                  <span className="font-semibold">Status:</span>{' '}
                  <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${deliveryBadgeClass(selected.status)}`}>{selected.status}</span>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3"><span className="font-semibold">Delivery Attempts:</span> {selected.attempts}</div>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3">
                  <span className="font-semibold">Signature Verification:</span>{' '}
                  <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${signatureBadgeClass(selected.signatureVerification)}`}>
                    {selected.signatureVerification}
                  </span>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3"><span className="font-semibold">Endpoint:</span> {selected.endpoint}</div>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3">
                  <span className="font-semibold">Response:</span> <span className={responseTextClass(selected.response)}>{selected.response}</span>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3">
                  <p className="font-semibold">Payload</p>
                  <pre className="mt-2 overflow-x-auto text-[11px]">{stringifyMasked(selected.payload)}</pre>
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
