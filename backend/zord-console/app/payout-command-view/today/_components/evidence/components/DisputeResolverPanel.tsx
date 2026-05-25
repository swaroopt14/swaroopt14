'use client'

import { useState } from 'react'
import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { evidenceCopy } from '../copy/evidenceCopy'
import type { PackTableRowVm } from '../types/evidenceViewModels'
import { downloadDisputeBundle } from '../utils/verifyProofIntegrity'
import { getEvidencePackFull } from '@/services/payout-command/prod-api/getEvidencePacks'
import { mapProofTimeline } from '../mappers/mapProofTimeline'
import { deriveMissingProofChecklist } from '../selectors/deriveMissingProofChecklist'
import { EVIDENCE_ASK } from '../utils/evidenceFormat'

type DisputeResolverPanelProps = {
  packRows: PackTableRowVm[]
}

export function DisputeResolverPanel({ packRows }: DisputeResolverPanelProps) {
  const [paymentRef, setPaymentRef] = useState('')
  const [reason, setReason] = useState(evidenceCopy.dispute.reasons[0])
  const [packId, setPackId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const effectivePackId = packId || packRows[0]?.packId || ''

  const handleGenerate = async () => {
    if (!effectivePackId) {
      setMessage('Select an evidence pack first.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const full = await getEvidencePackFull(effectivePackId)
      if (!full) {
        setMessage('Could not load evidence pack.')
        return
      }
      const bundle = {
        generated_at: new Date().toISOString(),
        payment_reference: paymentRef || full.intent_id,
        dispute_reason: reason,
        evidence_pack_id: full.evidence_pack_id,
        proof_root: full.merkle_root,
        timeline: mapProofTimeline(full),
        missing_proof_checklist: deriveMissingProofChecklist(full),
        pack: full,
      }
      downloadDisputeBundle(bundle, full.evidence_pack_id)
      setMessage('Dispute evidence JSON downloaded. PDF summary requires export API.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={COMMAND_CENTER_KPI_CARD}>
      <CommandCenterCardGlow />
      <div className="relative border-b border-slate-100 px-5 py-4">
        <p className={`text-[17px] font-semibold ${HOME_TITLE_BLACK}`}>{evidenceCopy.dispute.title}</p>
        <p className={`mt-2 rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-[12px] font-medium text-amber-900`}>
          {evidenceCopy.dispute.apiBanner}
        </p>
      </div>
      <div className="relative space-y-4 p-5">
        <label className="block space-y-1">
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${EVIDENCE_ASK.muted}`}>
            {evidenceCopy.dispute.paymentRef}
          </span>
          <input
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            placeholder="Payment ref, invoice, or UTR"
            className={`h-10 w-full rounded-[0.85rem] border ${EVIDENCE_ASK.border} ${EVIDENCE_ASK.field} px-3 text-[15px] outline-none`}
          />
        </label>
        <label className="block space-y-1">
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${EVIDENCE_ASK.muted}`}>
            {evidenceCopy.dispute.reason}
          </span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={`h-10 w-full rounded-[0.85rem] border ${EVIDENCE_ASK.border} ${EVIDENCE_ASK.field} px-3 text-[15px] outline-none`}
          >
            {evidenceCopy.dispute.reasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${EVIDENCE_ASK.muted}`}>
            {evidenceCopy.dispute.selectPack}
          </span>
          <select
            value={effectivePackId}
            onChange={(e) => setPackId(e.target.value)}
            className={`h-10 w-full rounded-[0.85rem] border ${EVIDENCE_ASK.border} ${EVIDENCE_ASK.field} px-3 font-mono text-[14px] outline-none`}
          >
            {packRows.length === 0 ? <option value="">No packs loaded</option> : null}
            {packRows.map((r) => (
              <option key={r.packId} value={r.packId}>
                {r.packId} · {r.intentId}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !effectivePackId}
          onClick={() => void handleGenerate()}
          className="w-full rounded-[0.85rem] bg-[#111111] px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#222] disabled:opacity-50"
        >
          {evidenceCopy.dispute.generate}
        </button>
        {message ? <p className={`text-[13px] ${HOME_BODY_IMPERIAL_SM}`}>{message}</p> : null}
        <p className={`text-[12px] ${HOME_BODY_IMPERIAL_SM}`}>
          Output includes JSON evidence, proof hash, timeline, and missing proof checklist. PDF summary pending export API.
        </p>
      </div>
    </section>
  )
}
