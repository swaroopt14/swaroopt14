'use client'

import { motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { VaultDemo } from './VaultDemo'

export function Hero() {
  const shouldReduceMotion = useReducedMotion()
  const revealEase = [0.22, 1, 0.36, 1] as const

  return (
    <motion.section
      className="relative min-h-[calc(100vh-78px)] overflow-hidden rounded-[48px] lg:min-h-[calc(100vh-84px)] mx-2 mt-4 mb-16 flex flex-col items-center pt-[140px] border border-white/5 bg-[#030305]"
      initial={shouldReduceMotion ? undefined : { opacity: 0, y: 38 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? undefined : { duration: 0.95, ease: revealEase }}
    >
      {/* Intense Top-Down Radial Purple Glow */}
      <div className="pointer-events-none absolute inset-x-0 top-[-25%] h-[1400px] w-full bg-[radial-gradient(ellipse_at_top,rgba(112,61,248,0.7)_0%,rgba(71,41,162,0.45)_30%,rgba(10,10,15,0)_75%)]" />
      <div className="zord-dots pointer-events-none absolute inset-0 opacity-50 mix-blend-overlay" />
      
      {/* Content Container (Expanded & Centered layout) */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-[1000px] mt-[40px]">
        
        <motion.div 
          className="inline-flex items-center rounded-full bg-white/5 backdrop-blur-md px-5 py-2 mb-10 border border-white/10 shadow-[0_8px_32px_rgba(102,51,238,0.25)]"
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: -20 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? undefined : { duration: 0.8, delay: 0.1 }}
        >
          <span className="flex h-2 w-2 rounded-full bg-zord-accent-400 mr-3 animate-pulse shadow-[0_0_12px_rgba(102,51,238,0.9)]" />
          <span className="text-[13px] font-semibold uppercase tracking-[0.25em] text-zord-accent-100">
            Real-Time Payout Control
          </span>
        </motion.div>
        
        <motion.h1 
          className="text-[64px] font-semibold leading-[1.05] tracking-[-0.04em] text-white sm:text-[84px] lg:text-[104px] text-balance drop-shadow-2xl"
          initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.95 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, scale: 1 }}
          transition={shouldReduceMotion ? undefined : { duration: 0.9, delay: 0.2 }}
        >
          Send money reliably.
          <br />
          Know exactly what happened.
        </motion.h1>
        
        <motion.p 
          className="mt-8 text-[20px] leading-9 text-white/70 sm:text-[24px] text-balance max-w-[800px]"
          initial={shouldReduceMotion ? undefined : { opacity: 0 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1 }}
          transition={shouldReduceMotion ? undefined : { duration: 0.9, delay: 0.3 }}
        >
          Zord helps you send payouts without failures, track every transaction in real time, and get clear proof when money is delivered.
        </motion.p>

        <motion.div 
          className="mt-14 flex flex-wrap items-center justify-center gap-6"
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 20 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? undefined : { duration: 0.9, delay: 0.4 }}
        >
          <Link
            href="/app-final"
            className="group relative inline-flex items-center justify-center rounded-full bg-white px-10 py-5 text-[17px] font-semibold text-black shadow-[0_0_40px_rgba(255,255,255,0.3)] transition-all hover:bg-zinc-200 hover:scale-[1.02] focus:scale-[0.98]"
          >
            Book Demo
          </Link>
          <Link
            href="/console/login"
            className="rounded-full border border-white/20 bg-white/5 backdrop-blur-md px-10 py-5 text-[17px] font-medium text-white transition-all hover:bg-white/15 hover:border-white/30 focus:scale-[0.98] shadow-inner"
          >
            See how it works
          </Link>
        </motion.div>
      </div>

      {/* Hero Visual Pane: Outer wrapper for initial entrance animation */}
      <motion.div
        className="relative z-10 w-full max-w-[1100px] mt-[80px] mb-12 mx-auto perspective-[2000px]"
        initial={shouldReduceMotion ? undefined : { opacity: 0, y: 80 }}
        animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={shouldReduceMotion ? undefined : { duration: 1, delay: 0.5, ease: revealEase }}
      >
        {/* Inner floating wrapper */}
        <motion.div 
          className="w-full liquid-glass p-3 shadow-[0_32px_120px_rgba(102,51,238,0.25)] border-t border-white/20"
          animate={shouldReduceMotion ? undefined : { y: [0, -16, 0] }}
          transition={shouldReduceMotion ? undefined : { 
            duration: 6, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
        >
          <div className="flex items-center px-6 py-4 border-b border-white/10 mb-4 gap-3 bg-gradient-to-b from-white/5 to-transparent">
            <div className="flex gap-2">
              <div className="w-3.5 h-3.5 rounded-full bg-white/20 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] transition-colors hover:bg-white/40" />
              <div className="w-3.5 h-3.5 rounded-full bg-white/20 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] transition-colors hover:bg-white/40" />
              <div className="w-3.5 h-3.5 rounded-full bg-white/20 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] transition-colors hover:bg-white/40" />
            </div>
            <div className="mx-auto text-[12px] uppercase font-[family:var(--font-zord-mono)] text-white/50 tracking-[0.25em]">
              Zord Control Center • Live View
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6 p-6">
            <div className="space-y-4">
              <VaultDemo label="Payout Route" originalText="Best available provider selected" />
              <VaultDemo label="Transaction Status" originalText="Confirmed by bank in 42s" />
              <VaultDemo label="Proof Record" originalText="Webhook + bank ref + audit log" />
            </div>

            <div className="h-full rounded-[20px] bg-[#050508]/80 backdrop-blur-2xl border border-white/5 p-8 font-[family:var(--font-zord-mono)] text-[14px] leading-8 text-white/70 shadow-[inset_0_0_80px_rgba(102,51,238,0.05)] flex flex-col justify-center relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-zord-accent-500/10 blur-[60px] rounded-full group-hover:bg-zord-accent-500/20 transition-colors duration-700 pointer-events-none" />
              
              <div className="text-zord-accent-300 font-semibold mb-4 text-[15px]">LIVE PAYOUT STATUS</div>
              <div className="text-white/40">{'{'}</div>
              <div className="pl-6 text-[#93c5fd]">&quot;payout_id&quot;: <span className="text-white">&quot;pyt_89fca12b&quot;</span>,</div>
              <div className="pl-6 text-[#93c5fd]">&quot;provider&quot;: <span className="text-white">&quot;Cashfree&quot;</span>,</div>
              <div className="pl-6 text-[#93c5fd]">&quot;status&quot;: <span className="text-zord-status-healthy">&quot;confirmed&quot;</span>,</div>
              <div className="pl-6 text-[#93c5fd]">&quot;proof_ready&quot;: <span className="text-white">true</span></div>
              <div className="text-white/40">{'}'}</div>
              <div className="mt-8 border-t border-white/10 pt-6 text-zord-status-healthy flex items-center gap-3 font-semibold">
                <span className="flex h-2 w-2 rounded-full bg-zord-status-healthy animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]"/>
                Delivered • trace + proof available
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </motion.section>
  )
}
