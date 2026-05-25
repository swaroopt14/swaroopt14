'use client'

import { useState, useRef, useEffect } from 'react'
import { intentJournalCopy } from '../copy/intentJournalCopy'

type IntentJournalExportMenuProps = {
  onExportIntents: () => void
  onExportReviewItems: () => void
  disabled?: boolean
}

export function IntentJournalExportMenu({
  onExportIntents,
  onExportReviewItems,
  disabled,
}: IntentJournalExportMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/25 bg-white/5 px-4 text-[14px] font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        {intentJournalCopy.export.menuLabel}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-2 min-w-[220px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            className="block w-full px-4 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
            onClick={() => {
              onExportIntents()
              setOpen(false)
            }}
          >
            {intentJournalCopy.export.intentReport}
          </button>
          <button
            type="button"
            className="block w-full px-4 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
            onClick={() => {
              onExportReviewItems()
              setOpen(false)
            }}
          >
            {intentJournalCopy.export.reviewItems}
          </button>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            {intentJournalCopy.export.dispatchNotAvailable}
          </p>
          <p className="px-4 pb-2 text-xs text-slate-500">{intentJournalCopy.export.auditNotAvailable}</p>
        </div>
      ) : null}
    </div>
  )
}
