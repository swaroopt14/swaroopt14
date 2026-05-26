'use client'

import { useState } from 'react'
import { evidenceCopy } from '../../copy/evidenceCopy'
import { EVIDENCE_CARD } from '../../evidencePageTokens'
import { EvidenceSectionHeader } from '../EvidenceSectionHeader'
import { getEvidencePackFull } from '@/services/payout-command/prod-api/getEvidencePacks'
import { downloadEvidenceJson } from '../../utils/verifyProofIntegrity'

type EvidenceExportCenterProps = {
  defaultPackId?: string
}

const inputClass =
  'h-10 w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 font-mono text-[14px] text-slate-900 shadow-sm outline-none focus:border-[#4a6fe6]/50 focus:ring-2 focus:ring-[#4a6fe6]/15'

const btnOutline =
  'rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50'

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
      <section className={EVIDENCE_CARD}>
        <EvidenceSectionHeader
          title={evidenceCopy.export.centerTitle}
          subtitle={evidenceCopy.export.centerSubtitle}
        />
        <div className="space-y-4 px-5 pb-5">
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Evidence Pack ID
            </span>
            <input
              value={packId}
              onChange={(e) => setPackId(e.target.value)}
              placeholder="EP-…"
              className={inputClass}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => pdfPending(evidenceCopy.export.financePdf)} className={btnOutline}>
              {evidenceCopy.export.financePdf}
            </button>
            <button type="button" onClick={() => pdfPending(evidenceCopy.export.auditPdf)} className={btnOutline}>
              {evidenceCopy.export.auditPdf}
            </button>
            <button type="button" onClick={() => pdfPending(evidenceCopy.export.bankPack)} className={btnOutline}>
              {evidenceCopy.export.bankPack}
            </button>
            <button type="button" onClick={() => pdfPending(evidenceCopy.export.disputePack)} className={btnOutline}>
              {evidenceCopy.export.disputePack}
            </button>
            <button
              type="button"
              onClick={() => void runJsonExport()}
              className="rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white shadow-md transition hover:opacity-95"
              style={{ background: 'linear-gradient(135deg,#103a9e 0%,#00239c 100%)' }}
            >
              {evidenceCopy.export.rawJson}
            </button>
          </div>

          {message ? (
            <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[13px] font-medium text-[#00239C]">
              {message}
            </p>
          ) : null}

          <p className="max-w-2xl text-[12px] leading-relaxed text-slate-500">
            Finance and audit PDF templates require Service 6 export endpoints. Raw JSON uses the loaded pack from{' '}
            <code className="font-mono text-[11px] text-slate-700">GET /api/prod/evidence/packs/:id</code>.
          </p>
        </div>
      </section>
    </div>
  )
}
