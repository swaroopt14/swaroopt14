'use client'

import { motion } from 'framer-motion'
import { SpotlightCard } from './SpotlightCard'

const personas = [
  {
    title: 'Fintech Products',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zord-accent-400"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
    ),
    outcomes: [
      'Eliminate manual recon across multiple bank endpoints',
      'Build seamless lending disbursement flows',
      'Unified proof of payout for compliance',
    ]
  },
  {
    title: 'Marketplaces',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zord-accent-400"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
    ),
    outcomes: [
      'Automate vendor and seller settlements at scale',
      'Dynamic routing prevents mass payment blockages',
      'Instant visibility into partner balances',
    ]
  },
  {
    title: 'Finance & Ops Teams',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zord-accent-400"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"></path></svg>
    ),
    outcomes: [
      'Close books faster with normalized transaction exports',
      'One dashboard to investigate stuck transactions',
      'Role-based access controls for approvals',
    ]
  }
]

export function UseCases() {
  return (
    <section className="relative py-32 px-6 md:px-12 mx-auto max-w-[1200px]">
      <div className="flex flex-col md:flex-row gap-16 justify-between items-start mb-20 relative z-10 mt-10">
        <div className="max-w-[400px] space-y-6">
          <div className="inline-flex items-center rounded-full bg-white/5 border border-white/10 px-4 py-2 text-[12px] uppercase tracking-[0.25em] text-white/50 mb-2">
            Who uses Zord
          </div>
          <h2 className="text-[36px] md:text-[48px] font-semibold tracking-[-0.04em] text-white leading-[1.1]">
            Built for scale.
          </h2>
          <p className="text-[17px] text-white/50 leading-relaxed">
            Stop building fragile payout infrastructure. Zord provides the reliability required by high-stakes transactional businesses.
          </p>
        </div>

        <div className="w-full flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
          {personas.map((persona, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className={i === 2 ? 'md:col-span-2' : ''}
            >
              <SpotlightCard className={`p-8 bg-[#09090D] h-full flex flex-col group ${i === 2 ? 'md:flex-row md:items-center md:gap-8' : ''}`}>
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-white/10 to-transparent border border-white/10 flex items-center justify-center mb-6 group-hover:border-zord-accent-500/40 transition-colors">
                  {persona.icon}
                </div>
                <div>
                  <h3 className="text-[20px] font-medium text-white mb-4 group-hover:text-zord-accent-200 transition-colors">
                    {persona.title}
                  </h3>
                  <ul className="space-y-3">
                    {persona.outcomes.map((outcome, idx) => (
                      <li key={idx} className="flex items-start text-[14px] text-white/50 leading-relaxed">
                        <span className="text-zord-accent-400 mr-3 mt-1.5 opacity-60">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </span>
                        {outcome}
                      </li>
                    ))}
                  </ul>
                </div>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
