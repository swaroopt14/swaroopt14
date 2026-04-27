'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { GlyphName } from './model'

export function Glyph({ name, className = '' }: { name: GlyphName; className?: string }) {
  const base = `inline-block ${className}`

  switch (name) {
    case 'home':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M4 8.6 10 3.8l6 4.8v7.1H4V8.6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M8.2 15.7v-4.6h3.6v4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'arrow-up-right':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M6 14 14 6M8 6h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'document':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M6 3.8h5.8L15 7v9.2A1.8 1.8 0 0 1 13.2 18H6.8A1.8 1.8 0 0 1 5 16.2V5.6A1.8 1.8 0 0 1 6.8 3.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M11.8 3.8V7H15M7.8 10.2h4.8M7.8 13h4.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'menu-dots':
      return <svg className={base} viewBox="0 0 20 20" fill="currentColor"><circle cx="5" cy="10" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="15" cy="10" r="1.6" /></svg>
    case 'search':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="5.8" stroke="currentColor" strokeWidth="1.7" /><path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
    case 'users':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M6.2 9.3a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2ZM13.8 8.6a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" stroke="currentColor" strokeWidth="1.5" /><path d="M2.8 15.8c.3-2.5 2.4-4.3 5.1-4.3s4.8 1.8 5.1 4.3M11.4 15.8c.2-1.9 1.8-3.2 3.9-3.2 1 0 2 .3 2.7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    case 'bank':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M3 7.2 10 3l7 4.2M4.5 8.5v6.8M8 8.5v6.8M12 8.5v6.8M15.5 8.5v6.8M2.5 16.5h15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'folder':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M3.5 6.2A2.2 2.2 0 0 1 5.7 4h2l1.6 1.6h5a2.2 2.2 0 0 1 2.2 2.2v6.5a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2V6.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
    case 'shield':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M10 2.5 4.5 4.8v4.5c0 4 2.3 6.3 5.5 8.2 3.2-1.9 5.5-4.2 5.5-8.2V4.8L10 2.5Z" stroke="currentColor" strokeWidth="1.6" /><path d="m7.3 10.1 1.8 1.8 3.6-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'grid':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" /><rect x="12" y="3" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" /><rect x="3" y="12" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" /><rect x="12" y="12" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" /></svg>
    case 'eye':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" stroke="currentColor" strokeWidth="1.6" /><circle cx="10" cy="10" r="2.4" fill="currentColor" /></svg>
    case 'zap':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M10.7 2.8 5.8 10h3l-.5 7.2 5-7.3h-3l.4-7.1Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'refresh':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M16 6.5V3.8l-2.6 2.3A6.2 6.2 0 1 0 16 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'chart':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M4 14.5V9.5M10 14.5V5.5M16 14.5V7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M3 16.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
    default:
      return null
  }
}

export function ClientChart({
  className,
  children,
}: {
  className: string
  children: ReactNode
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return <div className={`min-h-[8rem] min-w-0 ${className}`}>{mounted ? children : null}</div>
}

export function LightCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <article className={`rounded-[1.6rem] border border-black/10 bg-white p-5 shadow-[0_10px_24px_rgba(0,0,0,0.04)] ${className}`}>
      {children}
    </article>
  )
}

export function SurfaceEyebrow({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#9a9a95]">{children}</div>
}
