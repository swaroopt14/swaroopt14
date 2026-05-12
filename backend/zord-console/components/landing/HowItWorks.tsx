'use client'

import { motion } from 'framer-motion'
import { SpotlightCard } from './SpotlightCard'

const steps = [
  {
    step: '01',
    title: 'Receive Intent',
    description: 'Trigger a payout via simple REST API or batch upload. Zord standardizes the payload.',
    status: 'Captured',
  },
  {
    step: '02',
    title: 'Smart Routing',
    description: 'Engine evaluates provider health, speed, and cost, choosing the optimal path in milliseconds.',
    status: 'Routed',
  },
  {
    step: '03',
    title: 'Execute & Reconcile',
    description: 'Money moves. Webhooks confirm terminal status from the bank network in real time.',
    status: 'Confirmed',
  },
  {
    step: '04',
    title: 'Audit Proof',
    description: 'Immutable ledger entry created with UTR and bank reference. Ready for finance.',
    status: 'Recorded',
  },
]

export function HowItWorks() {
  return (
    <section className="relative py-32 px-6 md:px-12 mx-auto max-w-[1200px]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(102,51,238,0.05)_0%,transparent_50%)] pointer-events-none" />
      
      <div className="text-center mb-24 relative z-10 space-y-6">
        <div className="inline-flex items-center rounded-full bg-white/5 border border-white/10 px-4 py-2 text-[12px] md:text-[13px] uppercase tracking-[0.25em] text-white/50 mb-2">
          Architecture
        </div>
        <h2 className="text-[32px] md:text-[46px] font-semibold tracking-[-0.04em] text-white leading-[1.1]">
          The orchestration pipeline.
        </h2>
        <p className="text-[18px] text-white/50 max-w-[600px] mx-auto text-balance">
          A predictable, fault-tolerant state machine for your money movement.
        </p>
      </div>

      <div className="relative z-10 flex flex-col md:flex-row gap-6 md:gap-4 items-start pb-10">
        {/* Continuous horizontal/vertical connecting line */}
        <div className="hidden md:block absolute top-[44px] left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent z-0" />
        <div className="md:hidden absolute left-[32px] top-[10%] bottom-[10%] w-px bg-gradient-to-b from-transparent via-white/10 to-transparent z-0" />

        {steps.map((step, i) => (
          <motion.div
            key={i}
            className="relative flex-1 w-full"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.15, duration: 0.6 }}
          >
            <SpotlightCard className="p-8 h-full bg-[#05050A]/60 flex flex-col items-start min-h-[260px] group border border-white/5 backdrop-blur-sm z-10">
              <div className="flex items-center justify-between w-full mb-8">
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-[family:var(--font-zord-mono)] text-[12px] text-white/70 shadow-inner group-hover:bg-zord-accent-500/20 group-hover:text-zord-accent-200 transition-colors duration-500">
                  {step.step}
                </div>
                <div className="text-[11px] uppercase tracking-wider text-zord-status-healthy font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  {step.status}
                </div>
              </div>
              
              <h3 className="text-[20px] font-semibold text-white mb-3">
                {step.title}
              </h3>
              <p className="text-[15px] leading-relaxed text-white/50 group-hover:text-white/70 transition-colors">
                {step.description}
              </p>
            </SpotlightCard>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
