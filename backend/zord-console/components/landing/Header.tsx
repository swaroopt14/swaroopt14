'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ZordLogo } from '@/components/ZordLogo'
import { useState, useEffect } from 'react'

const navItems = ['Product', 'How it works', 'Use Cases', 'Security', 'Developers', 'Pricing']

export function Header() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className={`fixed top-0 z-50 w-full transition-all duration-500 ${
        scrolled
          ? 'liquid-glass bg-[#030305]/60 border-b border-white/10 py-3 shadow-[0_12px_40px_rgba(102,51,238,0.15)]'
          : 'bg-transparent py-6'
      }`}
    >
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 lg:px-12">
        <div className="flex items-center gap-6 text-white">
          <ZordLogo size="sm" variant="dark" className="items-center gap-2 text-white" />
          
          <div className="hidden border-l border-white/10 pl-6 md:flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zord-status-healthy opacity-40"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-zord-status-healthy"></span>
            </span>
            <span className="text-[11px] font-medium text-white/50 tracking-wide">Real-time payout tracking</span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 rounded-full bg-white/[0.03] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] border border-white/5 backdrop-blur-md">
          {navItems.map((item) => (
            <Link
              key={item}
              href="#"
              className="relative overflow-hidden rounded-full px-5 py-2 text-[13px] font-medium text-white/60 transition-all duration-300 hover:text-white hover:bg-white/10 hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] group"
            >
              <span className="relative z-10">{item}</span>
              <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/console/login"
            className="hidden sm:inline-block rounded-full px-4 py-2 text-[12px] font-medium text-white/80 transition hover:text-white"
          >
            Sign In
          </Link>
            <Link
              href="/app-final"
              className="rounded-full bg-white px-5 py-2 text-[12px] font-semibold text-black shadow-[0_8px_24px_rgba(255,255,255,0.18)] transition-all hover:bg-zinc-200 focus:scale-[0.98]"
            >
            Book Demo
          </Link>
        </div>
      </div>
    </motion.header>
  )
}
