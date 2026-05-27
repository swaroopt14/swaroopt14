'use client'

import type { ReactNode } from 'react'
import { PORTAL_CARD } from './batchPortalTokens'

export function BatchPortalSection({
  title,
  children,
  className = '',
  titleTone = 'black',
}: {
  title: string
  children: ReactNode
  className?: string
  titleTone?: 'black' | 'blue'
}) {
  return (
    <section className={`${PORTAL_CARD} p-5 sm:p-6 ${className}`}>
      <h2
        className={
          titleTone === 'blue'
            ? 'text-[15px] font-semibold text-[#1e40af]'
            : 'text-[15px] font-bold tracking-[-0.01em] text-[#0f172a]'
        }
      >
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}
