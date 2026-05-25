'use client'

import { PROOF_NODE_BUSINESS_LABELS, evidenceCopy } from '../../../today/_components/evidence/copy/evidenceCopy'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'

const SERVICE_LABELS: Record<string, string> = {
  CANONICAL_INTENT: 'Structured Intent',
  RAW_INGRESS_ENVELOPE: 'Payment Instruction',
  GOVERNANCE_DECISION_AT_CANONICAL: 'Governance Check',
  CANONICAL_SETTLEMENT_OBSERVATION: 'Settlement Record',
  RAW_SETTLEMENT_ENVELOPE: 'Settlement Record',
  ATTACHMENT_DECISION: 'Match Decision',
  FINAL_CONTRACT: 'Final Payment Outcome',
  FINAL_EVIDENCE_VIEW: 'Evidence Summary',
}

type EvidencePackItemsTabProps = {
  pack: EvidencePackFull | null
  loading: boolean
}

export function EvidencePackItemsTab({ pack, loading }: EvidencePackItemsTabProps) {
  if (loading) return <p className="text-[15px] text-[#6f716d]">Loading evidence items…</p>
  if (!pack?.items?.length) {
    return <p className="text-[15px] text-[#6f716d]">{evidenceCopy.empty.noPackHint}</p>
  }

  return (
    <div className="overflow-x-auto rounded-[12px] border border-[#E5E5E5]">
      <table className="min-w-[640px] w-full text-left text-[14px]">
        <thead className="bg-[#fcfcfa] text-[11px] font-semibold uppercase tracking-wide text-[#8a8a86]">
          <tr>
            <th className="px-4 py-3">Proof item</th>
            <th className="px-4 py-3">Technical type</th>
            <th className="px-4 py-3">Reference</th>
            <th className="px-4 py-3">Hash</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E5E5]">
          {pack.items.map((it, i) => {
            const typeKey = (it.type || '').toUpperCase()
            const label =
              SERVICE_LABELS[typeKey] ||
              PROOF_NODE_BUSINESS_LABELS[typeKey] ||
              typeKey.replace(/_/g, ' ')
            const hash = apiTrimmedString(it.hash) || apiTrimmedString(it.leaf_hash) || '—'
            return (
              <tr key={`${typeKey}-${i}`}>
                <td className="px-4 py-3 font-medium text-[#111111]">{label}</td>
                <td className="px-4 py-3 font-mono text-[12px] text-[#475569]">{typeKey || '—'}</td>
                <td className="px-4 py-3 font-mono text-[12px]">{apiTrimmedString(it.ref) || '—'}</td>
                <td className="max-w-[16rem] truncate px-4 py-3 font-mono text-[11px]" title={hash}>
                  {hash}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
