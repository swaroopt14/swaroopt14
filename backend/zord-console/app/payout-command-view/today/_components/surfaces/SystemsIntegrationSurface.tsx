'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Glyph } from '../shared'
import { EntityLogo } from '../entity-logo'

/**
 * Connected Systems — integration overview (illustrative).
 *
 * Copy and layout stay intentionally light: PSP / bank / file paths are shown
 * as a map, not as live telemetry. Detailed connector setup lives elsewhere.
 */

type CatalogTone = 'in-scope' | 'common' | 'later'

const RAIL_CARDS: Array<{
  name: string
  kind: 'psp' | 'bank'
  blurb: string
  tone: CatalogTone
}> = [
  { name: 'RazorpayX', kind: 'psp', blurb: 'PSP · cards & bank transfer', tone: 'in-scope' },
  { name: 'Cashfree', kind: 'psp', blurb: 'PSP · IMPS & UPI', tone: 'common' },
  { name: 'PayU', kind: 'psp', blurb: 'PSP · IMPS & NACH', tone: 'common' },
  { name: 'Stripe', kind: 'psp', blurb: 'PSP · global rails', tone: 'later' },
  { name: 'HDFC Bank', kind: 'bank', blurb: 'Bank-direct · NEFT / RTGS', tone: 'common' },
  { name: 'ICICI Bank', kind: 'bank', blurb: 'Bank-direct · IMPS', tone: 'later' },
]

const POLICIES: Array<{
  id: string
  gate: string
  condition: string
  threshold: string
  action: 'reject' | 'flag' | 'override'
  version: string
  signedBy: string
  updated: string
}> = [
  { id: 'GP-01', gate: 'Beneficiary KYC freshness', condition: 'KYC last verified', threshold: '> 180 days ago', action: 'flag', version: 'v3.2', signedBy: 'compliance-lead@', updated: '2026-04-22' },
  { id: 'GP-02', gate: 'Sanctions screening', condition: 'OFAC / RBI list match', threshold: 'Any positive match', action: 'reject', version: 'v5.0', signedBy: 'compliance-lead@', updated: '2026-05-01' },
  { id: 'GP-03', gate: 'Velocity limit', condition: 'Same-day disbursement count', threshold: '> 500 / day / beneficiary', action: 'flag', version: 'v1.4', signedBy: 'risk-ops@', updated: '2026-04-15' },
]

const TENANT_TREE: Array<{
  name: string
  type: 'master' | 'business-unit' | 'sub'
  depth: 0 | 1 | 2
  volumeShare: number
  monthlyValue: string
  policy: string
}> = [
  { name: 'Org · Master', type: 'master', depth: 0, volumeShare: 100, monthlyValue: '—', policy: 'default-policy' },
  { name: 'Business line A', type: 'business-unit', depth: 1, volumeShare: 64, monthlyValue: '—', policy: 'default-policy' },
  { name: 'Business line B', type: 'business-unit', depth: 1, volumeShare: 36, monthlyValue: '—', policy: 'line-b-v1' },
]

export function SystemsIntegrationSurface() {
  return (
    <div className="-mx-3 -my-4 rounded-[20px] bg-gradient-to-b from-[#fafaf9] via-white to-[#f7f7f4] px-3 py-4 sm:-mx-4 sm:px-4 lg:-mx-5 lg:px-5">
      <div className="space-y-6">
        <IntegrationHero />
        <ConnectionsSection />
        <GovernanceSection />
        <TenantSection />
      </div>
    </div>
  )
}

function IntegrationHero() {
  return (
    <section className="overflow-hidden rounded-[20px] border border-[#E8E8E4] bg-white shadow-[0_12px_40px_-20px_rgba(15,23,42,0.12)]">
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_minmax(0,22rem)] lg:items-center">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">Connected Systems</p>
          <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.03em] text-[#0f172a] sm:text-[30px]">
            Payment partners & bank paths
          </h1>
          <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-[#64748b]">
            A simple map of how disbursements can reach beneficiaries: PSPs, bank-direct rails, and optional file
            drops. Nothing here claims live health for your tenant — it is a layout preview until connectors are
            finished in your environment.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {['PSP APIs', 'Bank NEFT / IMPS', 'Batch CSV'].map((item) => (
              <li
                key={item}
                className="rounded-full border border-[#E5E5E5] bg-[#fafafa] px-3 py-1.5 text-[13px] font-medium text-[#475569]"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
        <RailsSchematic />
      </div>
    </section>
  )
}

function RailsSchematic() {
  return (
    <div
      className="relative flex min-h-[11rem] flex-col justify-center rounded-[16px] border border-[#EEF2F7] bg-gradient-to-br from-[#f8fafc] via-white to-[#f0fdf4]/40 p-5"
      aria-hidden
    >
      <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">
        Illustrative flow
      </p>
      <div className="flex items-center justify-between gap-1 sm:gap-2">
        <SchematicNode label="PSPs" caption="Partner APIs" variant="edge" />
        <div className="hidden h-px min-w-[1.5rem] flex-1 bg-gradient-to-r from-transparent via-[#4ADE80]/35 to-transparent sm:block" />
        <SchematicNode label="Zord" caption="Dispatch & evidence" variant="core" />
        <div className="hidden h-px min-w-[1.5rem] flex-1 bg-gradient-to-r from-transparent via-[#4ADE80]/35 to-transparent sm:block" />
        <SchematicNode label="Banks" caption="Rails & settlement" variant="edge" />
      </div>
      <p className="mt-4 text-center text-[12px] leading-snug text-[#94a3b8]">
        Lines are decorative. Real routing and credentials are configured per workspace.
      </p>
    </div>
  )
}

function SchematicNode({
  label,
  caption,
  variant,
}: {
  label: string
  caption: string
  variant: 'core' | 'edge'
}) {
  if (variant === 'core') {
    return (
      <div className="flex min-w-[5.5rem] flex-col items-center text-center">
        <div className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-2xl bg-[#0f172a] text-[13px] font-bold tracking-tight text-white shadow-[0_8px_24px_rgba(15,23,42,0.35)] ring-4 ring-white">
          {label}
        </div>
        <p className="mt-2 max-w-[7rem] text-[11px] leading-snug text-[#64748b]">{caption}</p>
      </div>
    )
  }
  return (
    <div className="flex min-w-[4.5rem] flex-1 flex-col items-center text-center sm:flex-none">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#E2E8F0] bg-white text-[12px] font-semibold text-[#475569] shadow-sm">
        {label}
      </div>
      <p className="mt-2 max-w-[6.5rem] text-[11px] leading-snug text-[#94a3b8]">{caption}</p>
    </div>
  )
}

function ConnectionsSection() {
  return (
    <section className="overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_4px_16px_-4px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E5E5] bg-gradient-to-br from-emerald-50/40 via-white to-white px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-emerald-200/70 bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
            <Glyph name="bank" className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-[18px] font-semibold text-[#0f172a]">Rails & partners</h2>
            <p className="mt-0.5 max-w-xl text-[15px] leading-snug text-[#64748b]">
              Familiar PSPs and bank-direct options shown as a catalog. Status tags are generic — use Connectors in
              the dock for real keys and webhooks.
            </p>
          </div>
        </div>
        <Link
          href="/payout-command-view/today?dock=connectors"
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#E5E5E5] bg-white px-3 py-2 text-[14px] font-semibold text-[#0f172a] shadow-sm transition hover:border-[#0f172a]/20 hover:bg-[#fafafa]"
        >
          <Glyph name="arrow-up-right" className="h-3.5 w-3.5" />
          Open Connectors
        </Link>
      </header>

      <div className="grid gap-0 lg:grid-cols-[1.15fr_minmax(0,1fr)]">
        <div className="border-b border-[#E5E5E5] p-4 sm:p-5 lg:border-b-0 lg:border-r">
          <div className="grid gap-3 sm:grid-cols-2">
            {RAIL_CARDS.map((c) => (
              <article
                key={c.name}
                className="group flex gap-3 rounded-[14px] border border-[#EEF2F7] bg-[#fafafa]/80 p-3.5 transition hover:border-[#4ADE80]/35 hover:bg-white hover:shadow-[0_6px_20px_-8px_rgba(15,23,42,0.12)]"
              >
                <EntityLogo name={c.name} kind={c.kind} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[16px] font-semibold text-[#0f172a]">{c.name}</p>
                    <CatalogTonePill tone={c.tone} />
                  </div>
                  <p className="mt-0.5 text-[14px] leading-snug text-[#64748b]">{c.blurb}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <FileIngestionPanel />
      </div>
    </section>
  )
}

function CatalogTonePill({ tone }: { tone: CatalogTone }) {
  const map = {
    'in-scope': {
      label: 'In scope',
      className: 'border-emerald-200/80 bg-emerald-50 text-emerald-800',
    },
    common: {
      label: 'Typical',
      className: 'border-slate-200 bg-slate-50 text-slate-700',
    },
    later: {
      label: 'When needed',
      className: 'border-[#E5E5E5] bg-white text-[#64748b]',
    },
  } as const
  const m = map[tone]
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${m.className}`}>
      {m.label}
    </span>
  )
}

function FileIngestionPanel() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<{ rows: number; columns: string[] } | null>(null)

  function onFile(f: File | null) {
    if (!f) return
    setFile(f)
    setPreview({ rows: 1247, columns: ['intent_id', 'beneficiary_ref', 'amount', 'rail', 'reference', 'memo'] })
  }

  return (
    <div className="p-5 sm:p-6">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80]" aria-hidden />
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">Optional path</p>
      </div>
      <p className="text-[17px] font-semibold text-[#0f172a]">Batch files</p>
      <p className="mt-1 text-[15px] leading-relaxed text-[#64748b]">
        Some teams start with CSV or Excel before APIs are ready. This panel is a gentle placeholder — wire your
        ingestion rules in the batch command center when you are ready.
      </p>

      <label
        htmlFor="systems-file-upload"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          onFile(e.dataTransfer.files[0] ?? null)
        }}
        className="mt-4 flex min-h-[8rem] cursor-pointer flex-col items-center justify-center rounded-[14px] border border-dashed border-[#d4d4d0] bg-[#fafaf8] px-4 py-5 text-center transition hover:border-[#0f172a]/25 hover:bg-white"
      >
        <Glyph name="document" className="h-5 w-5 text-[#94a3b8]" />
        <p className="mt-2 text-[15px] font-medium text-[#0f172a]">
          {file ? file.name : 'Drop a sample file, or click to browse'}
        </p>
        <p className="mt-0.5 text-[13px] text-[#94a3b8]">Demo only · no data leaves your browser here</p>
        <input
          id="systems-file-upload"
          type="file"
          accept=".csv,.xls,.xlsx"
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {preview ? (
        <div className="mt-3 rounded-[12px] border border-[#E5E5E5] bg-[#fafafa] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] font-semibold text-[#0f172a]">
              Preview · {preview.rows.toLocaleString('en-IN')} rows (mock)
            </p>
            <button
              type="button"
              className="rounded-[8px] bg-[#0f172a] px-2.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-black"
            >
              Continue in Batch Center
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {preview.columns.map((col) => (
              <span
                key={col}
                className="rounded-full border border-[#E5E5E5] bg-white px-2 py-0.5 font-mono text-[12px] text-[#475569]"
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

function GovernanceSection() {
  return (
    <section className="overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_4px_16px_-4px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E5E5] bg-gradient-to-br from-indigo-50/50 via-white to-white px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-indigo-200/70 bg-gradient-to-br from-indigo-100 to-indigo-50 text-indigo-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
            <Glyph name="lock" className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-[18px] font-semibold text-[#0f172a]">Governance sketch</h2>
            <p className="mt-0.5 max-w-2xl text-[15px] text-[#64748b]">
              Example gates only — your compliance team versions and signs real rules in rollout.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#E5E5E5] bg-white px-2.5 py-2 text-[14px] font-medium text-[#0f172a] transition hover:bg-[#fafafa]"
          >
            <Glyph name="document" className="h-3 w-3" />
            Versions
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#0f172a] px-3 py-2 text-[14px] font-semibold text-white transition hover:bg-black"
          >
            New policy
          </button>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[15px]">
          <thead className="bg-[#fafafa] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Gate</th>
              <th className="px-4 py-3">Condition</th>
              <th className="px-4 py-3">Threshold</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Version</th>
            </tr>
          </thead>
          <tbody>
            {POLICIES.map((p) => (
              <tr key={p.id} className="border-t border-[#E5E5E5] hover:bg-[#fafafa]">
                <td className="px-4 py-3 font-mono text-[13px] text-[#94a3b8]">{p.id}</td>
                <td className="px-4 py-3 font-medium text-[#0f172a]">{p.gate}</td>
                <td className="px-4 py-3 text-[#475569]">{p.condition}</td>
                <td className="px-4 py-3 font-mono text-[14px] text-[#475569]">{p.threshold}</td>
                <td className="px-4 py-3">
                  <ActionPill action={p.action} />
                </td>
                <td className="px-4 py-3 font-mono text-[13px] text-[#64748b]">
                  {p.version} · {p.signedBy}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ActionPill({ action }: { action: 'reject' | 'flag' | 'override' }) {
  const label = action === 'reject' ? 'Reject' : action === 'flag' ? 'Flag' : 'Override'
  const styles =
    action === 'reject'
      ? { wrap: 'border-rose-200/70 bg-rose-50 text-rose-700', dot: 'bg-rose-500' }
      : action === 'flag'
        ? { wrap: 'border-amber-200/70 bg-amber-50 text-amber-700', dot: 'bg-amber-500' }
        : { wrap: 'border-sky-200/70 bg-sky-50 text-sky-700', dot: 'bg-sky-500' }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[13px] font-semibold ${styles.wrap}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden />
      {label}
    </span>
  )
}

function TenantSection() {
  return (
    <section className="overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_4px_16px_-4px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E5E5] bg-gradient-to-br from-amber-50/50 via-white to-white px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-amber-200/70 bg-gradient-to-br from-amber-100 to-amber-50 text-amber-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
            <Glyph name="users" className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-[18px] font-semibold text-[#0f172a]">Tenant shape</h2>
            <p className="mt-0.5 max-w-2xl text-[15px] text-[#64748b]">
              A shallow tree for how business units might sit under one workspace — numbers are placeholders.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#E5E5E5] bg-white px-2.5 py-2 text-[14px] font-medium text-[#0f172a] transition hover:bg-[#fafafa]"
        >
          <Glyph name="users" className="h-3 w-3" />
          Add unit
        </button>
      </header>

      <ul className="divide-y divide-[#E5E5E5]">
        {TENANT_TREE.map((t) => (
          <li key={t.name} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <div className="flex min-w-0 flex-1 items-center gap-2" style={{ paddingLeft: t.depth * 24 }}>
              {t.depth > 0 ? (
                <span className="text-[#d4d4d0]" aria-hidden>
                  ├─
                </span>
              ) : null}
              <Glyph
                name={t.type === 'master' ? 'shield' : 'folder'}
                className={`h-3.5 w-3.5 ${t.type === 'master' ? 'text-[#0f172a]' : 'text-[#64748b]'}`}
              />
              <p className="text-[16px] font-semibold text-[#0f172a]">{t.name}</p>
              {t.type === 'master' ? (
                <span className="rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-[#64748b]">
                  Master
                </span>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-4 text-[14px] tabular-nums text-[#475569]">
              <div className="flex items-center gap-2">
                <span className="text-[12px] uppercase tracking-wide text-[#94a3b8]">Share</span>
                <span className="font-semibold text-[#0f172a]">{t.volumeShare}%</span>
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[#f1f5f9]">
                  <span className="block h-full rounded-full bg-[#0f172a]" style={{ width: `${t.volumeShare}%` }} />
                </span>
              </div>
              <span className="font-mono text-[13px] text-[#64748b]">{t.policy}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
