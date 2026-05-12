'use client'

import Link from 'next/link'

const tabs = [
  { label: 'Overview', href: '/customer-test' },
  { label: 'Envelopes', href: '/customer-test/intent-journal' },
  { label: 'Intents', href: '/customer-test/intent-journal' },
  { label: 'Outcomes', href: '/customer-test/workflow-timeline' },
  { label: 'Evidence', href: '/customer-test/evidence-center' },
  { label: 'Replay', href: '/customer-test/retry-replay' },
  { label: 'Settings', href: '/customer-test/create-payment-request' },
]

export function DashboardTabs() {
  return (
    <div className="rounded-[20px] border border-gray-200 bg-white p-2 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
      <nav className="flex flex-wrap gap-2">
        {tabs.map((tab, index) => {
          const active = index === 0
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-white text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.12)]'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
