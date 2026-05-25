'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ambiguityCopy } from '../copy/ambiguityCopy'

export function AmbiguityActionBar() {
  const pathname = usePathname()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`${pathname}?dock=grid`}
        className="rounded-xl bg-slate-900 px-4 py-2 text-[14px] font-semibold text-white hover:bg-slate-800"
      >
        {ambiguityCopy.actions.reviewUnclear}
      </Link>
      <Link
        href={`${pathname}?dock=grid`}
        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[14px] font-semibold text-slate-700 hover:bg-slate-50"
      >
        {ambiguityCopy.actions.openMissingRefs}
      </Link>
      <button
        type="button"
        onClick={async () => {
          const res = await fetch('/api/prod/exports/review-list', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
          })
          const body = await res.json().catch(() => ({}))
          setMessage(body.message || ambiguityCopy.actions.exportPending)
        }}
        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[14px] font-semibold text-slate-700 hover:bg-slate-50"
      >
        {ambiguityCopy.actions.exportList}
      </button>
      {message ? <p className="w-full text-[12px] text-slate-500">{message}</p> : null}
    </div>
  )
}
