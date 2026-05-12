import { fetchProdJsonGet } from '../fetchProdJsonGet'
import type { Service7MetricResponse } from './service7MlTypes'

export const S7_MERKLE_PACK_PATH = '/api/prod/evidence/packs'
export const S7_MERKLE_PACK_GRAPH_PATH = '/api/prod/evidence/packs'
export const S7_MERKLE_REPLAY_EQ_PATH = '/api/prod/intelligence/kpis/evidence/replay-equivalence'

export async function getService7MerklePack(packId: string): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(`${S7_MERKLE_PACK_PATH}/${encodeURIComponent(packId)}`)
}

export async function getService7MerklePackGraph(packId: string): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(`${S7_MERKLE_PACK_GRAPH_PATH}/${encodeURIComponent(packId)}/graph`)
}

export async function getService7MerkleReplayEquivalenceForPack(
  packId: string,
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(
    `${S7_MERKLE_REPLAY_EQ_PATH}?scope=tenant&scope_ref=${encodeURIComponent(packId)}`,
  )
}

