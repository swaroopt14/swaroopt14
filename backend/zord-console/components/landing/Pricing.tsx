'use client'

import { motion } from 'framer-motion'
import { SpotlightCard } from './SpotlightCard'
import Link from 'next/link'

export function Pricing() {
  return (
    <section className="relative py-32 px-6 md:px-12 mx-auto max-w-[1200px]">
      <div className="text-center mb-20 relative z-10 space-y-6">
        <h2 className="text-[36px] md:text-[46px] font-semibold tracking-[-0.04em] text-white leading-[1.1]">
          Simple, volume-based pricing.
        </h2>
        <p className="text-[17px] text-white/50 max-w-[500px] mx-auto text-balance">
          Pay only for successful orchestrations. No hidden setup fees or minimums.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 max-w-[900px] mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <SpotlightCard className="p-10 h-full flex flex-col bg-[#05050A]/80 border-white/5">
            <div className="mb-8">
              <h3 className="text-[24px] font-semibold text-white mb-2">Platform</h3>
              <p className="text-[14px] text-white/50">For startups and growing teams managing moderate volume.</p>
            </div>
            
            <div className="mb-8 flex items-baseline gap-2">
              <span className="text-[48px] font-semibold text-white tracking-[-0.04em]">₹1.5</span>
              <span className="text-[14px] text-white/50">/ payout</span>
            </div>

            <ul className="space-y-4 mb-10 flex-1">
              {[
                'Smart routing engine',
                'Real-time status webhooks',
                'Bank reconciliation proof',
                'Standard email support',
              ].map((feature, i) => (
                <li key={i} className="flex items-start text-[14px] text-white/70">
                  <span className="text-white/30 mr-3 mt-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <Link
              href="/app-final"
              className="w-full inline-flex justify-center rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-[14px] font-medium text-white transition-all hover:bg-white/10 focus:outline-none"
            >
              Get Started
            </Link>
          </SpotlightCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {/* Custom style for the primary card to make it glow slightly */}
          <div className="relative h-full">
            <div className="absolute inset-0 bg-zord-accent-500/20 blur-[50px] rounded-[24px] pointer-events-none" />
            <SpotlightCard className="p-10 h-full flex flex-col bg-gradient-to-b from-[#0B0A14] to-[#05050A] border zord-accent-500/30 relative shadow-[0_0_40px_rgba(102,51,238,0.15)] ring-1 ring-zord-accent-500/50">
              
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-zord-accent-500 to-transparent" />
              
              <div className="absolute top-4 right-4 bg-zord-accent-500/20 text-zord-accent-200 border border-zord-accent-500/30 px-3 py-1 rounded-full text-[10px] uppercase font-semibold tracking-widest">
                Most Popular
              </div>

              <div className="mb-8 pr-20">
                <h3 className="text-[24px] font-semibold text-white mb-2">Scale</h3>
                <p className="text-[14px] text-white/50">Custom pricing for platforms doing 50k+ transactions a month.</p>
              </div>
              
              <div className="mb-8 flex items-baseline gap-2">
                <span className="text-[48px] font-semibold text-white tracking-[-0.04em]">Custom</span>
              </div>

              <ul className="space-y-4 mb-10 flex-1">
                {[
                  'Volume-based tier discounts',
                  'Dedicated account manager',
                  'Custom routing logic builder',
                  'Slack connect channel',
                  '99.99% uptime SLA',
                ].map((feature, i) => (
                  <li key={i} className="flex items-start text-[14px] text-white/90">
                    <span className="text-zord-accent-400 mr-3 mt-1">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href="/app-final"
                className="w-full inline-flex justify-center rounded-xl bg-white px-4 py-3 text-[14px] font-medium text-black transition-all hover:bg-zinc-200 focus:outline-none focus:scale-[0.98]"
              >
                Contact Sales
              </Link>
            </SpotlightCard>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
