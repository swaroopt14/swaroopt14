'use client'

import { motion } from 'framer-motion'
import { SpotlightCard } from './SpotlightCard'

const features = [
  {
    title: 'See why a payout failed',
    description: 'Stop guessing when money does not move. Zord shows the provider response, current status, and what needs action next.',
    span: 'col-span-1 md:col-span-2',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zord-accent-400">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
        <path d="m9 12 2 2 4-4"/>
      </svg>
    ),
    glow: 'bg-zord-accent-500/20',
  },
  {
    title: 'Know where money is stuck',
    description: 'Track payouts in real time instead of waiting on multiple systems or asking providers for updates.',
    span: 'col-span-1 md:col-span-1',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/90">
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        <path d="M12 15v2" />
      </svg>
    ),
    glow: 'bg-blue-500/10',
  },
  {
    title: 'Route through the best provider',
    description: 'Use the most reliable available provider so more payouts go through cleanly and fewer need manual follow-up.',
    span: 'col-span-1 md:col-span-1',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/90">
        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    ),
    glow: 'bg-emerald-500/10',
  },
  {
    title: 'Keep proof for every transaction',
    description: 'When finance, support, or audit asks what happened, Zord gives you a clear record you can trust and share quickly.',
    span: 'col-span-1 md:col-span-2',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zord-accent-400">
        <rect width="14" height="20" x="5" y="2" rx="2" ry="2"/>
        <path d="M9 14h6"/>
        <path d="M9 10h6"/>
        <path d="M9 18h6"/>
      </svg>
    ),
    glow: 'bg-zord-accent-500/20',
  },
]

export function FeaturesBento() {
  return (
    <section className="relative py-32 px-6 md:px-12 mx-auto max-w-[1200px]">
      <div className="text-center mb-20 relative z-10 space-y-6">
        <div className="inline-flex items-center rounded-full bg-white/5 border border-white/10 px-4 py-2 text-[12px] md:text-[13px] uppercase tracking-[0.25em] text-white/50 mb-2">
          Why teams need this
        </div>
        <h2 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.04em] text-white leading-[1.1]">
          Payouts break more often
          <br/>
          <span className="text-zord-accent-400">than you think.</span>
        </h2>
        <p className="text-[18px] md:text-[20px] text-white/60 max-w-[700px] mx-auto text-balance leading-relaxed">
          Payments fail with no clear reason, money gets stuck, provider sprawl creates blind spots, and reconciliation takes too much manual effort. Zord gives you control and visibility in one place.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
        {features.map((feature, i) => (
          <SpotlightCard key={i} className={`p-10 ${feature.span} group cursor-pointer hover:-translate-y-2 transition-transform duration-500 min-h-[320px] flex flex-col justify-between overflow-hidden relative`}>
            
            {/* Ambient inner glow behind the icon */}
            <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-[80px] ${feature.glow} opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none`} />

            <div>
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-white/10 to-transparent shadow-inner border border-white/10 group-hover:border-zord-accent-500/40 group-hover:bg-zord-accent-500/10 transition-colors duration-500">
                {feature.icon}
              </div>
              <h3 className="text-[24px] font-semibold text-white tracking-[-0.02em] group-hover:text-zord-accent-200 transition-colors">
                {feature.title}
              </h3>
              <p className="mt-4 text-[16px] leading-[1.8] text-white/50 group-hover:text-white/70 transition-colors">
                {feature.description}
              </p>
            </div>
            
            <div className="mt-8 pt-6 border-t border-white/5 flex items-center text-[14px] font-medium text-white/30 group-hover:text-zord-accent-400 transition-colors">
              See how Zord helps
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2 translate-x-0 group-hover:translate-x-1 transition-transform">
                <path d="M5 12h14"/>
                <path d="m12 5 7 7-7 7"/>
              </svg>
            </div>
          </SpotlightCard>
        ))}
      </div>
    </section>
  )
}
