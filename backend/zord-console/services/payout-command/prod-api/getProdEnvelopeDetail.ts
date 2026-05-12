import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { ApiEnvelopeDetail } from './prodApiTypes'
import { PROD_RAW_ENVELOPES_LIST_PATH } from './getProdRawEnvelopesPage'

export async function getProdEnvelopeDetail(envelopeId: string): Promise<ApiEnvelopeDetail | null> {
  const path = `${PROD_RAW_ENVELOPES_LIST_PATH}/${encodeURIComponent(envelopeId)}`
  return fetchProdJsonGet<ApiEnvelopeDetail>(path)
}
