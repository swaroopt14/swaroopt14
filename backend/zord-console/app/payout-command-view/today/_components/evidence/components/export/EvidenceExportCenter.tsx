'use client'

import { useState } from 'react'
import { CommandCenterCardGlow } from '../../../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../../command-center/homeCommandCenterTokens'
import { evidenceCopy } from '../../copy/evidenceCopy'
import { EVIDENCE_ASK } from '../../utils/evidenceFormat'
import { getEvidencePackFull } from '@/services/payout-command/prod-api/getEvidencePacks'
import { downloadEvidenceJson } from '../../utils/verifyProofIntegrity'

type EvidenceExportCenterProps = {
  defaultPackId?: string
}

export function EvidenceExportCenter({ defaultPackId = '' }: EvidenceExportCenterProps) {
  const [packId, setPackId] = useState(defaultPackId)
  const [message, setMessage] = useState<string | null>(null)

  const runJsonExport = async () => {
    const id = packId.trim()
    if (!id) {
      setMessage('Enter an evidence pack ID.')
      return
    }
    const full = await getEvidencePackFull(id)
    if (!full) {
      setMessage('Pack not found or evidence service unavailable.')
      return
    }
    downloadEvidenceJson(full)
    setMessage(`Downloaded raw JSON for ${full.evidence_pack_id}.`)
  }

  const pdfPending = (label: string) => {
    setMessage(`${label}: ${evidenceCopy.export.apiPending}`)
  }

  return (
    <div className="space-y-5">
      <header className={COMMAND_CENTER_KPI_CARD}>
        <CommandCenterCardGlow />
        <div className="relative p-5 sm:p-6">
          <p className={`text-[20px] font-semibold ${HOME_TITLE_BLACK}`}>{evidenceCopy.export.centerTitle}</p>
          <p className={`mt-1 max-w-2xl ${HOME_BODY_IMPERIAL_SM}`}>{evidenceCopy.export.centerSubtitle}</p>
        </div>
      </header>

      <section className={COMMAND_CENTER_KPI_CARD}>
        <CommandCenterCardGlow />
        <div className="relative space-y-4 p-5 sm:p-6">
          <label className="block space-y-1">
            <span className={`text-[11px] font-semibold uppercase tracking-wide ${EVIDENCE_ASK.muted}`}>
              Evidence Pack ID
            </span>
            <input
              value={packId}
              onChange={(e) => setPackId(e.target.value)}
              placeholder="EP-…"
              className={`h-10 w-full max-w-md rounded-[0.85rem] border ${EVIDENCE_ASK.border} ${EVIDENCE_ASK.field} px-3 font-mono text-[14px] outline-none`}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => pdfPending(evidenceCopy.export.financePdf)}
              className={`rounded-[0.85rem] border ${EVIDENCE_ASK.border} bg-white px-3 py-2 text-[14px] font-semibold text-[#111111] hover:bg-[#fafafa]`}
            >
              {evidenceCopy.export.financePdf}
            </button>
            <button
              type="button"
              onClick={() => pdfPending(evidenceCopy.export.auditPdf)}
              className={`rounded-[0.85rem] border ${EVIDENCE_ASK.border} bg-white px-3 py-2 text-[14px] font-semibold text-[#111111] hover:bg-[#fafafa]`}
            >
              {evidenceCopy.export.auditPdf}
            </button>
            <button
              type="button"
              onClick={() => pdfPending(evidenceCopy.export.bankPack)}
              className={`rounded-[0.85rem] border ${EVIDENCE_ASK.border} bg-white px-3 py-2 text-[14px] font-semibold text-[#111111] hover:bg-[#fafafa]`}
            >
              {evidenceCopy.export.bankPack}
            </button>
            <button
              type="button"
              onClick={() => pdfPending(evidenceCopy.export.disputePack)}
              className={`rounded-[0.85rem] border ${EVIDENCE_ASK.border} bg-white px-3 py-2 text-[14px] font-semibold text-[#111111] hover:bg-[#fafafa]`}
            >
              {evidenceCopy.export.disputePack}
            </button>
            <button
              type="button"
              onClick={() => void runJsonExport()}
              className="rounded-[0.85rem] bg-[#111111] px-3 py-2 text-[14px] font-semibold text-white hover:bg-[#222]"
            >
              {evidenceCopy.export.rawJson}
            </button>
          </div>

          {message ? <p className="text-[13px] text-[#475569]">{message}</p> : null}

          <p className={`max-w-2xl text-[13px] ${HOME_BODY_IMPERIAL_SM}`}>
            Finance and audit PDF templates require Service 6 export endpoints. Raw JSON uses the loaded pack from{' '}
            <code className="font-mono text-[12px]">GET /api/prod/evidence/packs/:id</code>.
          </p>
        </div>
      </section>
    </div>
  )
}
