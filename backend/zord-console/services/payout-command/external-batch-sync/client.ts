import type { ExternalBatchSyncResponse } from './types'

type PullBody = { tenant_id: string; batch_id: string; psp?: string }

async function postExternalSync(
  path: `/api/payout-command/external-sync/${string}`,
  body: PullBody,
): Promise<ExternalBatchSyncResponse> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  let data: ExternalBatchSyncResponse
  try {
    data = (await res.json()) as ExternalBatchSyncResponse
  } catch {
    return {
      ok: false,
      connected: false,
      message: `Invalid response (HTTP ${res.status})`,
      operation: path,
    }
  }
  if (!res.ok && data.message == null) {
    return { ...data, ok: false, connected: false, message: data.message ?? `HTTP ${res.status}` }
  }
  return data
}

/** Planned: pull latest batch / disbursement rows from customer LMS or ERP (SAP, Finacle, etc.). */
export function postLoanSystemBatchPull(body: PullBody) {
  return postExternalSync('/api/payout-command/external-sync/loan-system', body)
}

/** Planned: pull PSP / bank settlement file metadata or deltas for the batch. */
export function postSettlementFeedPull(body: PullBody) {
  return postExternalSync('/api/payout-command/external-sync/settlement-feed', body)
}

/** Planned: query NACH / mandate status from bank or mandate bureau for batch beneficiaries. */
export function postMandateNachPull(body: PullBody) {
  return postExternalSync('/api/payout-command/external-sync/mandate-nach', body)
}
