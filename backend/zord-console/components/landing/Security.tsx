'use client'

import { motion } from 'framer-motion'

const securityFeatures = [
  {
    title: 'Bank-Grade Encryption',
    desc: 'All data is encrypted in transit (TLS 1.3) and at rest (AES-256).',
    badge: 'AES-256',
  },
  {
    title: 'Idempotency',
    desc: 'Guaranteed protection against duplicate payouts even during network failures.',
    badge: 'Safe',
  },
  {
    title: 'Immutable Audit Logs',
    desc: 'Every API request, state change, and provider response is permanently logged.',
    badge: 'Verifiable',
  },
  {
    title: 'Granular Roles & Permissions',
    desc: 'Control who can initiate, approve, and view transactions with strictly enforced RBAC.',
    badge: 'RBAC',
  },
]

export function Security() {
  return (
    <section className="relative py-32 border-y border-white/5 bg-[#030305]">
      {/* Subtle background glow */}
      <div className="absolute inset-x-0 top-0 h-[400px] w-full bg-[radial-gradient(ellipse_at_top,rgba(102,51,238,0.06)_0%,transparent_70%)] pointer-events-none" />

      <div className="max-w-[1200px] mx-auto px-6 md:px-12 relative z-10 flex flex-col md:flex-row gap-16 items-center">
        
        <motion.div 
          className="w-full md:w-1/2"
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <div className="inline-flex items-center rounded-full bg-white/5 border border-white/10 px-4 py-2 text-[12px] uppercase tracking-[0.25em] text-white/50 mb-6">
            Trust & Security
          </div>
          <h2 className="text-[36px] md:text-[48px] font-semibold tracking-[-0.04em] text-white leading-[1.1] mb-6">
            Serious infrastructure <br />
            <span className="text-zord-accent-400">for serious money.</span>
          </h2>
          <p className="text-[17px] text-white/50 leading-relaxed mb-10 max-w-[460px]">
            We operate with the assumption that every payload is critical. Zord is engineered defensively from the ground up, prioritizing safety and predictability over everything else.
          </p>

          <div className="flex gap-4 items-center border-t border-white/10 pt-6">
            <div className="h-12 w-12 rounded-lg bg-white/5 flex items-center justify-center border border-white/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/70"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div>
              <div className="text-[14px] font-semibold text-white">SOC 2 Type II Compliant</div>
              <div className="text-[13px] text-white/50">Audited operational security</div>
            </div>
          </div>
        </motion.div>

        <motion.div 
          className="w-full md:w-1/2 grid grid-cols-1 sm:grid-cols-2 gap-4"
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          {securityFeatures.map((feat, i) => (
            <div key={i} className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 hover:bg-white/[0.04] transition-colors relative overflow-hidden group">
              <div className="absolute top-0 right-0 bg-white/5 px-3 py-1 rounded-bl-lg text-[10px] uppercase tracking-widest text-white/40 group-hover:text-zord-accent-300 transition-colors">
                {feat.badge}
              </div>
              <h4 className="text-[16px] font-medium text-white mb-2 mt-4">{feat.title}</h4>
              <p className="text-[14px] text-white/40 leading-relaxed">
                {feat.desc}
              </p>
            </div>
          ))}
        </motion.div>

      </div>
    </section>
  )
}
