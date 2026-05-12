'use client'

import { useMemo, useState } from 'react'

import { FinalLandingPageScaffold } from '@/components/landing-final/FinalLandingPageScaffold'

const pricingFamilies = [
  {
    id: 'payments',
    label: 'Payments',
    eyebrow: 'Payments',
    kicker: 'Start accepting payments at just',
    metric: '2%',
    detail:
      'Applicable on standard online transactions with custom and standard reporting included at no additional cost.',
    subdetail:
      'If monthly revenue is above ₹5 lakh, move into custom commercials with the sales team.',
    highlights: [
      'Cards, UPI, netbanking, wallets, links, subscriptions, and standard checkout flows',
      'Custom and standard reports included',
      'Faster buying motion for teams that want to launch before deeper negotiation',
    ],
  },
  {
    id: 'banking',
    label: 'Business Banking',
    eyebrow: 'Banking+',
    kicker: 'Banking that helps save time and money',
    metric: 'Custom',
    detail:
      'Business Banking pricing is shaped around workflow depth across current accounts, vendor payments, tax runs, scheduled payouts, and approvals.',
    subdetail:
      'Best for teams that want banking operations, payout visibility, and finance controls in one workspace.',
    highlights: [
      'Current accounts, vendor payments, tax payments, and scheduled payout workflows',
      'Priority support and guided account opening',
      'Commercials shaped around real banking usage instead of generic account access',
    ],
  },
  {
    id: 'payroll',
    label: 'Payroll',
    eyebrow: 'Payroll',
    kicker: '3 clicks. Payroll fixed.',
    metric: '₹2,499',
    detail:
      'Subscriptions start at ₹2,499 for payroll automation, salary transfers, and recurring compliance workflows.',
    subdetail:
      'Bundle with Banking+ to unlock one month free and 20% off on subscription pricing.',
    highlights: [
      'Salary transfers, TDS, PF, ESI, PT, and compliance filing support',
      'Employee benefits, insurance, and salary account workflows',
      'Monthly subscription built for finance and people-ops teams',
    ],
  },
  {
    id: 'credit',
    label: 'Credit Solutions',
    eyebrow: 'Credit Solutions',
    kicker: 'Custom programs for lending, underwriting, and disbursal rails',
    metric: 'Custom',
    detail:
      'Talk to sales for commercial design across disbursals, underwriting, settlement-linked lending, and regulated program rollouts.',
    subdetail: 'Built for teams that need implementation support, bank coordination, and custom economics.',
    highlights: [
      'Program pricing aligned to underwriting, disbursal, and settlement realities',
      'Support for regulated flows and enterprise review',
      'Better fit for high-touch commercial and rollout conversations',
    ],
  },
] as const

const pricingPlans = [
  {
    title: 'Pay as You Go',
    subtitle: 'Best for individuals and developers',
    metric: 'Month-to-month',
    detail:
      'Unlimited usage with no upfront commitment. Best when teams want to test, launch, and pay only for what they use.',
    points: ['Access to GA products', 'Unlimited live API calls', 'Sandbox to production path', 'Standard onboarding'],
  },
  {
    title: 'Growth',
    subtitle: 'Best for small teams and startups',
    metric: '12-month commitment',
    detail:
      'Unlock better commercials, platform support, and account management once payment or payout volume becomes an operating priority.',
    points: ['Everything in Pay as You Go', 'Discounted product rates', 'Platform support package', 'Commercial review cadence'],
    featured: true,
  },
  {
    title: 'Custom',
    subtitle: 'Best for businesses that need to scale',
    metric: 'Volume-led',
    detail:
      'Flexible plans for regulated industries, enterprise security review, bundled product commercials, and premium support.',
    points: ['Everything in Growth', 'Volume discounts', 'Implementation assistance', 'Premium support and account coverage'],
  },
] as const

const pricingFaqs = [
  {
    question: 'How does Payments pricing work?',
    answer:
      'Payments starts with standard online pricing for common acceptance flows. Once volume, reporting, or settlement requirements deepen, teams can move into custom commercial bands.',
  },
  {
    question: 'When should I contact sales?',
    answer:
      'Reach sales when monthly revenue is above ₹5 lakh, when you need bundled commercials across products, or when rollout support and security review matter to the buying decision.',
  },
  {
    question: 'Can I start in sandbox first?',
    answer:
      'Yes. Teams can begin in sandbox, validate implementation, and then move into the right commercial plan once product and engineering are ready for production.',
  },
  {
    question: 'Can Payroll and Banking+ be bundled?',
    answer:
      'Yes. Payroll and Banking+ can be bundled into one commercial motion, including subscription offers, support alignment, and a cleaner finance buying path.',
  },
] as const

const pageCardStyle = {
  background:
    'linear-gradient(180deg, rgba(22,28,38,0.94) 0%, rgba(11,13,18,0.98) 100%)',
  boxShadow: '0 24px 64px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
} as const

export default function PricingPageClient() {
  const [activeFamilyId, setActiveFamilyId] =
    useState<(typeof pricingFamilies)[number]['id']>('payments')
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const activeFamily = useMemo(
    () => pricingFamilies.find((family) => family.id === activeFamilyId) ?? pricingFamilies[0],
    [activeFamilyId],
  )

  return (
    <FinalLandingPageScaffold
      active="Pricing"
      eyebrow="Pricing"
      title="Commercial clarity for payments, banking, payroll, and credit."
      description="A fintech pricing page should answer buying questions fast. This page keeps the pricing story structured by product family, commitment model, and rollout depth."
      primaryAction={{ label: 'Contact sales', href: 'mailto:hello@arelais.com?subject=Pricing%20discussion%20for%20ZORD' }}
      secondaryAction={{ label: 'Back to product', href: '/final-landing' }}
      heroVisual={{
        src: '/final-landing/sections/finance-ops-collaboration.png',
        alt: 'Finance and operations leaders reviewing payout evidence and rollout fit together',
        eyebrow: 'Commercial context',
        title: 'Price the operating layer against the cost of slower close, fragmented proof, and manual recovery.',
        body: 'The right commercial model depends on how much payout complexity, investigation effort, and finance coordination your team is carrying today.',
        stats: [
          { value: '4', label: 'product families' },
          { value: '12 mo', label: 'growth plans' },
          { value: 'Custom', label: 'enterprise motion' },
        ],
        imagePosition: 'right',
        imageClassName: 'object-cover object-[56%_center]',
      }}
    >
      <section className="mx-auto mt-12 max-w-6xl">
        <div className="rounded-[2rem] border border-white/10 p-4 sm:p-5" style={pageCardStyle}>
          <div className="flex flex-wrap gap-2">
            {pricingFamilies.map((family) => (
              <button
                key={family.id}
                type="button"
                onClick={() => setActiveFamilyId(family.id)}
                className={`rounded-full px-4 py-2.5 text-[13px] font-semibold transition-all ${
                  activeFamilyId === family.id
                    ? 'bg-[#c6efcf] text-[#09110c] shadow-[0_12px_24px_rgba(198,239,207,0.16)]'
                    : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
              >
                {family.label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="rounded-[1.7rem] border border-white/10 p-7" style={pageCardStyle}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94A7AE]">
                {activeFamily.eyebrow}
              </div>
              <div className="mt-5 text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
                {activeFamily.kicker}
              </div>
              <div className="mt-3 text-[3rem] font-semibold tracking-[-0.06em] text-white md:text-[3.8rem]">
                {activeFamily.metric}
              </div>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">{activeFamily.detail}</p>
              <p className="mt-3 max-w-2xl text-[15px] leading-7 text-slate-400">{activeFamily.subdetail}</p>

              <div className="mt-8 space-y-4">
                {activeFamily.highlights.map((highlight) => (
                  <div key={highlight} className="flex items-start gap-3">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#c6efcf]" />
                    <p className="text-[15px] leading-7 text-slate-200">{highlight}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              {pricingPlans.map((plan, index) => (
                <div
                  key={plan.title}
                  className="rounded-[1.5rem] border border-white/10 p-6"
                  style={
                    index === 1
                      ? {
                          ...pageCardStyle,
                          background:
                            'radial-gradient(circle at 100% 0%, rgba(198,239,207,0.12), transparent 30%), linear-gradient(180deg, rgba(22,28,38,0.94) 0%, rgba(11,13,18,0.98) 100%)',
                        }
                      : pageCardStyle
                  }
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{plan.subtitle}</div>
                  <div className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-white">{plan.title}</div>
                  <div className="mt-5 text-[1.9rem] font-semibold tracking-[-0.05em] text-white">{plan.metric}</div>
                  <p className="mt-4 text-base leading-7 text-slate-400">{plan.detail}</p>
                  <div className="mt-6 space-y-3">
                    {plan.points.map((point) => (
                      <div key={point} className="flex items-start gap-3 text-sm leading-6 text-slate-300">
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#3ba6f7]" />
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-6xl rounded-[2rem] border border-white/10 p-6 sm:p-8" style={pageCardStyle}>
        <div className="max-w-2xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Pricing FAQs</div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">Answers before procurement turns into a thread.</h2>
        </div>

        <div className="mt-8 divide-y divide-white/10">
          {pricingFaqs.map((faq, index) => (
            <div key={faq.question} className="py-5">
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="flex w-full items-center justify-between gap-5 text-left"
              >
                <span className="text-lg font-semibold tracking-tight text-white">{faq.question}</span>
                <span className={`text-slate-400 transition-transform ${openFaq === index ? 'rotate-180' : ''}`}>⌄</span>
              </button>
              {openFaq === index ? (
                <p className="pt-4 max-w-3xl text-[15px] leading-7 text-slate-400">{faq.answer}</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </FinalLandingPageScaffold>
  )
}
