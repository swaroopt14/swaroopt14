'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { EnvironmentProvider, useEnvironment } from '@/services/auth/EnvironmentProvider'
import {
  SANDBOX_API_KEYS,
  SANDBOX_DOCS_LINKS,
  SANDBOX_RECENT_REQUESTS,
  type SandboxApiKey,
} from '@/services/payout-command/sandbox-data'
import { ActivateLiveWizard } from '../../../today/_components/sandbox/ActivateLiveWizard'
import { Glyph } from '../../../today/_components/shared'
import { useSessionTenantId } from '@/services/auth/useSessionTenantId'

/**
 * ApiKeysClient — Stripe-style API keys page.
 *
 * Layout:
 *   ┌──────────────────────────────────────────┬─────────────────┐
 *   │ Page header                              │                 │
 *   │ Publishable keys card                    │ Recommendations │
 *   │ Secret keys card                         │ (sidebar)       │
 *   │ Recent API requests table                │                 │
 *   └──────────────────────────────────────────┴─────────────────┘
 *
 * Wraps in its own EnvironmentProvider so it works as a standalone route too.
 */
export function ApiKeysClient() {
  return (
    <EnvironmentProvider>
      <ApiKeysClientInner />
    </EnvironmentProvider>
  )
}

function ApiKeysClientInner() {
  const { canSwitchToLive, liveActivationStatus } = useEnvironment()
  const [activateOpen, setActivateOpen] = useState(false)

  const sandboxPublishable = SANDBOX_API_KEYS.find((k) => k.type === 'publishable' && k.mode === 'sandbox')!
  const sandboxSecretBase = SANDBOX_API_KEYS.find((k) => k.type === 'secret' && k.mode === 'sandbox')!

  // If this tenant captured their API key at signup, swap the seeded sandbox
  // secret for the real one. We persisted it under `zord_tenant_api_key:<id>`
  // in localStorage (backend only stores the hash, so it's the only source).
  const tenantId = useSessionTenantId()
  const [tenantApiKey, setTenantApiKey] = useState<string | null>(null)
  useEffect(() => {
    if (!tenantId) return
    try {
      const stored = window.localStorage.getItem(`zord_tenant_api_key:${tenantId}`)
      if (stored) setTenantApiKey(stored)
    } catch {
      /* localStorage may be unavailable in private mode */
    }
  }, [tenantId])

  const sandboxSecret: SandboxApiKey = tenantApiKey
    ? { ...sandboxSecretBase, value: tenantApiKey, lastUsedAt: null }
    : sandboxSecretBase

  return (
    <>
      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#0f172a]">API keys</h1>
        <p className="mt-1 max-w-2xl text-[16px] leading-relaxed text-[#64748b]">
          Use sandbox keys (<span className="font-mono">pk_test_…</span>) to test your integration. Live keys
          (<span className="font-mono">pk_live_…</span>) are issued only after activation. Treat secret keys
          like passwords — never commit them.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          {/* Publishable keys card */}
          <KeyCard title="Publishable keys" subtitle="Safe to embed in client-side code (web, mobile).">
            <KeyRow apiKey={sandboxPublishable} />
            <LiveLockedRow
              type="publishable"
              status={liveActivationStatus}
              canSwitch={canSwitchToLive}
              onActivate={() => setActivateOpen(true)}
            />
          </KeyCard>

          {/* Secret keys card */}
          <KeyCard
            title="Secret keys"
            subtitle="Server-side only. Anyone with this key can move money in your account."
            warning
          >
            <KeyRow apiKey={sandboxSecret} masked />
            <LiveLockedRow
              type="secret"
              status={liveActivationStatus}
              canSwitch={canSwitchToLive}
              onActivate={() => setActivateOpen(true)}
            />
          </KeyCard>

          {/* Recent API requests */}
          <article className="overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
            <header className="border-b border-[#E5E5E5] px-5 py-3">
              <p className="text-[17px] font-semibold text-[#0f172a]">Recent API requests</p>
              <p className="mt-0.5 text-[15px] text-[#64748b]">Last 10 calls. Use this to verify your integration is hitting the right endpoints.</p>
            </header>
            <table className="w-full text-left text-[16px]">
              <thead className="bg-[#fafafa] text-[14px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
                <tr>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Method</th>
                  <th className="px-4 py-2">Endpoint</th>
                  <th className="px-4 py-2 text-right">Duration</th>
                  <th className="px-4 py-2 text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {SANDBOX_RECENT_REQUESTS.map((r) => {
                  const okStatus = r.status >= 200 && r.status < 300
                  const tone = okStatus
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : r.status >= 400 && r.status < 500
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-rose-200 bg-rose-50 text-rose-700'
                  return (
                    <tr key={r.id} className="border-t border-[#E5E5E5] hover:bg-[#fafafa]">
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[14px] font-semibold ${tone}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[15px] font-semibold text-[#475569]">{r.method}</td>
                      <td className="px-4 py-2.5 font-mono text-[15px] text-[#0f172a]">{r.path}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[#475569]">{r.durationMs} ms</td>
                      <td className="px-4 py-2.5 text-right text-[#94a3b8]">{r.at}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </article>
        </div>

        {/* Right sidebar — recommendations */}
        <aside className="space-y-3">
          <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Recommendations</p>
          <RecommendationCard
            icon="document"
            title="View API docs"
            body="OpenAPI reference, schema, and examples."
            href={SANDBOX_DOCS_LINKS.apiReference}
            external
          />
          <RecommendationCard
            icon="terminal"
            title="Postman collection"
            body="Pre-built requests with sandbox keys baked in."
            href={SANDBOX_DOCS_LINKS.postmanCollection}
            external
          />
          <RecommendationCard
            icon="bell"
            title="Webhooks setup"
            body="Receive real-time signals from Zord."
            href={SANDBOX_DOCS_LINKS.webhookGuide}
            external
            soon
          />
        </aside>
      </div>

      {activateOpen ? <ActivateLiveWizard onClose={() => setActivateOpen(false)} /> : null}
    </>
  )
}

// ─── Subcomponents ─────────────────────────────────────────────────────────────

function KeyCard({ title, subtitle, warning, children }: { title: string; subtitle: string; warning?: boolean; children: ReactNode }) {
  return (
    <article className="overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <header className="border-b border-[#E5E5E5] px-5 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[17px] font-semibold text-[#0f172a]">{title}</p>
          {warning ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[14px] font-semibold text-rose-700">
              <Glyph name="lock" className="h-2.5 w-2.5" />
              Sensitive
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[15px] text-[#64748b]">{subtitle}</p>
      </header>
      <div>{children}</div>
    </article>
  )
}

function KeyRow({ apiKey, masked }: { apiKey: SandboxApiKey; masked?: boolean }) {
  const [revealed, setRevealed] = useState(!masked)
  const [copied, setCopied] = useState(false)
  const [rotating, setRotating] = useState(false)

  const display = revealed
    ? apiKey.value
    : `${apiKey.value.slice(0, 12)}${'•'.repeat(Math.max(0, apiKey.value.length - 16))}${apiKey.value.slice(-4)}`

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey.value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // No-op — older browsers without clipboard API. Could fallback but not worth it for hackathon.
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-t border-[#E5E5E5] px-5 py-3 first:border-t-0">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F59E0B]/30 bg-[#FFF7ED] px-2 py-0.5 text-[14px] font-semibold uppercase tracking-[0.1em] text-[#9A3412]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" aria-hidden />
          Sandbox
        </span>
        <code className="flex-1 truncate font-mono text-[16px] text-[#0f172a]">{display}</code>
        <span className="text-[14px] text-[#94a3b8]">Last used {apiKey.lastUsedAt ?? 'never'}</span>
        <div className="flex items-center gap-1">
          {masked ? (
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="inline-flex items-center gap-1 rounded-[6px] border border-[#E5E5E5] bg-white px-2 py-1 text-[15px] font-medium text-[#475569] transition hover:bg-[#fafafa]"
              aria-label={revealed ? 'Hide key' : 'Reveal key'}
            >
              <Glyph name={revealed ? 'eye-off' : 'eye'} className="h-3 w-3" />
              {revealed ? 'Hide' : 'Reveal'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1 rounded-[6px] border border-[#E5E5E5] bg-white px-2 py-1 text-[15px] font-medium text-[#475569] transition hover:bg-[#fafafa]"
          >
            <Glyph name={copied ? 'check' : 'copy'} className="h-3 w-3" />
            {copied ? 'Copied' : 'Copy'}
          </button>
          {masked ? (
            <button
              type="button"
              onClick={() => setRotating(true)}
              className="inline-flex items-center gap-1 rounded-[6px] border border-[#E5E5E5] bg-white px-2 py-1 text-[15px] font-medium text-[#475569] transition hover:bg-[#fafafa]"
            >
              <Glyph name="refresh" className="h-3 w-3" />
              Rotate
            </button>
          ) : null}
        </div>
      </div>

      {rotating ? <RotateConfirmModal onClose={() => setRotating(false)} keyType={apiKey.type} /> : null}
    </>
  )
}

function LiveLockedRow({
  type,
  status,
  canSwitch,
  onActivate,
}: {
  type: 'publishable' | 'secret'
  status: 'not_started' | 'in_review' | 'active'
  canSwitch: boolean
  onActivate: () => void
}) {
  if (canSwitch) {
    return (
      <div className="flex items-center gap-3 border-t border-[#E5E5E5] bg-[#fafafa] px-5 py-3 text-[15px] text-[#64748b]">
        Live {type} key issued — switch to Live mode in the dock to view.
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[#E5E5E5] bg-[#fafafa] px-5 py-3">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#94a3b8]/30 bg-white px-2 py-0.5 text-[14px] font-semibold uppercase tracking-[0.1em] text-[#475569]">
        <Glyph name="lock" className="h-2.5 w-2.5" />
        Live
      </span>
      <span className="text-[15px] text-[#64748b]">
        {status === 'in_review'
          ? 'Activation submitted — live keys will be issued after approval.'
          : 'Activate live to issue your live keys.'}
      </span>
      {status !== 'in_review' ? (
        <button
          type="button"
          onClick={onActivate}
          className="ml-auto inline-flex items-center gap-1.5 rounded-[6px] bg-[#0f172a] px-2.5 py-1 text-[15px] font-semibold text-white transition hover:bg-black"
        >
          Activate live
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 9 9 3M5 3h4v4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}
    </div>
  )
}

function RotateConfirmModal({ keyType, onClose }: { keyType: 'publishable' | 'secret'; onClose: () => void }) {
  const [rotating, setRotating] = useState(false)
  const [done, setDone] = useState(false)
  const [newKey, setNewKey] = useState('')

  const onConfirm = () => {
    setRotating(true)
    window.setTimeout(() => {
      // Generate a fake new key — backend would do this server-side.
      const random = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
      setNewKey(`sk_test_zord_${random}`)
      setRotating(false)
      setDone(true)
    }, 1200)
  }

  return (
    <>
      <button type="button" className="fixed inset-0 z-[80] cursor-default bg-black/30 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-[90] w-[min(calc(100vw-2rem),32rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)]"
        role="dialog"
        aria-modal="true"
      >
        {!done ? (
          <>
            <header className="border-b border-[#E5E5E5] px-5 py-4">
              <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-rose-700">Caution</p>
              <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-[#0f172a]">
                Rotate {keyType} key
              </h2>
            </header>
            <div className="px-5 py-4 text-[16px] leading-relaxed text-[#475569]">
              <p>
                The current key will stop working immediately. Any integration still using it will start failing
                until you update the new key.
              </p>
              <p className="mt-2">
                <strong>Make sure you have a deploy ready</strong> before rotating in production. In sandbox this is safe.
              </p>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-[#E5E5E5] bg-[#fafafa] px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[8px] border border-[#E5E5E5] bg-white px-3 py-1.5 text-[16px] font-medium text-[#475569] transition hover:bg-[#f3f3ee]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={rotating}
                className="inline-flex items-center gap-2 rounded-[8px] bg-rose-600 px-3 py-1.5 text-[16px] font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {rotating ? 'Rotating…' : 'Rotate now'}
              </button>
            </footer>
          </>
        ) : (
          <>
            <header className="border-b border-[#E5E5E5] px-5 py-4">
              <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Done</p>
              <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-[#0f172a]">New key issued</h2>
            </header>
            <div className="px-5 py-4 text-[16px] leading-relaxed">
              <p className="text-[#475569]">
                Save this key somewhere safe — you won't see it again.
              </p>
              <code className="mt-3 block break-all rounded-[8px] border border-[#E5E5E5] bg-[#fafafa] p-3 font-mono text-[16px] text-[#0f172a]">
                {newKey}
              </code>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-[#E5E5E5] bg-[#fafafa] px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[8px] bg-[#0f172a] px-3 py-1.5 text-[16px] font-semibold text-white transition hover:bg-black"
              >
                I've saved it
              </button>
            </footer>
          </>
        )}
      </div>
    </>
  )
}

function RecommendationCard({
  icon,
  title,
  body,
  href,
  external,
  soon,
}: {
  icon: 'document' | 'terminal' | 'bell'
  title: string
  body: string
  href: string
  external?: boolean
  soon?: boolean
}) {
  const inner = (
    <div className="flex items-start gap-2.5 rounded-[12px] border border-[#E5E5E5] bg-white p-3 transition hover:border-[#0f172a]/30 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#0f172a] text-white">
        <Glyph name={icon} className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[16px] font-semibold text-[#0f172a]">{title}</p>
          {soon ? (
            <span className="rounded-full bg-[#94a3b8]/15 px-1.5 py-0.5 text-[13px] font-semibold uppercase tracking-wide text-[#475569]">
              Soon
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[15px] leading-relaxed text-[#64748b]">{body}</p>
      </div>
      <Glyph name="arrow-up-right" className="h-3 w-3 shrink-0 text-[#94a3b8]" />
    </div>
  )

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className="block">
        {inner}
      </a>
    )
  }
  return <Link href={href} className="block">{inner}</Link>
}
