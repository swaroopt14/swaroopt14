'use client'

import { useEffect, useState } from 'react'
import { evidenceCopy } from '../../../today/_components/evidence/copy/evidenceCopy'
import { mapProofTimeline } from '../../../today/_components/evidence/mappers/mapProofTimeline'
import { getEvidencePackTimeline } from '@/services/payout-command/prod-api/getEvidencePackTimeline'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'
import type { TimelineEventVm } from '../../../today/_components/evidence/types/evidenceViewModels'

type EvidencePackTimelineTabProps = {
  pack: EvidencePackFull | null
  packId: string
  loading: boolean
}

function mapApiTimeline(
  entries: { timestamp: string; event: string; node_id: string }[],
): TimelineEventVm[] {
  return entries.map((e) => ({
    time: new Date(e.timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    label: e.event,
    detail: e.node_id.length > 20 ? `${e.node_id.slice(0, 12)}…${e.node_id.slice(-8)}` : e.node_id,
  }))
}

export function EvidencePackTimelineTab({ pack, packId, loading }: EvidencePackTimelineTabProps) {
  const [apiEvents, setApiEvents] = useState<TimelineEventVm[] | null>(null)
  const [apiLoading, setApiLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setApiLoading(true)
    void getEvidencePackTimeline(packId).then(({ data, error }) => {
      if (cancelled) return
      if (data?.timeline?.length) {
        setApiEvents(mapApiTimeline(data.timeline))
      } else {
        setApiEvents(null)
      }
      setApiLoading(false)
      if (error) console.warn('[evidence] timeline', error)
    })
    return () => {
      cancelled = true
    }
  }, [packId])

  if (loading || apiLoading) return <p className="text-[15px] text-[#6f716d]">Loading timeline…</p>
  if (!pack) return <p className="text-[15px] text-[#6f716d]">{evidenceCopy.empty.noPack}</p>

  const events = apiEvents ?? mapProofTimeline(pack)
  if (events.length < 2) {
    return (
      <p className="text-[15px] text-[#6f716d]">
        Timeline will populate when payment instruction, settlement, and match events are linked on this pack.
      </p>
    )
  }

  return (
    <ol className="relative space-y-0 border-l border-[#E5E5E5] pl-6">
      {events.map((ev, i) => (
        <li key={`${ev.time}-${i}`} className="relative pb-6 last:pb-0">
          <span className="absolute -left-[25px] top-1 flex h-3 w-3 rounded-full border-2 border-white bg-[#4ADE80] ring-1 ring-[#4ADE80]/30" />
          <p className="text-[13px] font-semibold tabular-nums text-[#94a3b8]">{ev.time}</p>
          <p className="mt-0.5 text-[16px] font-semibold text-[#111111]">{ev.label}</p>
          {ev.detail ? <p className="mt-0.5 font-mono text-[12px] text-[#6f716d]">{ev.detail}</p> : null}
        </li>
      ))}
    </ol>
  )
}
