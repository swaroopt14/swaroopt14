'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { PortfolioLeakageViewModel } from '../normalizeLeakagePayload'
import { deriveWhatZordFound } from '../../leakage/selectors/deriveWhatZordFound'
import { leakageCopy } from '../../leakage/copy/leakageCopy'

type SystemInsightsCardProps = {
  data: PortfolioLeakageViewModel
}

export function SystemInsightsCard({ data }: SystemInsightsCardProps) {
  const pathname = usePathname()
  const insight = deriveWhatZordFound(data)

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-[15px] font-semibold text-slate-900">{leakageCopy.insight.title}</h2>

      <p className="mt-4 flex-1 text-[14px] leading-7 text-slate-600">{insight.paragraph}</p>

      {insight.criticalNote ? (
        <p className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-[13px] font-medium text-amber-950">
          {insight.criticalNote}
        </p>
      ) : null}

      <Link
        href={`${pathname}?dock=grid`}
        className="mt-4 inline-flex w-fit rounded-xl bg-slate-900 px-4 py-2 text-[14px] font-semibold text-white hover:bg-slate-800"
      >
        {leakageCopy.insight.openReview}
      </Link>
    </article>
  )
}
