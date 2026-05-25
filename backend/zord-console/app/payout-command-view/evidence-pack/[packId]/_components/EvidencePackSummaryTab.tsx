'use client'

import { evidenceCopy, PROOF_SCORE_TOOLTIP } from '../../../today/_components/evidence/copy/evidenceCopy'
import { mapProofCoverageFromPack } from '../../../today/_components/evidence/mappers/mapProofCoverage'
import { mapProofStatusFromPack } from '../../../today/_components/evidence/mappers/mapProofStatus'
import { computePackProofScore } from '../../../today/_components/evidence/mappers/mapPackTableRow'
import { ProofCoverageSection } from '../../../today/_components/evidence/components/ProofCoverageSection'
import { VerifyProofIntegrityButton } from './VerifyProofIntegrityButton'
import { MissingProofChecklist } from './MissingProofChecklist'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'
import { EXPECTED_PROOF_ITEMS } from '../../../today/_components/evidence/types/evidenceViewModels'

type EvidencePackSummaryTabProps = {
  pack: EvidencePackFull | null
  batchId: string
  loading: boolean
}

export function EvidencePackSummaryTab({ pack, batchId, loading }: EvidencePackSummaryTabProps) {
  if (loading) return <p className="text-[15px] text-[#6f716d]">Loading evidence pack…</p>
  if (!pack) {
    return (
      <div>
        <p className="text-[16px] font-semibold text-[#111111]">{evidenceCopy.empty.noPack}</p>
        <p className="mt-2 text-[15px] text-[#6f716d]">{evidenceCopy.empty.noPackHint}</p>
      </div>
    )
  }

  const status = mapProofStatusFromPack(
    {
      evidence_pack_id: pack.evidence_pack_id,
      tenant_id: pack.tenant_id,
      intent_id: pack.intent_id,
      contract_id: pack.contract_id,
      mode: pack.mode,
      pack_status: pack.pack_status,
      merkle_root: pack.merkle_root,
      ruleset_version: pack.ruleset_version,
      created_at: pack.created_at,
      proof_status: pack.proof_status,
      proof_score: pack.proof_score,
      artifact_count: pack.items?.length,
    },
    pack.items?.length,
  )
  const score =
    pack.proof_score != null ? Math.round(Number(pack.proof_score)) : computePackProofScore(pack.items?.length)
  const coverage = mapProofCoverageFromPack(pack)

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryField label="Payment Ref" value={pack.intent_id || '—'} mono />
        <SummaryField label="Batch" value={batchId || '—'} mono />
        <SummaryField label="Evidence Pack ID" value={pack.evidence_pack_id} mono />
        <SummaryField label="Proof status" value={status.label} />
        <SummaryField
          label="Proof score"
          value={score != null ? `${score} / 100` : '—'}
          hint={PROOF_SCORE_TOOLTIP}
        />
        <SummaryField label="Match confidence" value="—" hint="Requires attachment API on pack detail" />
        <SummaryField label="Beneficiary" value="•••••• (masked)" hint="Full beneficiary controlled by access policy" />
        <SummaryField label="Amount" value="—" hint="Load from payment instruction service" />
        <SummaryField label="Final status" value={pack.pack_status} />
      </div>
      <ProofCoverageSection tiles={coverage} />
      <MissingProofChecklist pack={pack} />
      <VerifyProofIntegrityButton pack={pack} />
      <p className="text-[12px] text-[#94a3b8]">
        Proof items: {pack.items?.length ?? 0} / {EXPECTED_PROOF_ITEMS} available
      </p>
    </div>
  )
}

function SummaryField({
  label,
  value,
  mono,
  hint,
}: {
  label: string
  value: string
  mono?: boolean
  hint?: string
}) {
  return (
    <div className="rounded-[12px] border border-[#E5E5E5] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">{label}</p>
      <p className={`mt-1 text-[16px] font-semibold text-[#111111] ${mono ? 'font-mono text-[14px]' : ''}`}>
        {value}
      </p>
      {hint ? <p className="mt-2 text-[12px] leading-relaxed text-[#6f716d]">{hint}</p> : null}
    </div>
  )
}
