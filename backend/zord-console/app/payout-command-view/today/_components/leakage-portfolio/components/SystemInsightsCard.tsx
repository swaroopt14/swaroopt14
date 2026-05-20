'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { PortfolioLeakageViewModel } from '../normalizeLeakagePayload'

function formatComputedAt(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

const PUBLISHER_DOTS = ['#1e293b', '#64748b', '#94a3b8', '#cbd5e1', '#0ea5e9'] as const

type SystemInsightsCardProps = {
  data: PortfolioLeakageViewModel
}

export function SystemInsightsCard({ data }: SystemInsightsCardProps) {
  const pathname = usePathname()
  const zeroLeakage =
    data.leakageFraction <= 0 ||
    (data.leakageFraction <= 1 && data.leakageFraction < 0.0001)

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-slate-900">System Insights</h2>
        <button type="button" className="text-slate-400 hover:text-slate-600" aria-label="Expand insights">
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M6 14 14 6M8 6h6v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <p className="mt-4 flex-1 text-[14px] leading-7 text-slate-600">
        {zeroLeakage ? (
          <>
            Tenant <strong className="font-semibold text-slate-900">{data.tenantId}</strong> is operating with
            zero financial leakage. Snapshot{' '}
            <strong className="font-mono text-[13px] text-slate-800">{data.snapshotId}</strong> was successfully
            computed at <strong className="text-slate-900">{formatComputedAt(data.computedAt)}</strong>.
          </>
        ) : (
          <>
            Tenant <strong className="font-semibold text-slate-900">{data.tenantId}</strong> shows{' '}
            <strong className="text-slate-900">{data.riskTier}</strong> risk tier on snapshot{' '}
            <strong className="font-mono text-[13px] text-slate-800">{data.snapshotId}</strong> (
            {formatComputedAt(data.computedAt)}). Review unmatched and under-settlement buckets in{' '}
            <Link href={`${pathname}?dock=ambiguity`} className="font-medium text-slate-900 underline">
              Ambiguity
            </Link>
            .
          </>
        )}
      </p>

      <div className="mt-4 flex items-center justify-end gap-2">
        {PUBLISHER_DOTS.map((color, i) => (
          <span
            key={i}
            className="h-7 w-7 rounded-full border border-white shadow-sm"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
        ))}
      </div>
    </article>
  )
}
