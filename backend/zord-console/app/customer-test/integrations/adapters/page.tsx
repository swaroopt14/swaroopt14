'use client'

import Image from 'next/image'
import { useState } from 'react'
import { IntegrationsTabs } from '../_components/IntegrationsTabs'
import { ADAPTER_STATUS, type AdapterStatusEntry } from '../_lib/mock'

function statusBadgeClass(status: AdapterStatusEntry['status']) {
  if (status === 'Healthy') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function errorRateTextClass(rate: string) {
  const numeric = Number.parseFloat(rate.replace('%', ''))
  if (numeric >= 2) return 'text-rose-700'
  if (numeric >= 1) return 'text-amber-700'
  return 'text-emerald-700'
}

function errorCodeBadgeClass(errorCode: string) {
  if (errorCode === 'SUCCESS') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (errorCode === 'PROVIDER_TIMEOUT') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (errorCode === 'AUTH_FAILURE') return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-indigo-200 bg-indigo-50 text-indigo-700'
}

function logoSizeClass(sourceLogo: string) {
  if (sourceLogo.includes('razorpay')) return 'h-8 w-auto max-w-[130px]'
  if (sourceLogo.includes('hdfc')) return 'h-8 w-auto max-w-[130px]'
  if (sourceLogo.includes('mastercard')) return 'h-8 w-auto max-w-[110px]'
  if (sourceLogo.includes('sbi')) return 'h-7 w-auto max-w-[100px]'
  return 'h-8 w-auto max-w-[120px]'
}

function rowHighlightClass(status: AdapterStatusEntry['status']) {
  if (status === 'Healthy') return 'hover:bg-emerald-50/45'
  return 'hover:bg-amber-50/50'
}

export default function IntegrationsAdaptersPage() {
  const [selectedId, setSelectedId] = useState<string>(ADAPTER_STATUS[0]?.id ?? '')
  const selected = ADAPTER_STATUS.find((row) => row.id === selectedId) ?? ADAPTER_STATUS[0] ?? null

  return (
    <div className="w-full p-6 lg:p-8">
      <main className="ct-main-panel mt-1 overflow-hidden">
        <section className="rounded-t-[28px] border-b border-white/20 bg-[linear-gradient(180deg,rgba(44,49,57,0.96)_0%,rgba(35,39,46,0.98)_100%)] px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight">Adapter Status</h1>
              <p className="mt-1 text-sm text-slate-200">Provider connectivity and operational health monitoring.</p>
            </div>
            <button className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.28)] transition duration-200 ease-out hover:-translate-y-[1px] hover:bg-white/15 hover:shadow-[0_16px_28px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.32)] active:translate-y-[1px]">
              Incident View
            </button>
          </div>
        </section>

        <section className="px-6 pb-7 pt-5">
          <IntegrationsTabs />

          <section className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 shadow-[0_14px_28px_rgba(15,23,42,0.1),0_4px_10px_rgba(15,23,42,0.06)]">
              <span className="font-medium">Healthy</span>
              <span className="float-right font-semibold">{ADAPTER_STATUS.filter((item) => item.status === 'Healthy').length}</span>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 shadow-[0_14px_28px_rgba(15,23,42,0.1),0_4px_10px_rgba(15,23,42,0.06)]">
              <span className="font-medium">Degraded</span>
              <span className="float-right font-semibold">{ADAPTER_STATUS.filter((item) => item.status === 'Degraded').length}</span>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800 shadow-[0_14px_28px_rgba(15,23,42,0.1),0_4px_10px_rgba(15,23,42,0.06)]">
              <span className="font-medium">Tracked Providers</span>
              <span className="float-right font-semibold">{ADAPTER_STATUS.length}</span>
            </div>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="ct-sidebar-scroll overflow-auto">
            <table className="min-w-[920px] w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Rail</th>
                  <th className="px-4 py-3">Error Rate</th>
                  <th className="px-4 py-3">Last Event</th>
                  <th className="px-4 py-3">Latency</th>
                  <th className="px-4 py-3">Inspect</th>
                </tr>
              </thead>
              <tbody>
                {ADAPTER_STATUS.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={`border-t border-gray-100 text-xs text-gray-700 ${
                      row.id === selected?.id ? 'bg-indigo-50/55' : rowHighlightClass(row.status)
                    } cursor-pointer`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-11 w-32 items-center justify-center rounded-lg border border-slate-200 bg-white px-1">
                          <Image
                            src={row.sourceLogo}
                            alt={row.adapter}
                            width={120}
                            height={36}
                            className={`object-contain ${logoSizeClass(row.sourceLogo)}`}
                          />
                        </span>
                        <span className="font-semibold text-gray-900">{row.adapter}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold ${statusBadgeClass(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                        {row.rail}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-semibold ${errorRateTextClass(row.errorRate)}`}>{row.errorRate}</td>
                    <td className="px-4 py-3">{row.lastEvent}</td>
                    <td className="px-4 py-3">{row.latency}</td>
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
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">Adapter Detail Panel</h2>
            {!selected ? (
              <p className="mt-3 text-sm text-slate-600">Select an adapter to inspect details.</p>
            ) : (
                <div className="mt-3 space-y-3 text-xs text-slate-700">
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3">
                  <p className="mb-2 font-semibold">Source</p>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-11 w-32 items-center justify-center rounded-lg border border-slate-200 bg-white px-1">
                      <Image
                        src={selected.sourceLogo}
                        alt={selected.adapter}
                        width={120}
                        height={36}
                        className={`object-contain ${logoSizeClass(selected.sourceLogo)}`}
                      />
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{selected.adapter}</span>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3">
                  <span className="font-semibold">Status:</span>{' '}
                  <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(selected.status)}`}>{selected.status}</span>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3"><span className="font-semibold">Rail:</span> {selected.rail}</div>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3">
                  <p className="font-semibold">Recent Errors</p>
                  <ul className="mt-1 space-y-1">
                    {selected.recentErrors.map((errorCode) => (
                      <li key={errorCode}>
                        <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${errorCodeBadgeClass(errorCode)}`}>{errorCode}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3">
                    <p className="font-semibold">Error Trend (24h)</p>
                    <div className="mt-2 flex items-end gap-1">
                      {selected.errorTrend24h.map((point, index) => (
                        <div
                          key={`${selected.id}_${index}`}
                          className={`w-6 rounded-t bg-gradient-to-t ${
                          point >= 5
                            ? 'from-rose-500 to-rose-600'
                            : point >= 3
                              ? 'from-amber-400 to-amber-500'
                              : 'from-emerald-400 to-emerald-500'
                        }`}
                          style={{ height: `${point * 10}px` }}
                        />
                      ))}
                    </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3"><span className="font-semibold">Last Event:</span> 2026-03-09 {selected.lastEvent}</div>
                <div className="rounded-lg border border-slate-200 bg-white/80 p-3"><span className="font-semibold">Connector Version:</span> {selected.connectorVersion}</div>
              </div>
            )}
            </aside>
          </section>
        </section>
      </main>
    </div>
  )
}
