'use client'

import { formatLastUpdated } from './commandCenterFormat'
import type { DataSourceBadgeStatus } from './usePaymentCommandDataSources'
import { HOME_BODY_IMPERIAL_SM, HOME_TITLE_BLACK } from './homeCommandCenterTokens'

const STATUS_LABEL: Record<DataSourceBadgeStatus, string> = {
  received: 'Received',
  missing: 'Missing',
  partial: 'Partial',
  ready: 'Ready',
  processing: 'Processing',
}

const STATUS_CLASS: Record<DataSourceBadgeStatus, string> = {
  received: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  missing: 'border-amber-200 bg-amber-50 text-amber-900',
  partial: 'border-sky-200 bg-sky-50 text-sky-900',
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  processing: 'border-slate-200 bg-slate-50 text-slate-700',
}

function StatusBadge({ label, status }: { label: string; status: DataSourceBadgeStatus }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[13px] text-neutral-700">
      <span className="font-medium text-neutral-900">{label}:</span>
      <span
        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_CLASS[status]}`}
      >
        {STATUS_LABEL[status]}
      </span>
    </span>
  )
}

export type DataSourceStatusBarProps = {
  intentStatus: DataSourceBadgeStatus
  settlementStatus: DataSourceBadgeStatus
  bankStatementStatus: DataSourceBadgeStatus
  evidenceStatus: DataSourceBadgeStatus
  lastUpdatedIso?: string | null
}

export function DataSourceStatusBar({
  intentStatus,
  settlementStatus,
  bankStatementStatus,
  evidenceStatus,
  lastUpdatedIso,
}: DataSourceStatusBarProps) {
  const updated = formatLastUpdated(lastUpdatedIso)

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm">
      <p className={`text-[13px] font-semibold ${HOME_TITLE_BLACK}`}>Data received</p>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        <StatusBadge label="Payment instructions" status={intentStatus} />
        <StatusBadge label="Bank/settlement file" status={settlementStatus} />
        <StatusBadge label="Bank statement" status={bankStatementStatus} />
        <StatusBadge label="Proof readiness" status={evidenceStatus} />
      </div>
      {updated ? (
        <p className={`mt-2 ${HOME_BODY_IMPERIAL_SM}`}>Last updated: {updated}</p>
      ) : null}
    </div>
  )
}
