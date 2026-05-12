'use client'

import { motion } from 'framer-motion'
import { SpotlightCard } from './SpotlightCard'
import Link from 'next/link'
import Image from 'next/image'

export function TrustLayer() {
  return (
    <section className="relative py-32 px-6 md:px-12 mx-auto w-full max-w-[1400px] flex flex-col items-center justify-center text-center">
      {/* Massive gradient background mimicking bottom of UI image */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[800px] w-full bg-[radial-gradient(ellipse_at_bottom,rgba(102,51,238,0.5)_0%,rgba(61,31,142,0.25)_30%,transparent_70%)]" />

      <h2 className="relative z-10 text-[32px] md:text-[46px] font-semibold tracking-[-0.04em] text-white">
        Built for high-volume payouts
      </h2>
      <p className="relative z-10 mt-4 text-[16px] text-white/50 max-w-[600px] mx-auto text-balance">
        Handles thousands of transactions with real-time tracking and reliable execution.
      </p>

      <motion.div 
        className="relative z-10 w-full max-w-[900px] mt-16"
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <SpotlightCard className="p-8 md:p-14 text-center liquid-glass backdrop-blur-3xl border border-white/5 bg-[#05050A]/70 shadow-[0_32px_120px_rgba(102,51,238,0.15)]">
          {/* Logo Mark Top */}
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/5 border border-white/10 mb-8 shadow-inner">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zord-accent-400">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>

          <h3 className="text-[22px] md:text-[28px] font-medium leading-relaxed text-white text-balance mx-auto max-w-[600px]">
            &quot;We finally have one place to send payouts, track delivery, and answer finance when they ask what happened.&quot;
          </h3>

          <div className="mt-8 flex flex-col items-center">
            <div className="relative w-12 h-12 mb-3 rounded-full overflow-hidden border border-white/20 shadow-[0_0_15px_rgba(102,51,238,0.4)]">
              <Image src="/images/ops_lead_avatar.png" alt="Operations Lead" fill className="object-cover" />
            </div>
            <p className="text-[14px] font-medium text-white/90">Sarah Jenkins</p>
            <p className="text-[12px] text-white/40">VP of Operations, Marketplace</p>
          </div>

          <div className="mt-14 mb-4 border-t border-white/5 pt-10 flex flex-wrap justify-center gap-6">
            {['Marketplaces', 'NBFC / Lending', 'SaaS & Platforms'].map((badge) => (
              <div
                key={badge}
                className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 shadow-inner border border-white/5"
              >
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-zord-accent-500/20">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-zord-accent-400"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <span className="text-[12px] font-medium text-white/70 tracking-wide">{badge}</span>
              </div>
            ))}
          </div>
        </SpotlightCard>
      </motion.div>

      <div className="relative z-10 mt-24 mb-10 text-center flex flex-col items-center">
        <h2 className="text-[32px] md:text-[46px] font-semibold tracking-[-0.04em] text-white leading-tight max-w-[700px]">
          Take control of your payouts
        </h2>
        <p className="mt-4 max-w-[540px] text-[16px] leading-8 text-white/56">
          Reduce failures. Track everything. Stay audit-ready.
        </p>
        <div className="mt-10 mb-6">
          <Link
            href="/app-final"
            className="group relative inline-flex items-center justify-center rounded-full bg-white px-8 py-3.5 text-[15px] font-semibold text-black shadow-[0_0_30px_rgba(255,255,255,0.4)] transition-all hover:bg-zinc-200 hover:scale-[1.02] focus:scale-[0.98]"
          >
            Book Demo
          </Link>
        </div>
      </div>
    </section>
  )
}
