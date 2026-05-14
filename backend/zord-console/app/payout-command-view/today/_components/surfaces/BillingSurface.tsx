'use client'

import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { Glyph } from '../shared'

/**
 * BillingSurface — sandbox-mode billing page.
 *
 * Shows the active plan, payment method (with Visa/Mastercard logo style),
 * usage meter, and invoice history. Sandbox accounts are always free; the
 * "Activate to use Pro/Business" path lives behind the existing wizard.
 */

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: '/mo',
    features: ['Sandbox-only access', '10 intents/day', 'Email support', 'Postman + OpenAPI'],
    cta: 'Current plan',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$49',
    cadence: '/mo',
    features: ['1,000 intents/mo', 'Email + chat support', 'Basic analytics', 'Single workspace'],
    cta: 'Available after activation',
    recommended: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: '$199',
    cadence: '/mo',
    features: ['10k intents/mo', 'Phone support', 'Advanced analytics', 'Team seats', 'Priority routing'],
    cta: 'Available after activation',
  },
] as const

export function BillingSurface({ onActivateClick }: { onActivateClick: () => void }) {
  const { mode, liveActivationStatus } = useEnvironment()
  const isSandbox = mode === 'sandbox'
  const inReview = liveActivationStatus === 'in_review'

  return (
    <div className="grid min-h-[calc(100vh-10rem)] gap-6 bg-[#fafafa] p-6 lg:grid-cols-[1fr_320px] lg:p-8">
      {/* ── Main column ─────────────────────────────────────────────────── */}
      <div className="min-w-0 space-y-6">
        {/* Header */}
        <header>
          <p className="text-[20px] text-[#64748b]">
            {isSandbox
              ? 'Sandbox accounts are free. Activate live to choose a plan and add a payment method.'
              : 'Manage your plan, payment method, and invoice history.'}
          </p>
        </header>

        {/* Current plan summary */}
        <section className="rounded-[16px] border border-[#E5E5E5] bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[17px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Current plan</p>
              <div className="mt-2 flex items-baseline gap-2">
                <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-[#0f172a]">Free</h2>
                <span className="text-[20px] text-[#64748b]">· Sandbox</span>
              </div>
              <p className="mt-1 text-[18px] text-[#64748b]">
                10 intents/day · sandbox-only access · email support
              </p>
            </div>
            {inReview ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[17px] font-semibold text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                Activation in review
              </span>
            ) : (
              <button
                type="button"
                onClick={onActivateClick}
                className="inline-flex items-center gap-2 rounded-[8px] bg-[#0f172a] px-3.5 py-2 text-[18px] font-semibold text-white transition hover:bg-black"
              >
                Activate to upgrade
                <Glyph name="arrow-up-right" className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Usage meter — static for demo */}
          <div className="mt-5 rounded-[10px] border border-[#E5E5E5] bg-[#fafafa] p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[17px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">Today&apos;s usage</p>
              <p className="text-[18px] tabular-nums text-[#0f172a]">
                <span className="font-semibold">3</span> / 10 intents
              </p>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E5E5E5]">
              <div className="h-full w-[30%] rounded-full bg-emerald-500" />
            </div>
            <p className="mt-2 text-[17px] text-[#64748b]">Resets at midnight IST. Upgrade for higher limits.</p>
          </div>
        </section>

        {/* Plan options */}
        <section>
          <h3 className="mb-3 text-[19px] font-semibold text-[#0f172a]">Plan options</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {PLANS.map((plan) => {
              const isCurrent = plan.id === 'free'
              return (
                <article
                  key={plan.id}
                  className={`flex flex-col rounded-[16px] border p-5 ${
                    isCurrent
                      ? 'border-[#0f172a] bg-white ring-2 ring-[#0f172a]/10'
                      : 'border-[#E5E5E5] bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[20px] font-semibold text-[#0f172a]">{plan.name}</p>
                    {plan.recommended ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[15px] font-semibold uppercase tracking-wide text-emerald-700">
                        Recommended
                      </span>
                    ) : null}
                    {isCurrent ? (
                      <span className="rounded-full border border-[#0f172a] bg-[#0f172a] px-1.5 py-0.5 text-[15px] font-semibold uppercase tracking-wide text-white">
                        Current
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <p className="text-[30px] font-semibold tabular-nums text-[#0f172a]">{plan.price}</p>
                    <p className="text-[18px] text-[#64748b]">{plan.cadence}</p>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-[18px] text-[#475569]">
                        <Glyph name="check" className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-auto pt-4 text-[17px] text-[#94a3b8]">{plan.cta}</p>
                </article>
              )
            })}
          </div>
        </section>

        {/* Invoice history */}
        <section className="overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
          <header className="border-b border-[#E5E5E5] px-5 py-3">
            <p className="text-[20px] font-semibold text-[#0f172a]">Invoice history</p>
            <p className="mt-0.5 text-[18px] text-[#64748b]">No charges in sandbox mode.</p>
          </header>
          <div className="px-5 py-8 text-center">
            <p className="text-[18px] text-[#94a3b8]">No invoices yet — your sandbox is free.</p>
          </div>
        </section>
      </div>

      {/* ── Right rail: payment method + activation ─────────────────────── */}
      <aside className="space-y-4">
        {/* Payment method */}
        <article className="rounded-[16px] border border-[#E5E5E5] bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
          <p className="text-[20px] font-semibold text-[#0f172a]">Payment method</p>
          <p className="mt-1 text-[18px] text-[#64748b]">
            Add when you activate live. Sandbox needs no card.
          </p>

          {/* Empty payment method card */}
          <div className="mt-4 rounded-[12px] border border-dashed border-[#E5E5E5] bg-[#fafafa] p-4">
            <div className="flex items-center gap-3">
              <CardLogoStack />
              <div className="min-w-0 flex-1">
                <p className="text-[18px] font-medium text-[#475569]">No card on file</p>
                <p className="text-[17px] text-[#94a3b8]">Visa, Mastercard, Amex accepted</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onActivateClick}
            disabled={inReview}
            className="mt-3 inline-flex w-full items-center justify-between rounded-[8px] border border-[#0f172a] bg-white px-3 py-2 text-[18px] font-medium text-[#0f172a] transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {inReview ? 'In review · ~24h' : 'Add payment method'}
            <Glyph name="arrow-up-right" className="h-3 w-3" />
          </button>
        </article>

        {/* Billing contact */}
        <article className="rounded-[16px] border border-[#E5E5E5] bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
          <p className="text-[20px] font-semibold text-[#0f172a]">Billing contact</p>
          <p className="mt-1 text-[18px] text-[#64748b]">Where invoices and payment receipts are sent.</p>
          <div className="mt-3 space-y-1">
            <p className="text-[18px] text-[#0f172a]">alice@example.com</p>
            <p className="text-[17px] text-[#94a3b8]">Set during signup</p>
          </div>
          <button
            type="button"
            disabled
            className="mt-3 inline-flex w-full items-center justify-between rounded-[8px] border border-[#E5E5E5] bg-[#fafafa] px-3 py-2 text-[18px] font-medium text-[#94a3b8]"
          >
            Edit contact
            <span className="rounded-full bg-[#94a3b8]/15 px-1.5 py-0.5 text-[15px] font-semibold uppercase text-[#475569]">Soon</span>
          </button>
        </article>
      </aside>
    </div>
  )
}

// ─── Subcomponents ─────────────────────────────────────────────────────────────

function CardLogoStack() {
  return (
    <div className="flex h-10 w-14 shrink-0 items-center justify-center gap-0.5 rounded-[6px] border border-[#E5E5E5] bg-white">
      {/* Mini Visa pill */}
      <span className="rounded-[2px] bg-[#1A1F71] px-1 py-0.5 font-mono text-[13px] font-bold tracking-wider text-white">VISA</span>
    </div>
  )
}
