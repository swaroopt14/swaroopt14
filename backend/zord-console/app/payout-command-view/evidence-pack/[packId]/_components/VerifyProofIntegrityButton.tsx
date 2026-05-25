'use client'

import { useState } from 'react'
import { evidenceCopy } from '../../../today/_components/evidence/copy/evidenceCopy'
import { verifyProofIntegrityClient } from '../../../today/_components/evidence/utils/verifyProofIntegrity'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'

type VerifyProofIntegrityButtonProps = {
  pack: EvidencePackFull | null
}

export function VerifyProofIntegrityButton({ pack }: VerifyProofIntegrityButtonProps) {
  const [result, setResult] = useState<ReturnType<typeof verifyProofIntegrityClient> | null>(null)

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setResult(verifyProofIntegrityClient(pack))}
        className="rounded-[0.85rem] border border-[#E5E5E5] bg-white px-4 py-2 text-[14px] font-semibold text-[#111111] transition hover:border-[#4ADE80]/30"
      >
        {evidenceCopy.verify.button}
      </button>
      {result ? (
        <div
          className={`rounded-lg border px-3 py-2 text-[13px] ${
            result.ok ? 'border-[#4ADE80]/40 bg-[#f0fdf4] text-[#166534]' : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <p className="font-medium">{result.message}</p>
          {result.proofRoot ? (
            <p className="mt-1 font-mono text-[11px] break-all">Proof root: {result.proofRoot}</p>
          ) : null}
          {result.verifiedAt ? (
            <p className="mt-1 text-[12px]">Verified at: {new Date(result.verifiedAt).toLocaleString()}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
