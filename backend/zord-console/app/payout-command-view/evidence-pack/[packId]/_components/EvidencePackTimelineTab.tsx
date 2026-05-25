'use client'

import { evidenceCopy } from '../../../today/_components/evidence/copy/evidenceCopy'
import { mapProofTimeline } from '../../../today/_components/evidence/mappers/mapProofTimeline'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'

type EvidencePackTimelineTabProps = {
  pack: EvidencePackFull | null
  loading: boolean
}

export function EvidencePackTimelineTab({ pack, loading }: EvidencePackTimelineTabProps) {
  if (loading) return <p className="text-[15px] text-[#6f716d]">Loading timeline…</p>
  if (!pack) return <p className="text-[15px] text-[#6f716d]">{evidenceCopy.empty.noPack}</p>

  const events = mapProofTimeline(pack)
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
          {ev.detail ? <p className="mt-0.5 text-[14px] text-[#6f716d]">{ev.detail}</p> : null}
        </li>
      ))}
    </ol>
  )
}
