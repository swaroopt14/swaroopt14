import { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  tone?: 'green' | 'blue' | 'slate' | 'pink'
  className?: string
}

const toneClasses: Record<NonNullable<BadgeProps['tone']>, string> = {
  green: 'bg-emerald-50 text-emerald-600',
  blue: 'bg-blue-50 text-blue-600',
  slate: 'bg-slate-100 text-slate-600',
  pink: 'bg-pink-50 text-pink-600',
}

export function Badge({ children, tone = 'slate', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-[10px] px-2.5 py-1 text-xs font-medium ${toneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
