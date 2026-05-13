'use client'

import { useRef, useState } from 'react'
import { NavyMetricHero } from '../command-center/NavyMetricHero'
import { Glyph } from '../shared'
import { EntityLogo } from '../entity-logo'

/**
 * SystemsIntegrationSurface — Page 6: Integration & System Setup.
 *
 * Audience: CTO / Engineering during onboarding · ops adding new connectors.
 * Job: connect Zord to your systems, configure governance policies, manage tenants.
 *
 * Three sections:
 *   1. Connections — live status + add new + file ingestion (Phase 1 onboarding)
 *   2. Governance Policy Builder — 11 gate checks · versioned · signed
 *   3. Tenant Configuration — multi-tenant tree, volume allocation, per-tenant policies
 *
 * Visual contract: matches Home command center.
 * Black / white / #6f716d / #E5E5E5 / #fafafa, with #4ADE80 spot accent.
 */

// ─── Mock data ────────────────────────────────────────────────────────────────

type ConnectionHealth = 'connected' | 'degraded' | 'disconnected'

const CONNECTIONS: Array<{
  name: string
  kind: 'psp' | 'bank'
  category: 'PSP' | 'Bank' | 'Rail'
  health: ConnectionHealth
  latencyMs: number
  uptime30d: string
  lastEvent: string
}> = [
  { name: 'RazorpayX', kind: 'psp', category: 'PSP', health: 'connected', latencyMs: 184, uptime30d: '99.97%', lastEvent: '2s ago' },
  { name: 'Cashfree', kind: 'psp', category: 'PSP', health: 'connected', latencyMs: 220, uptime30d: '99.92%', lastEvent: '4s ago' },
  { name: 'PayU', kind: 'psp', category: 'PSP', health: 'degraded', latencyMs: 612, uptime30d: '98.41%', lastEvent: '11s ago' },
  { name: 'Stripe', kind: 'psp', category: 'PSP', health: 'connected', latencyMs: 142, uptime30d: '99.99%', lastEvent: '1s ago' },
  { name: 'HDFC Bank', kind: 'bank', category: 'Bank', health: 'connected', latencyMs: 410, uptime30d: '99.84%', lastEvent: '8s ago' },
  { name: 'ICICI Bank', kind: 'bank', category: 'Bank', health: 'disconnected', latencyMs: 0, uptime30d: '94.11%', lastEvent: '12m ago' },
]

type PolicyAction = 'reject' | 'flag' | 'override'

const POLICIES: Array<{
  id: string
  gate: string
  condition: string
  threshold: string
  action: PolicyAction
  version: string
  signedBy: string
  updated: string
}> = [
  { id: 'GP-01', gate: 'Beneficiary KYC freshness', condition: 'KYC last verified', threshold: '> 180 days ago', action: 'flag', version: 'v3.2', signedBy: 'compliance-lead@', updated: '2026-04-22' },
  { id: 'GP-02', gate: 'Sanctions screening', condition: 'OFAC / RBI list match', threshold: 'Any positive match', action: 'reject', version: 'v5.0', signedBy: 'compliance-lead@', updated: '2026-05-01' },
  { id: 'GP-03', gate: 'Velocity limit', condition: 'Same-day disbursement count', threshold: '> 500 / day / beneficiary', action: 'flag', version: 'v1.4', signedBy: 'risk-ops@', updated: '2026-04-15' },
  { id: 'GP-04', gate: 'Amount ceiling', condition: 'Single intent value', threshold: '> ₹10,00,000', action: 'override', version: 'v2.1', signedBy: 'cfo@', updated: '2026-03-30' },
  { id: 'GP-05', gate: 'Cooling period', condition: 'Beneficiary first-seen', threshold: '< 24 hours', action: 'flag', version: 'v1.0', signedBy: 'risk-ops@', updated: '2026-04-12' },
  { id: 'GP-06', gate: 'Mandate validity', condition: 'NACH mandate state', threshold: 'expired or revoked', action: 'reject', version: 'v2.7', signedBy: 'ops-lead@', updated: '2026-04-19' },
]

const TENANT_TREE: Array<{
  name: string
  type: 'master' | 'business-unit' | 'sub'
  depth: 0 | 1 | 2
  volumeShare: number
  monthlyValue: string
  policy: string
}> = [
  { name: 'Meesho · Master', type: 'master', depth: 0, volumeShare: 100, monthlyValue: '₹148.2 Cr', policy: 'master-policy-v3.2' },
  { name: 'Marketplace payouts', type: 'business-unit', depth: 1, volumeShare: 64, monthlyValue: '₹94.8 Cr', policy: 'master-policy-v3.2' },
  { name: 'Logistics partners', type: 'business-unit', depth: 1, volumeShare: 22, monthlyValue: '₹32.6 Cr', policy: 'logistics-v1.4' },
  { name: 'Ads & promotions', type: 'business-unit', depth: 1, volumeShare: 14, monthlyValue: '₹20.8 Cr', policy: 'master-policy-v3.2' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function SystemsIntegrationSurface() {
  const connectedCount = CONNECTIONS.filter((c) => c.health === 'connected').length
  const degradedCount = CONNECTIONS.filter((c) => c.health === 'degraded').length
  const disconnectedCount = CONNECTIONS.filter((c) => c.health === 'disconnected').length

  return (
    <div className="-mx-3 -my-4 rounded-[20px] bg-gradient-to-b from-[#fafaf9] via-white to-[#fafaf9] px-3 py-4 sm:-mx-4 sm:px-4 lg:-mx-5 lg:px-5">
      <div className="space-y-5">
        {/* ── Eyebrow + title ─────────────────────────────────────────── */}
        <header>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2.5 py-0.5 text-[14px] font-semibold uppercase tracking-[0.12em] text-[#6f716d]">
            <Glyph name="refresh" className="h-2.5 w-2.5" />
            CTO · Engineering · Onboarding
          </span>
          <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-[#6f716d]">
            Connect Zord to your systems, configure governance policies, and manage your multi-tenant structure.
          </p>
        </header>

        {/* ── Hero — connection health summary ───────────────────────── */}
        <NavyMetricHero
          eyebrow="Live system connectivity"
          value={`${connectedCount}`}
          valueSuffix={` / ${CONNECTIONS.length} connected`}
          deltaPill={`${degradedCount} degraded · ${disconnectedCount} disconnected`}
          subcopy="One pane of glass for every loan system, payment partner, bank, and rail. Add a connection or upload a CSV to onboard without code."
          buckets={[
            { label: 'Active connections', value: `${connectedCount}`, sub: 'PSPs and banks streaming events in real time' },
            { label: 'Governance policies', value: `${POLICIES.length}`, sub: 'Signed gate checks evaluated on every intent' },
            { label: 'Sub-tenants', value: `${TENANT_TREE.length - 1}`, sub: 'Business units under master tenant policy' },
          ]}
        />

        <ConnectionsSection />
        <GovernanceSection />
        <TenantSection />
      </div>
    </div>
  )
}

// ─── Section 1: Connections ───────────────────────────────────────────────────

function ConnectionsSection() {
  return (
    <section className="overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_4px_16px_-4px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E5E5] bg-gradient-to-br from-emerald-50/50 via-white to-white px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-emerald-200/60 bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
            <Glyph name="refresh" className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[17px] font-semibold text-[#111111]">1 · Connections</p>
            <p className="mt-0.5 text-[15px] text-[#6f716d]">
              Live status of all integrated systems · file ingestion for zero-friction onboarding.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#111111] px-3 py-1.5 text-[15px] font-semibold text-white transition hover:bg-black"
        >
          <Glyph name="zap" className="h-3 w-3" />
          Add new connection
        </button>
      </header>

      <div className="grid gap-0 border-b border-[#E5E5E5] lg:grid-cols-2">
        <div className="border-b border-[#E5E5E5] lg:border-b-0 lg:border-r">
          <table className="w-full text-left text-[16px]">
            <thead className="bg-[#fafafa] text-[14px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
              <tr>
                <th className="px-4 py-2.5">System</th>
                <th className="px-4 py-2.5">Health</th>
                <th className="px-4 py-2.5 text-right">Latency</th>
                <th className="px-4 py-2.5 text-right">30d uptime</th>
                <th className="px-4 py-2.5 text-right">Last event</th>
                <th className="px-4 py-2.5 text-right">Test</th>
              </tr>
            </thead>
            <tbody>
              {CONNECTIONS.map((c) => (
                <tr key={c.name} className="border-t border-[#E5E5E5] hover:bg-[#fafafa]">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <EntityLogo name={c.name} kind={c.kind} size={18} />
                      <div className="min-w-0">
                        <p className="text-[16px] font-medium text-[#111111]">{c.name}</p>
                        <p className="text-[14px] text-[#94a3b8]">{c.category}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <HealthPill health={c.health} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#475569]">
                    {c.health === 'disconnected' ? '—' : `${c.latencyMs} ms`}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#475569]">{c.uptime30d}</td>
                  <td className="px-4 py-2.5 text-right text-[14px] font-mono text-[#94a3b8]">{c.lastEvent}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-[6px] border border-[#E5E5E5] bg-white px-2 py-1 text-[14px] font-medium text-[#111111] transition hover:bg-[#fafafa]"
                    >
                      Test
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <FileIngestionPanel />
      </div>
    </section>
  )
}

function HealthPill({ health }: { health: ConnectionHealth }) {
  const styles =
    health === 'connected'
      ? { wrap: 'border-emerald-200/70 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' }
      : health === 'degraded'
        ? { wrap: 'border-amber-200/70 bg-amber-50 text-amber-700', dot: 'bg-amber-500' }
        : { wrap: 'border-rose-200/70 bg-rose-50 text-rose-700', dot: 'bg-rose-500' }
  const label = health === 'connected' ? 'Connected' : health === 'degraded' ? 'Degraded' : 'Disconnected'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[14px] font-semibold capitalize ${styles.wrap}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden />
      {label}
    </span>
  )
}

function FileIngestionPanel() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<{ rows: number; columns: string[] } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function onFile(f: File | null) {
    if (!f) return
    setFile(f)
    setPreview({ rows: 1247, columns: ['intent_id', 'beneficiary_ref', 'amount', 'rail', 'reference', 'memo'] })
  }

  return (
    <div className="p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80]" aria-hidden />
        <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#6f716d]">Phase 1 onboarding</p>
      </div>
      <p className="text-[17px] font-semibold text-[#111111]">File ingestion</p>
      <p className="mt-0.5 text-[15px] text-[#6f716d]">
        CSV or Excel upload for batch processing. Drag and drop. Zord auto-detects columns and previews before
        ingest. No API integration required.
      </p>

      <label
        htmlFor="systems-file-upload"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          onFile(e.dataTransfer.files[0] ?? null)
        }}
        className="mt-3 flex min-h-[8.5rem] cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed border-[#cfcfcf] bg-[#fafafa] px-4 py-5 text-center transition hover:border-[#111111]/30 hover:bg-[#f4f4f1]"
      >
        <Glyph name="document" className="h-5 w-5 text-[#94a3b8]" />
        <p className="mt-2 text-[16px] font-medium text-[#111111]">
          {file ? file.name : 'Drop CSV / Excel here, or click to browse'}
        </p>
        <p className="mt-0.5 text-[14px] text-[#94a3b8]">
          Max 50 MB · UTF-8 · headers in first row
        </p>
        <input
          ref={inputRef}
          id="systems-file-upload"
          type="file"
          accept=".csv,.xls,.xlsx"
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {preview ? (
        <div className="mt-3 rounded-[10px] border border-[#E5E5E5] bg-white p-3">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold text-[#111111]">
              Detected · {preview.rows.toLocaleString('en-IN')} rows
            </p>
            <button
              type="button"
              className="rounded-[6px] bg-[#111111] px-2 py-1 text-[14px] font-semibold text-white transition hover:bg-black"
            >
              Confirm & ingest
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {preview.columns.map((col) => (
              <span
                key={col}
                className="rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2 py-0.5 font-mono text-[14px] text-[#475569]"
              >
                {col}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ─── Section 2: Governance Policy Builder ─────────────────────────────────────

function GovernanceSection() {
  return (
    <section className="overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_4px_16px_-4px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E5E5] bg-gradient-to-br from-indigo-50/55 via-white to-white px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-indigo-200/60 bg-gradient-to-br from-indigo-100 to-indigo-50 text-indigo-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
            <Glyph name="lock" className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[17px] font-semibold text-[#111111]">2 · Governance policy builder</p>
            <p className="mt-0.5 text-[15px] text-[#6f716d]">
              Visual rule builder for the 11 governance gate checks. Every version is signed; auditors can verify
              which rules were active at the moment of any intent dispatch.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-[15px] font-medium text-[#111111] transition hover:bg-[#fafafa]"
          >
            <Glyph name="document" className="h-3 w-3" />
            Version history
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#111111] px-3 py-1.5 text-[15px] font-semibold text-white transition hover:bg-black"
          >
            New policy
          </button>
        </div>
      </header>

      <table className="w-full text-left text-[16px]">
        <thead className="bg-[#fafafa] text-[14px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
          <tr>
            <th className="px-4 py-2.5">ID</th>
            <th className="px-4 py-2.5">Gate</th>
            <th className="px-4 py-2.5">Condition</th>
            <th className="px-4 py-2.5">Threshold</th>
            <th className="px-4 py-2.5">Action</th>
            <th className="px-4 py-2.5">Version</th>
            <th className="px-4 py-2.5">Signed by</th>
          </tr>
        </thead>
        <tbody>
          {POLICIES.map((p) => (
            <tr key={p.id} className="border-t border-[#E5E5E5] hover:bg-[#fafafa]">
              <td className="px-4 py-2.5 font-mono text-[14px] text-[#94a3b8]">{p.id}</td>
              <td className="px-4 py-2.5 font-medium text-[#111111]">{p.gate}</td>
              <td className="px-4 py-2.5 text-[#475569]">{p.condition}</td>
              <td className="px-4 py-2.5 font-mono text-[15px] text-[#475569]">{p.threshold}</td>
              <td className="px-4 py-2.5">
                <ActionPill action={p.action} />
              </td>
              <td className="px-4 py-2.5">
                <span className="inline-flex items-center gap-1 font-mono text-[14px] text-[#6f716d]">
                  <Glyph name="lock" className="h-2.5 w-2.5" />
                  {p.version}
                </span>
              </td>
              <td className="px-4 py-2.5 font-mono text-[14px] text-[#94a3b8]">
                {p.signedBy} · {p.updated}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function ActionPill({ action }: { action: PolicyAction }) {
  const label = action === 'reject' ? 'Reject' : action === 'flag' ? 'Flag' : 'Override'
  const styles =
    action === 'reject'
      ? { wrap: 'border-rose-200/70 bg-rose-50 text-rose-700', dot: 'bg-rose-500' }
      : action === 'flag'
        ? { wrap: 'border-amber-200/70 bg-amber-50 text-amber-700', dot: 'bg-amber-500' }
        : { wrap: 'border-sky-200/70 bg-sky-50 text-sky-700', dot: 'bg-sky-500' }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[14px] font-semibold ${styles.wrap}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden />
      {label}
    </span>
  )
}

// ─── Section 3: Tenant Configuration ──────────────────────────────────────────

function TenantSection() {
  return (
    <section className="overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_4px_16px_-4px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E5E5] bg-gradient-to-br from-amber-50/55 via-white to-white px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-amber-200/60 bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
            <Glyph name="users" className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[17px] font-semibold text-[#111111]">3 · Tenant configuration</p>
            <p className="mt-0.5 text-[15px] text-[#6f716d]">
              Multi-tenant tree with per-business-unit volume allocation and governance overrides.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-[15px] font-medium text-[#111111] transition hover:bg-[#fafafa]"
        >
          <Glyph name="users" className="h-3 w-3" />
          Add sub-tenant
        </button>
      </header>

      <ul className="divide-y divide-[#E5E5E5]">
        {TENANT_TREE.map((t) => (
          <li key={t.name} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2" style={{ paddingLeft: t.depth * 24 }}>
              {t.depth > 0 ? (
                <span className="text-[#cfcfcf]" aria-hidden>
                  ├─
                </span>
              ) : null}
              <Glyph
                name={t.type === 'master' ? 'shield' : 'folder'}
                className={`h-3.5 w-3.5 ${t.type === 'master' ? 'text-[#111111]' : 'text-[#6f716d]'}`}
              />
              <p className="text-[16px] font-semibold text-[#111111]">{t.name}</p>
              {t.type === 'master' ? (
                <span className="rounded-full border border-[#E5E5E5] bg-[#fafafa] px-1.5 py-0.5 text-[13px] font-semibold uppercase tracking-wide text-[#6f716d]">
                  Master
                </span>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-4 text-[15px] tabular-nums text-[#475569]">
              <div className="flex items-center gap-2">
                <span className="text-[14px] uppercase tracking-wide text-[#94a3b8]">Volume</span>
                <span className="font-semibold text-[#111111]">{t.volumeShare}%</span>
                <span className="h-1 w-16 overflow-hidden rounded-full bg-[#f4f4f1]">
                  <span
                    className="block h-full rounded-full bg-[#111111]"
                    style={{ width: `${t.volumeShare}%` }}
                  />
                </span>
              </div>
              <span className="font-semibold text-[#111111]">{t.monthlyValue}</span>
              <span className="font-mono text-[14px] text-[#6f716d]">{t.policy}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
