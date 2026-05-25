'use client'

import { useState } from 'react'
import { evidenceCopy } from '../../../today/_components/evidence/copy/evidenceCopy'
import { downloadEvidenceJson } from '../../../today/_components/evidence/utils/verifyProofIntegrity'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'

type EvidencePackExportTabProps = {
  pack: EvidencePackFull | null
}

export function EvidencePackExportTab({ pack }: EvidencePackExportTabProps) {
  const [message, setMessage] = useState<string | null>(null)

  const pdfPending = (label: string) => setMessage(`${label}: ${evidenceCopy.export.apiPending}`)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => pdfPending('Finance Summary PDF')}
          className="rounded-[0.85rem] border border-[#E5E5E5] bg-white px-3 py-2 text-[14px] font-semibold hover:bg-[#fafafa]"
        >
          {evidenceCopy.export.financePdf}
        </button>
        <button
          type="button"
          onClick={() => pdfPending('Audit Evidence PDF')}
          className="rounded-[0.85rem] border border-[#E5E5E5] bg-white px-3 py-2 text-[14px] font-semibold hover:bg-[#fafafa]"
        >
          {evidenceCopy.export.auditPdf}
        </button>
        <button
          type="button"
          onClick={() => pdfPending('Bank / PSP Dispute Pack')}
          className="rounded-[0.85rem] border border-[#E5E5E5] bg-white px-3 py-2 text-[14px] font-semibold hover:bg-[#fafafa]"
        >
          {evidenceCopy.export.bankPack}
        </button>
        <button
          type="button"
          onClick={() => pdfPending('Customer Dispute Pack')}
          className="rounded-[0.85rem] border border-[#E5E5E5] bg-white px-3 py-2 text-[14px] font-semibold hover:bg-[#fafafa]"
        >
          {evidenceCopy.export.disputePack}
        </button>
        <button
          type="button"
          disabled={!pack}
          onClick={() => {
            if (!pack) return
            downloadEvidenceJson(pack)
            setMessage(`Downloaded raw JSON for ${pack.evidence_pack_id}.`)
          }}
          className="rounded-[0.85rem] bg-[#111111] px-3 py-2 text-[14px] font-semibold text-white hover:bg-[#222] disabled:opacity-50"
        >
          {evidenceCopy.export.rawJson}
        </button>
      </div>
      {message ? <p className="text-[13px] text-[#475569]">{message}</p> : null}
    </div>
  )
}
