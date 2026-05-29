'use client'

import { useEffect, useState } from 'react'
import { MerkleGraphSurface } from '../../../today/_components/surfaces/MerkleGraphSurface'
import { EvidencePackVerifyCard } from '../../../today/_components/evidence/components/EvidencePackVerifyCard'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'

type EvidencePackGraphTabProps = {
  packId: string
  batchId?: string
  intentId?: string
}

export function EvidencePackGraphTab({ packId, batchId, intentId }: EvidencePackGraphTabProps) {
  const bid = apiTrimmedString(batchId)
  const [viewPackId, setViewPackId] = useState(packId)

  useEffect(() => {
    setViewPackId(packId)
  }, [packId])

  return (
    <div className="space-y-4">
      {bid || intentId ? (
        <div className="flex flex-wrap gap-4 rounded-xl border border-[#E5E5E5] bg-[#fafafa] px-4 py-3 text-[13px]">
          {bid ? (
            <span>
              <span className="font-semibold text-slate-500">Batch </span>
              <span className="font-mono font-semibold text-slate-900">{bid}</span>
            </span>
          ) : null}
          {intentId ? (
            <span>
              <span className="font-semibold text-slate-500">Opened from intent </span>
              <span className="font-mono font-semibold text-slate-900" title={intentId}>
                {intentId.length > 24 ? `${intentId.slice(0, 24)}…` : intentId}
              </span>
            </span>
          ) : null}
          <span className="text-slate-500">
            Use <strong className="text-slate-700">Intent · pack</strong> below to switch to another payment in this batch.
          </span>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <EvidencePackVerifyCard packId={viewPackId} />
        </div>
        <div className="min-w-0">
          <MerkleGraphSurface
            initialPackId={packId}
            embedMode
            controlledBatchId={bid || undefined}
            controlledPackId={viewPackId}
            intentOptionsSource="table"
            onActivePackIdChange={setViewPackId}
          />
        </div>
      </div>
    </div>
  )
}
