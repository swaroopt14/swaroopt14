'use client'

import Image from 'next/image'

import { FinalLandingPageScaffold } from '@/components/landing-final/FinalLandingPageScaffold'

const logoNames = [
  'Amazon India',
  'Flipkart',
  'AJIO',
  'bookmyshow',
  'OLA',
  'Zomato',
  'Blinkit',
  'Zepto',
  'Swiggy',
] as const

const customerStories = [
  {
    name: 'Priya Menon',
    role: 'Head of Payout Ops, Marketplace',
    quote:
      'Zord gave our ops, finance, and engineering teams the same payout truth. We now catch provider and bank drift before sellers escalate.',
  },
  {
    name: 'Raghav Shah',
    role: 'Finance Controller, Lending Platform',
    quote:
      'The proof layer changed month-end close. Instead of asking three teams for evidence, finance gets one defensible payout timeline.',
  },
  {
    name: 'Aditi Rao',
    role: 'Payments Engineering Manager',
    quote:
      'We stopped building payout visibility in spreadsheets and internal dashboards. Zord became the command layer we were missing.',
  },
  {
    name: 'Manoj Khanna',
    role: 'Risk and Reconciliation Lead',
    quote:
      'Routing, bank failures, statement lag, and proof readiness all show up in one place. That is the difference between reacting and controlling.',
  },
] as const

const caseStats = [
  { value: '41 min', label: 'faster exception resolution' },
  { value: '99.95%', label: 'signal uptime across live workflows' },
  { value: '1 click', label: 'proof export for finance and audit' },
] as const

const pageCardStyle = {
  background:
    'linear-gradient(180deg, rgba(22,28,38,0.94) 0%, rgba(11,13,18,0.98) 100%)',
  boxShadow: '0 24px 64px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
} as const

export default function CustomersPageClient() {
  return (
    <FinalLandingPageScaffold
      active="Customers"
      eyebrow="Customers"
      title="Proof that ZORD lands with payout teams carrying real accountability."
      description="These are the buyer stories behind the product: operations, finance, engineering, and risk teams that need one payout truth instead of fragmented dashboards."
      primaryAction={{ label: 'Book demo', href: 'mailto:hello@arelais.com?subject=Customer%20stories%20for%20ZORD' }}
      secondaryAction={{ label: 'Back to product', href: '/final-landing' }}
    >
      <section className="mx-auto mt-12 max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="overflow-hidden rounded-[2rem] border border-white/10" style={pageCardStyle}>
            <div className="relative min-h-[460px]">
              <Image
                src="/final-landing/pages/customers-hero.png"
                alt="Enterprise customer reviewing payout outcomes and control metrics on a shared finance workspace"
                fill
                className="object-cover object-[52%_center]"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,10,0.10)_0%,rgba(5,7,10,0.75)_100%)]" />
              <div className="absolute inset-x-0 bottom-0 p-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/72 backdrop-blur-md">
                  Customer context
                </div>
                <h2 className="mt-5 max-w-xl text-4xl font-semibold tracking-[-0.05em] text-white">
                  One working view for ops, finance, engineering, and risk.
                </h2>
                <p className="mt-4 max-w-xl text-[15px] leading-7 text-white/78">
                  Teams adopt ZORD when payout incidents are no longer isolated technical issues and start becoming customer, finance, and compliance problems at the same time.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            {caseStats.map((stat, index) => (
              <div
                key={stat.label}
                className="rounded-[1.6rem] border border-white/10 p-6"
                style={
                  index === 0
                    ? {
                        ...pageCardStyle,
                        background:
                          'radial-gradient(circle at 100% 0%, rgba(198,239,207,0.12), transparent 30%), linear-gradient(180deg, rgba(22,28,38,0.94) 0%, rgba(11,13,18,0.98) 100%)',
                      }
                    : pageCardStyle
                }
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Operator outcome</div>
                <div className="mt-3 text-[2.2rem] font-semibold tracking-[-0.05em] text-white">{stat.value}</div>
                <p className="mt-2 text-sm leading-7 text-slate-400">{stat.label}</p>
              </div>
            ))}

            <div className="rounded-[1.6rem] border border-white/10 p-6" style={pageCardStyle}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Trusted by teams across</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {logoNames.map((name) => (
                  <span key={name} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] font-semibold text-slate-200">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-6xl">
        <div className="grid gap-6 md:grid-cols-2">
          {customerStories.map((story) => (
            <div key={story.name} className="rounded-[2rem] border border-white/10 p-8" style={pageCardStyle}>
              <div className="text-lg font-semibold tracking-tight text-white">{story.name}</div>
              <div className="mt-1 text-[13px] font-medium text-[#c6efcf]">{story.role}</div>
              <p className="mt-5 text-lg leading-relaxed text-slate-300">{story.quote}</p>
            </div>
          ))}
        </div>
      </section>
    </FinalLandingPageScaffold>
  )
}
