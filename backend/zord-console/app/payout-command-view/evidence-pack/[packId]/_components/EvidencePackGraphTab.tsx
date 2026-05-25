'use client'

import { MerkleGraphSurface } from '../../../today/_components/surfaces/MerkleGraphSurface'

type EvidencePackGraphTabProps = {
  packId: string
}

export function EvidencePackGraphTab({ packId }: EvidencePackGraphTabProps) {
  return <MerkleGraphSurface initialPackId={packId} embedMode />
}
