import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`liquid-glass rounded-[16px] p-1 transition-all duration-400 ease-out hover:-translate-y-[2px] group relative overflow-hidden ${className}`}
      style={{
        background: '#B8BBC4',
        border: '1px solid rgba(255,255,255,0.42)',
        boxShadow:
          '14px 14px 28px rgba(100,105,122,0.26), -10px -10px 22px rgba(255,255,255,0.58), inset 1px 1px 0 rgba(255,255,255,0.38)',
      }}
    >
      <div className="absolute inset-0 opacity-0 transition-opacity duration-500 pointer-events-none group-hover:opacity-100 bg-white/40" />
      <div
        className="relative z-10 h-full w-full rounded-[12px] p-5"
        style={{
          background: '#C2C5CE',
          border: '1px solid rgba(255,255,255,0.42)',
          boxShadow:
            '6px 6px 14px rgba(100,105,122,0.28), -3px -3px 9px rgba(255,255,255,0.52), inset 0.5px 0.5px 0 rgba(255,255,255,0.36)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
