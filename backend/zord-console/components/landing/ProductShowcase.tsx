'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { SpotlightCard } from './SpotlightCard'

const navItems = [
  { id: 'seller-payouts', label: 'Seller Payouts' },
  { id: 'nbfc-disbursals', label: 'NBFC Disbursals' },
  { id: 'fintech-psp-ops', label: 'Fintech & PSP Ops' },
  { id: 'finance-proof', label: 'Finance & Proof' },
  { id: 'platform-apis', label: 'Platform & APIs' },
]

const productSections = [
  {
    id: 'seller-payouts',
    title: 'Seller Payouts',
    description: 'Keep your marketplace running smoothly with predictable multi-party settlements.',
    cards: [
      {
        title: 'Seller Payout Control',
        desc: 'Keep seller payouts predictable through spikes with live provider and bank posture.',
        visual: 'dashboard',
      },
      {
        title: 'Sale-Spike Watch',
        desc: 'Get alerts when provider or bank confirms slip during sale events before tickets spike.',
        visual: 'alert',
      },
      {
        title: 'Ticket Prevention Wallboard',
        desc: 'Give support a single screen for escalations, stuck payouts, and seller-safe responses.',
        visual: 'board',
      },
      {
        title: 'Seller Health Reporting',
        desc: 'Share payout reliability and issue RCA with marketplace and category leaders.',
        visual: 'chart',
      },
    ]
  },
  {
    id: 'nbfc-disbursals',
    title: 'NBFC Disbursals',
    description: 'De-risk large scale credit operations before the money moves.',
    cards: [
      {
        title: 'High-Value Run Control',
        desc: 'Track every large disbursal from intent to bank confirmation without spreadsheet chase work.',
        visual: 'list',
      },
      {
        title: 'Treasury Confidence View',
        desc: 'Show treasury live bank posture and pending finality before end-of-day.',
        visual: 'split',
      },
      {
        title: 'Risk Watchlist',
        desc: 'Flag high-risk borrowers, banks, or branches before the money moves.',
        visual: 'warning',
      },
      {
        title: '1-Click Proof Packs',
        desc: 'Export defensible disbursal evidence for finance, audit, and lenders.',
        visual: 'document',
      },
    ]
  },
  {
    id: 'fintech-psp-ops',
    title: 'Fintech & PSP Ops',
    description: 'Orchestrate massive transaction volumes across redundant financial infrastructure.',
    cards: [
      {
        title: 'Provider Health Radar',
        desc: 'See PSP errors, latency, and failover posture in one scan.',
        visual: 'radar',
      },
      {
        title: 'Callback Trust Layer',
        desc: 'Catch missing or delayed callbacks before they break downstream flows.',
        visual: 'sequence',
      },
      {
        title: 'Rail Posture Monitor',
        desc: 'Track IMPS, NEFT, RTGS stability by bank cluster, not gut feel.',
        visual: 'map',
      },
      {
        title: 'Replay-Ready Evidence',
        desc: 'Rebuild payout timelines for disputed transactions without engineering digging logs.',
        visual: 'timeline',
      },
    ]
  },
  {
    id: 'finance-proof',
    title: 'Finance & Proof',
    description: 'Automate Month-End close with immutable records and simplified reporting.',
    cards: [
      {
        title: 'Exception Packs',
        desc: 'Bundle current exceptions into close-ready proof sets for finance.',
        visual: 'pack',
      },
      {
        title: 'Month-End Close View',
        desc: 'Give controllers a single view of unreconciled value and statement lag.',
        visual: 'controller',
      },
      {
        title: 'Audit Trails',
        desc: 'Export audit-defensible payout timelines in one click.',
        visual: 'stack',
      },
      {
        title: 'Compliance Dashboard',
        desc: 'Show regulators your payout controls as live dashboards, not static PDFs.',
        visual: 'gauge',
      },
    ]
  },
  {
    id: 'platform-apis',
    title: 'Platform & APIs',
    description: 'The foundation for your engineering teams to build unstoppable money movement.',
    cards: [
      {
        title: 'Unified Payout Schema',
        desc: 'Normalize provider and bank responses into one event model.',
        visual: 'code',
      },
      {
        title: 'Observability Hooks',
        desc: 'Stream payout metrics into your BI and alerting tools.',
        visual: 'integration',
      },
      {
        title: 'Sandbox & Test Data',
        desc: 'Replay real-world payout incidents safely in sandbox.',
        visual: 'terminal',
      },
      {
        title: 'Compliance-Ready APIs',
        desc: 'APIs designed for controlled rollouts and approvals.',
        visual: 'api',
      },
    ]
  }
]

// Visual placeholder component to act like images
function CardVisual({ type }: { type: string }) {
  // Returns different styled abstract representations to look like real mockups
  return (
    <div className="w-full h-full relative overflow-hidden bg-[#0a0a0f] flex items-center justify-center p-4">
      {/* Universal abstract glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-zord-accent-500/10 blur-[40px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/10 blur-[40px] rounded-full pointer-events-none" />
      
      {/* Pattern background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:16px_16px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />

      {/* Unique internals based on type to pretend to be an image */}
      <div className="relative z-10 w-full max-w-[80%] opacity-80 shadow-[0_4px_24px_rgba(0,0,0,0.5)] border border-white/5 rounded-lg bg-[#111116] overflow-hidden">
        {/* Mock Window Header */}
        <div className="h-4 border-b border-white/5 bg-white/[0.02] flex items-center gap-1 px-2">
           <div className="w-1.5 h-1.5 rounded-full bg-white/20"/>
           <div className="w-1.5 h-1.5 rounded-full bg-white/20"/>
           <div className="w-1.5 h-1.5 rounded-full bg-white/20"/>
        </div>
        
        {/* Mock Content */}
        <div className="p-3">
          <div className="h-2 w-1/3 bg-white/10 rounded mb-3" />
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex justify-between items-center bg-white/[0.02] p-1.5 rounded border border-white/5">
                 <div className="flex items-center gap-2">
                   <div className={`w-2 h-2 rounded-full ${i === 1 ? 'bg-yellow-400' : 'bg-green-400'} opacity-70`} />
                   <div className="w-16 h-1 bg-white/10 rounded" />
                 </div>
                 <div className="w-8 h-1 bg-white/20 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProductShowcase() {
  const [activeSection, setActiveSection] = useState(navItems[0].id)

  // Intersection observer to highlight current nav item
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
          setActiveSection(entry.target.id)
        }
      })
    }, { threshold: [0.3] })

    navItems.forEach(item => {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      const offset = 140 // Accounting for fixed header + sticky nav
      const y = el.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }

  return (
    <div className="w-full relative z-20">
      {/* Sticky Navigation Strip */}
      <div className="sticky top-[80px] md:top-[88px] z-40 bg-[#070708]/80 backdrop-blur-xl border-y border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <div className="max-w-[1200px] mx-auto px-6 overflow-x-auto">
          <nav className="flex items-center gap-2 md:gap-8 min-w-max py-4">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className={`px-4 py-2 text-[13px] md:text-[14px] font-medium rounded-full transition-all duration-300 ${
                  activeSection === item.id 
                    ? 'bg-zord-accent-500 text-white shadow-[0_0_15px_rgba(102,51,238,0.3)]' 
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 mt-16 pb-32">
        {productSections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-[160px] mb-32 pt-10 border-t border-white/5 first:border-0 first:pt-0">
            <div className="max-w-[600px] mb-12">
              <h2 className="text-[32px] md:text-[40px] font-semibold text-white tracking-[-0.03em] mb-4">
                {section.title}
              </h2>
              <p className="text-[16px] text-white/50 leading-relaxed">
                {section.description}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
              {section.cards.map((card, i) => (
                <SpotlightCard key={i} className="flex flex-col h-[400px] bg-[#09090D] group cursor-pointer border-white/5 shadow-lg">
                  {/* Image / Graphic Area */}
                  <div className="h-[200px] w-full border-b border-white/5 relative overflow-hidden group-hover:opacity-90 transition-opacity duration-500">
                     {/* Scale effect on hover */}
                     <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-105">
                       <CardVisual type={card.visual} />
                     </div>
                  </div>
                  
                  {/* Content Area */}
                  <div className="p-6 md:p-8 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-[18px] md:text-[20px] font-semibold text-white mb-2 group-hover:text-zord-accent-200 transition-colors">
                        {card.title}
                      </h3>
                      <p className="text-[14px] leading-relaxed text-white/50 group-hover:text-white/70 transition-colors">
                        {card.desc}
                      </p>
                    </div>
                    
                    <div className="mt-6 flex items-center text-[13px] font-medium text-zord-accent-400 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                      Explore use case 
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-1.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    </div>
                  </div>
                </SpotlightCard>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
