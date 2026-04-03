'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'

type EvidenceStatus = 'COMPLETE' | 'FAILED' | 'PENDING'
type VerificationState = 'Verified' | 'Invalid' | 'Pending'
type SignatureState = 'Valid' | 'Error' | 'Pending'

type EvidenceRow = {
  intentId: string
  packId: string
  status: EvidenceStatus
  merkleState: VerificationState
  signatureState: SignatureState
  createdAt: string
  merkleRoot: string
  signature: string
  envelopeHash: string
  canonicalHash: string
  fusionHash: string
  contractHash: string
}

const EVIDENCE_ROWS: EvidenceRow[] = [
  {
    intentId: 'INT-93211',
    packId: 'EP-01821',
    status: 'COMPLETE',
    merkleState: 'Verified',
    signatureState: 'Valid',
    createdAt: '2026-03-09',
    merkleRoot: 'sha256:a9f1bce19d8234dbe2e91a3b7fa12f0',
    signature: 'ED25519 Verified',
    envelopeHash: 'sha256:39f12a44be31',
    canonicalHash: 'sha256:91af337dbf12',
    fusionHash: 'sha256:72bd1e7f89a9',
    contractHash: 'sha256:f92c91caab31',
  },
  {
    intentId: 'INT-93212',
    packId: 'EP-01822',
    status: 'COMPLETE',
    merkleState: 'Verified',
    signatureState: 'Valid',
    createdAt: '2026-03-09',
    merkleRoot: 'sha256:cb12bb991dfa9023fd781ad8d4f00d44',
    signature: 'ED25519 Verified',
    envelopeHash: 'sha256:11a2d913cb01',
    canonicalHash: 'sha256:72ba81da12ce',
    fusionHash: 'sha256:33ec87ab12fa',
    contractHash: 'sha256:90dd91b23eea',
  },
  {
    intentId: 'INT-93213',
    packId: 'EP-01823',
    status: 'FAILED',
    merkleState: 'Invalid',
    signatureState: 'Error',
    createdAt: '2026-03-09',
    merkleRoot: 'sha256:ff1032ac9238a0be11f0fdf9baf12f9a',
    signature: 'ED25519 Error',
    envelopeHash: 'sha256:77df2201bf90',
    canonicalHash: 'sha256:22bcf102d991',
    fusionHash: 'sha256:14ce9af001bb',
    contractHash: 'sha256:00ea81ac7b98',
  },
  {
    intentId: 'INT-93214',
    packId: 'EP-01824',
    status: 'COMPLETE',
    merkleState: 'Verified',
    signatureState: 'Valid',
    createdAt: '2026-03-09',
    merkleRoot: 'sha256:af12ac8812cdf89abd3390ba912b7f0d',
    signature: 'ED25519 Verified',
    envelopeHash: 'sha256:22f18bd771ab',
    canonicalHash: 'sha256:901bca19ee72',
    fusionHash: 'sha256:5c91be1fa90b',
    contractHash: 'sha256:4be1120af3ac',
  },
  {
    intentId: 'INT-93215',
    packId: 'EP-01825',
    status: 'PENDING',
    merkleState: 'Pending',
    signatureState: 'Pending',
    createdAt: '2026-03-09',
    merkleRoot: 'sha256:cc1112ad1199afec223abf91f1d044a1',
    signature: 'Awaiting',
    envelopeHash: 'sha256:3a019f1bbac8',
    canonicalHash: 'sha256:4da912d41ec3',
    fusionHash: 'sha256:pending',
    contractHash: 'sha256:pending',
  },
  {
    intentId: 'INT-93216',
    packId: 'EP-01826',
    status: 'COMPLETE',
    merkleState: 'Verified',
    signatureState: 'Valid',
    createdAt: '2026-03-08',
    merkleRoot: 'sha256:ef0ab9121903ccbe8f00aa125dce1200',
    signature: 'ED25519 Verified',
    envelopeHash: 'sha256:fe2a19011b3c',
    canonicalHash: 'sha256:bb12d911aca0',
    fusionHash: 'sha256:0ca1aa913be1',
    contractHash: 'sha256:8912ca21be39',
  },
]

const PAGE_SIZE = 4

function statusPill(status: EvidenceStatus) {
  void status
  return 'bg-slate-100 text-slate-600 border-slate-200'
}

function verificationPill(state: VerificationState | SignatureState) {
  void state
  return 'bg-slate-100 text-slate-600 border-slate-200'
}

export default function EvidenceCenterPage() {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | EvidenceStatus>('ALL')
  const [activePage, setActivePage] = useState(1)
  const [expandedPackId, setExpandedPackId] = useState<string | null>(null)

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return EVIDENCE_ROWS.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false
      if (!normalized) return true
      return [row.intentId, row.packId, row.merkleRoot, row.envelopeHash, row.canonicalHash].join(' ').toLowerCase().includes(normalized)
    })
  }, [query, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const pagedRows = useMemo(() => {
    const from = (activePage - 1) * PAGE_SIZE
    return filteredRows.slice(from, from + PAGE_SIZE)
  }, [activePage, filteredRows])

  const health = useMemo(() => {
    const total = EVIDENCE_ROWS.length
    const complete = EVIDENCE_ROWS.filter((row) => row.status === 'COMPLETE').length
    const failed = EVIDENCE_ROWS.filter((row) => row.status === 'FAILED').length
    const pending = EVIDENCE_ROWS.filter((row) => row.status === 'PENDING').length
    const completionRate = ((complete / total) * 100).toFixed(1)
    const failedRate = ((failed / total) * 100).toFixed(1)
    const pendingRate = ((pending / total) * 100).toFixed(1)
    return { total, completionRate, failedRate, pendingRate }
  }, [])

  const pageNumbers = useMemo(() => Array.from({ length: totalPages }, (_, index) => index + 1), [totalPages])

  useEffect(() => {
    setActivePage((previous) => Math.min(previous, totalPages))
  }, [totalPages])

  return (
    <div className="w-full p-6 lg:p-8">
      <main className="ct-main-panel mt-1 px-6 pb-7 pt-6">
        <section className="ct-clear-glass rounded-xl p-4 shadow-[0_14px_34px_rgba(15,23,42,0.09)]">
          <h1 className="text-2xl font-semibold text-slate-900">Evidence Center</h1>
          <p className="mt-1 text-sm text-slate-600">Deterministic proof packs with trace inspection and regulator-ready exports.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActivePage(1)
              }}
              placeholder="Search Intent / Evidence Pack / Hash / Merkle Root"
              className="h-10 min-w-[340px] flex-1 rounded-lg border border-gray-200 bg-white/90 px-3 text-sm text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.08)] outline-none transition focus:border-slate-400 focus:shadow-[0_8px_18px_rgba(15,23,42,0.12)]"
            />
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as 'ALL' | EvidenceStatus)
                setActivePage(1)
              }}
              className="h-10 rounded-lg border border-gray-200 bg-white/90 px-3 text-sm text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.08)] outline-none transition focus:border-slate-400 focus:shadow-[0_8px_18px_rgba(15,23,42,0.12)]"
            >
              <option value="ALL">Filters: All</option>
              <option value="COMPLETE">Complete</option>
              <option value="FAILED">Failed</option>
              <option value="PENDING">Pending</option>
            </select>
            <button className="h-10 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.08)] transition hover:shadow-[0_10px_20px_rgba(15,23,42,0.12)]">
              Export All
            </button>
          </div>
        </section>

        <section className="ct-clear-glass mt-4 rounded-xl p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">Evidence Health</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            <div className="ct-frost-chip rounded-lg p-3 text-sm text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.08)]"><span className="font-medium">Total Packs</span><span className="float-right font-semibold">{health.total.toLocaleString()}</span></div>
            <div className="ct-frost-chip rounded-lg p-3 text-sm text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.08)]"><span className="font-medium">Completion Rate</span><span className="float-right font-semibold">{health.completionRate}%</span></div>
            <div className="ct-frost-chip rounded-lg p-3 text-sm text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.08)]"><span className="font-medium">Failed</span><span className="float-right font-semibold">{health.failedRate}%</span></div>
            <div className="ct-frost-chip rounded-lg p-3 text-sm text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.08)]"><span className="font-medium">Pending</span><span className="float-right font-semibold">{health.pendingRate}%</span></div>
            <div className="ct-frost-chip rounded-lg p-3 text-sm text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.08)]"><span className="font-medium">Signature Integrity</span><span className="float-right font-semibold">100%</span></div>
            <div className="ct-frost-chip rounded-lg p-3 text-sm text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.08)]"><span className="font-medium">Merkle Root Verification</span><span className="float-right font-semibold">Verified</span></div>
          </div>
        </section>

        <section className="ct-clear-glass mt-4 rounded-xl p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">Evidence Workspace</h2>
          <div className="mt-3 overflow-auto rounded-xl border border-gray-200/70 bg-white/80 shadow-[0_8px_22px_rgba(15,23,42,0.08)]">
            <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="border-b border-gray-200/70 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Intent ID</th>
                  <th className="px-3 py-2">Evidence Pack</th>
                  <th className="px-3 py-2 text-slate-400">Status</th>
                  <th className="px-3 py-2 text-slate-400">Merkle Root</th>
                  <th className="px-3 py-2 text-slate-400">Signature</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Explore</th>
                  <th className="px-3 py-2">Export</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => {
                  const isExpanded = expandedPackId === row.packId
                  return (
                    <Fragment key={row.packId}>
                      <tr className="border-b border-gray-100/80 transition hover:bg-white">
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.intentId}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.packId}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusPill(row.status)}`}>{row.status}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${verificationPill(row.merkleState)}`}>{row.merkleState}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${verificationPill(row.signatureState)}`}>{row.signatureState}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-700">{row.createdAt}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setExpandedPackId(isExpanded ? null : row.packId)}
                            className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_4px_10px_rgba(15,23,42,0.08)] transition hover:shadow-[0_6px_14px_rgba(15,23,42,0.12)]"
                          >
                            {row.status === 'FAILED' ? 'Investigate' : 'Inspect'}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-700">{row.status === 'FAILED' ? 'Report' : 'JSON / ZIP'}</td>
                      </tr>
                      {isExpanded ? (
                        <tr className="border-b border-gray-100/80 bg-slate-50/55">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="rounded-lg border border-slate-200 bg-white/85 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                              <h3 className="text-sm font-semibold text-slate-800">▼ Evidence Details — {row.packId}</h3>
                              <div className="mt-2 grid gap-2 text-xs text-slate-700 md:grid-cols-3">
                                <p><span className="font-semibold text-slate-500">Intent ID:</span> {row.intentId}</p>
                                <p><span className="font-semibold text-slate-500">Status:</span> {row.status}</p>
                                <p><span className="font-semibold">Created:</span> {row.createdAt}</p>
                              </div>

                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-700 shadow-[0_4px_12px_rgba(15,23,42,0.06)]">
                                  <p className="font-semibold text-slate-500">Merkle Root</p>
                                  <p className="mt-1 font-mono">{row.merkleRoot}</p>
                                </div>
                                <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-700 shadow-[0_4px_12px_rgba(15,23,42,0.06)]">
                                  <p className="font-semibold text-slate-500">Signature</p>
                                  <p className="mt-1 font-mono">{row.signature}</p>
                                </div>
                              </div>

                              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50/70 p-3 shadow-[0_4px_12px_rgba(15,23,42,0.06)]">
                                <p className="text-xs font-semibold text-slate-700">Evidence Tree</p>
                                <div className="mt-2 space-y-1 font-mono text-xs text-slate-700">
                                  <p>Evidence Pack</p>
                                  <p> ├─ Raw Envelope · {row.envelopeHash}</p>
                                  <p> ├─ Canonical Intent · {row.canonicalHash}</p>
                                  <p> ├─ Outcome Events · Webhook + Statement</p>
                                  <p> ├─ Fusion Decision · {row.fusionHash}</p>
                                  <p> └─ Final Contract · {row.contractHash}</p>
                                </div>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                <button className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_4px_10px_rgba(15,23,42,0.08)]">Download JSON Evidence</button>
                                <button className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_4px_10px_rgba(15,23,42,0.08)]">Download Signed ZIP</button>
                                <button className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_4px_10px_rgba(15,23,42,0.08)]">Generate Audit Report</button>
                                <button className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_4px_10px_rgba(15,23,42,0.08)]">Generate RBI Bundle</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-700">
            <button
              onClick={() => setActivePage((prev) => Math.max(1, prev - 1))}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1 shadow-[0_4px_10px_rgba(15,23,42,0.07)]"
              disabled={activePage === 1}
            >
              Prev
            </button>
            {pageNumbers.map((pageNumber) => (
              <button
                key={pageNumber}
                onClick={() => setActivePage(pageNumber)}
                className={`rounded-md border px-2.5 py-1 shadow-[0_4px_10px_rgba(15,23,42,0.07)] ${activePage === pageNumber ? 'border-slate-700 bg-slate-700 text-white' : 'border-gray-200 bg-white'}`}
              >
                {pageNumber}
              </button>
            ))}
            <button
              onClick={() => setActivePage((prev) => Math.min(totalPages, prev + 1))}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1 shadow-[0_4px_10px_rgba(15,23,42,0.07)]"
              disabled={activePage === totalPages}
            >
              Next
            </button>
          </div>
        </section>

        <section className="ct-clear-glass mt-4 rounded-xl p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">Evidence Flow</h2>
          <p className="mt-1 text-xs text-slate-600">Raw Envelope → Canonical Intent → Outcome Signals → Fusion → Contract → Evidence Pack → Signed Proof</p>
          <div className="mt-3 grid gap-2 md:grid-cols-7">
            {[
              ['Raw Envelope', 'env_in_01HZZ', '✓ verified', 'sha256:39f1...'],
              ['Canonical Intent', 'int_01HZZ', '✓ verified', 'sha256:91af...'],
              ['Outcome Signals', 'webhook/statement', '✓ verified', 'event hashes'],
              ['Fusion Engine', 'fusion_v1.0', 'provisional', 'sha256:72bd...'],
              ['Final Contract', 'ctr_01HZZ', '✓ verified', 'sha256:f92c...'],
              ['Evidence Pack', 'ep_01HZZ', '✓ verified', 'sha256:a9f1...'],
              ['Signed Proof', 'ed25519', 'signed', 'signature valid'],
            ].map(([title, id, state, hash]) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-white/85 p-2 text-[11px] text-slate-700 shadow-[0_6px_14px_rgba(15,23,42,0.08)]">
                <p className="font-semibold text-slate-800">{title}</p>
                <p className="mt-1 font-mono">{id}</p>
                <p className="mt-1">{state}</p>
                <p className="font-mono text-slate-500">{hash}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-600">Branching signals: Webhook Event + Statement Event feed into Fusion Engine before final contract proof generation.</p>
        </section>
      </main>
    </div>
  )
}
