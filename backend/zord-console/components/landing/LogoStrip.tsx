'use client'

import { motion } from 'framer-motion'

export function LogoStrip() {
  const trustItems = ['Real-time tracking', 'Fewer failed payouts', 'Audit-ready records']

  return (
    <div className="py-12 border-y border-white/5 bg-gradient-to-r from-transparent via-[#0B0B13]/80 to-transparent my-10 relative z-10 w-full overflow-hidden">
      <div className="max-w-[1200px] mx-auto px-6 md:px-12 flex flex-col items-center">
        <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-white/30 mb-8">
          Real-time tracking • Fewer failed payouts • Audit-ready records
        </p>
        
        <div className="flex flex-wrap justify-center gap-10 md:gap-20 opacity-40 grayscale hover:grayscale-0 transition-all duration-700">
          {trustItems.map((logo, i) => (
            <motion.div 
              key={i} 
              className="text-2xl font-[family:var(--font-zord-sans)] font-bold tracking-tight text-white/80 select-none hover:text-white transition-colors cursor-default"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.8 }}
            >
              {logo}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
