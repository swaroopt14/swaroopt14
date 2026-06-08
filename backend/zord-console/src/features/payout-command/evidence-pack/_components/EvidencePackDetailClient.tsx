'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DASHBOARD_FONT_STACK } from '@/services/payout-command/model'
import { getEvidencePackFull } from '@/services/payout-command/prod-api/getEvidencePacks'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'
import { evidenceCopy } from '../../evidence/copy/evidenceCopy'
import { EvidencePackSummaryTab } from './EvidencePackSummaryTab'
import { EvidencePackTimelineTab } from './EvidencePackTimelineTab'
import { EvidencePackItemsTab } from './EvidencePackItemsTab'
import { EvidencePackGraphTab } from './EvidencePackGraphTab'
import { EvidencePackExportTab } from './EvidencePackExportTab'

const TABS = ['summary', 'timeline', 'items', 'graph', 'export'] as const
type DetailTab = (typeof TABS)[number]

function parseTab(raw: string | null): DetailTab {
  const t = (raw || 'summary').toLowerCase()
  if (TABS.includes(t as DetailTab)) return t as DetailTab
  return 'summary'
}

type EvidencePackDetailClientProps = {
  packId: string
}

export function EvidencePackDetailClient({ packId }: EvidencePackDetailClientProps) {
  const searchParams = useSearchParams()
  const batchId = searchParams.get('batch_id')?.trim() ?? ''
  const tab = parseTab(searchParams.get('tab'))
  const [pack, setPack] = useState<EvidencePackFull | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void getEvidencePackFull(packId).then((full) => {
      if (cancelled) return
      setPack(full)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [packId])

  const tabHref = (t: DetailTab) => {
    const params = new URLSearchParams()
    params.set('tab', t)
    if (batchId) params.set('batch_id', batchId)
    return `/payout-command-view/evidence-pack/${encodeURIComponent(packId)}?${params.toString()}`
  }

  const tabLabels: Record<DetailTab, string> = {
    summary: evidenceCopy.packDetail.tabs.summary,
    timeline: evidenceCopy.packDetail.tabs.timeline,
    items: evidenceCopy.packDetail.tabs.items,
    graph: evidenceCopy.packDetail.tabs.graph,
    export: evidenceCopy.packDetail.tabs.export,
  }

  return (
    <main
      className="payout-command-console min-h-screen bg-[#f5f5f5] text-[15px] leading-[1.55] antialiased"
      style={{ fontFamily: DASHBOARD_FONT_STACK }}
    >
      <div className="mx-auto max-w-[1400px] space-y-5 px-3 py-5 sm:px-4 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href={`/payout-command-view/today?dock=proof${batchId ? `&batch_id=${encodeURIComponent(batchId)}` : ''}`}
              className="text-[13px] font-medium text-[#6f716d] hover:text-[#111111]"
            >
              ← Evidence & Dispute Resolution
            </Link>
            <h1 className="mt-2 font-mono text-[20px] font-semibold text-[#111111]">{packId}</h1>
            <p className="mt-1 text-[14px] text-[#6f716d]">{evidenceCopy.graph.subtitle}</p>
          </div>
        </div>

        <nav className="flex flex-wrap gap-1 rounded-[0.85rem] border border-[#E5E5E5] bg-[#f8f8f6] p-1">
          {TABS.map((t) => (
            <Link
              key={t}
              href={tabHref(t)}
              className={`rounded-[0.65rem] px-4 py-2 text-[14px] font-semibold transition ${
                tab === t ? 'bg-white text-[#111111] shadow-sm' : 'text-[#6f716d] hover:text-[#111111]'
              }`}
            >
              {tabLabels[t]}
            </Link>
          ))}
        </nav>

        <div className="rounded-[16px] border border-[#E5E5E5] bg-white p-5 sm:p-6">
          {tab === 'summary' ? (
            <EvidencePackSummaryTab pack={pack} batchId={batchId} loading={loading} />
          ) : null}
          {tab === 'timeline' ? (
            <EvidencePackTimelineTab pack={pack} packId={packId} loading={loading} />
          ) : null}
          {tab === 'items' ? <EvidencePackItemsTab pack={pack} loading={loading} /> : null}
          {tab === 'graph' ? (
            <EvidencePackGraphTab
              packId={packId}
              batchId={batchId}
              intentId={pack?.intent_id}
            />
          ) : null}
          {tab === 'export' ? <EvidencePackExportTab pack={pack} /> : null}
        </div>
      </div>
    </main>
  )
}
