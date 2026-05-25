import { Suspense } from 'react'
import { EvidencePackDetailClient } from './_components/EvidencePackDetailClient'

export default function EvidencePackPage({ params }: { params: { packId: string } }) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-[#6f716d]">Loading evidence pack…</div>}>
      <EvidencePackDetailClient packId={params.packId} />
    </Suspense>
  )
}
