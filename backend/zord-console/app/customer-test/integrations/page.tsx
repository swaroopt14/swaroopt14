'use client'

import Link from 'next/link'
import { IntegrationsTabs } from './_components/IntegrationsTabs'

const tools = [
  {
    title: 'API Logs',
    href: '/customer-test/integrations/api-logs',
    desc: 'Debug requests, responses, idempotency, and reason codes.',
  },
  {
    title: 'Webhooks',
    href: '/customer-test/integrations/webhooks',
    desc: 'Monitor event delivery reliability, retries, and signatures.',
  },
  {
    title: 'Adapter Status',
    href: '/customer-test/integrations/adapters',
    desc: 'Track provider connectivity, latency, and degradation trends.',
  },
]

export default function IntegrationsHomePage() {
  return (
    <div className="w-full p-6 lg:p-8">
      <main className="ct-main-panel mt-1 px-6 pb-7 pt-6">
        <section className="ct-clear-glass rounded-xl p-4 shadow-[0_14px_34px_rgba(15,23,42,0.09)]">
          <h1 className="text-2xl font-semibold text-slate-900">Integrations</h1>
          <p className="mt-1 text-sm text-slate-600">Focused operational tools with search, filters, tables, and inspectors.</p>
        </section>

        <IntegrationsTabs />

        <section className="mt-4 grid gap-4 md:grid-cols-3">
          {tools.map((tool) => (
            <article key={tool.title} className="ct-frost-card rounded-xl p-4">
              <h2 className="text-base font-semibold text-slate-900">{tool.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{tool.desc}</p>
              <Link
                href={tool.href}
                className="mt-4 inline-flex rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Open Tool
              </Link>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}
