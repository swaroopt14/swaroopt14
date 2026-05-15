'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { SANDBOX_DOCS_LINKS } from '@/services/payout-command/sandbox-data'
import {
  markSandboxSetupStep,
  SANDBOX_BATCH_CENTER_PATH,
  SANDBOX_SETUP_GUIDE,
} from '@/services/payout-command/sandbox-setup-guide'
import { CompactKeyRow } from '../layout/ApiKeysPopoverButton'
import { Glyph } from '../shared'

type WorkspaceKeysPayload = {
  tenant_id: string
  tenant_name: string | null
  workspace_code: string | null
  publishable_key: string | null
  secret_key_prefix: string | null
}

const DISMISS_KEY = 'zord_sandbox_home_credentials_card'

/**
 * Stripe-style dismissible sidebar card: recommendations + tenant id / API key from session
 * (`/api/sandbox/workspace-api-keys`) and localStorage for the one-time signup secret.
 */
export function SandboxHomeCredentialsCard() {
  const [dismissed, setDismissed] = useState(false)
  const [keys, setKeys] = useState<WorkspaceKeysPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [storedSecret, setStoredSecret] = useState<string | null>(null)

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1')
    } catch {
      setDismissed(false)
    }
  }, [])

  const loadKeys = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/sandbox/workspace-api-keys', { credentials: 'include', cache: 'no-store' })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null
        setLoadError(j?.message || `Could not load credentials (${res.status})`)
        setKeys(null)
        return
      }
      const body = (await res.json()) as WorkspaceKeysPayload
      setKeys(body)
      if (body.tenant_id) markSandboxSetupStep('credentials')
      try {
        const stored = window.localStorage.getItem(`zord_tenant_api_key:${body.tenant_id}`)
        setStoredSecret(stored?.trim() || null)
      } catch {
        setStoredSecret(null)
      }
    } catch {
      setLoadError('Network error loading credentials.')
      setKeys(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (dismissed) return
    void loadKeys()
  }, [dismissed, loadKeys])

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

  const reopen = () => {
    try {
      sessionStorage.removeItem(DISMISS_KEY)
    } catch {
      /* ignore */
    }
    setDismissed(false)
  }

  const secretFull = storedSecret
  const secretDisplay =
    secretFull ?? (keys?.secret_key_prefix ? `${keys.secret_key_prefix.slice(0, 16)}…` : '—')

  const docsBase =
    typeof process.env.NEXT_PUBLIC_ZORD_DOCS_URL === 'string' && process.env.NEXT_PUBLIC_ZORD_DOCS_URL.trim()
      ? process.env.NEXT_PUBLIC_ZORD_DOCS_URL.trim().replace(/\/$/, '')
      : null

  if (dismissed) {
    return (
      <div className="flex shrink-0 justify-center xl:w-[min(100%,17rem)] xl:justify-end">
        <button
          type="button"
          onClick={reopen}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#c5d5f0] bg-[#f7f9fe] px-3 py-2 text-[13px] font-medium text-[#30313d] shadow-[0_2px_8px_rgba(59,130,246,0.08)] transition hover:bg-[#eef3fc]"
        >
          <Glyph name="key" className="h-3.5 w-3.5 opacity-90" />
          Workspace credentials
        </button>
      </div>
    )
  }

  return (
    <aside
      className="relative w-full shrink-0 overflow-hidden rounded-xl border border-[#c5d5f0] bg-[#eef3fc] shadow-[0_8px_24px_rgba(59,130,246,0.1),0_0_0_1px_rgba(59,130,246,0.06)] xl:sticky xl:top-20 xl:max-h-[min(36rem,calc(100vh-6rem))] xl:w-[min(100%,20rem)] xl:overflow-y-auto"
      aria-label="Sandbox workspace credentials"
    >
      <div className="flex items-start justify-between gap-2 border-b border-[#c5d5f0]/70 bg-[#eef3fc] px-4 py-3">
        <p className="text-[15px] font-semibold text-[#30313d]">Recommendations</p>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md px-1.5 py-0.5 text-[18px] font-light leading-none text-[#6b7280] transition hover:bg-black/[0.06] hover:text-[#111827]"
          aria-label="Dismiss credentials card"
        >
          ×
        </button>
      </div>

      <div className="space-y-3 px-4 pb-3 pt-2 text-[13px] leading-relaxed text-[#30313d]">
        <p className="font-medium text-[#0f172a]">{SANDBOX_SETUP_GUIDE.subtitle}</p>
        <ol className="list-decimal space-y-1.5 pl-4 text-[12px] text-[#475569]">
          {SANDBOX_SETUP_GUIDE.steps.slice(0, 4).map((step) => (
            <li key={step.id}>
              <span className="font-medium text-[#30313d]">{step.title}</span>
              {step.api ? (
                <span className="mt-0.5 block font-mono text-[11px] text-[#64748b]">{step.api}</span>
              ) : null}
            </li>
          ))}
        </ol>
        <Link
          href={SANDBOX_BATCH_CENTER_PATH}
          className="inline-flex text-[13px] font-semibold text-[#2563eb] underline decoration-[#93c5fd] underline-offset-2 hover:text-[#1d4ed8]"
        >
          Open Batch Command Center →
        </Link>
        <p>
          External docs:{' '}
          <a
            href={SANDBOX_DOCS_LINKS.apiReference}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-[#2563eb] underline decoration-[#93c5fd] underline-offset-2 hover:text-[#1d4ed8]"
          >
            API reference
          </a>
          {docsBase ? (
            <>
              {' '}
              ·{' '}
              <a
                href={`${docsBase}/webhooks`}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-[#2563eb] underline decoration-[#93c5fd] underline-offset-2 hover:text-[#1d4ed8]"
              >
                webhooks
              </a>
            </>
          ) : null}
        </p>
      </div>

      <div className="border-t border-[#c5d5f0]/70 bg-[#f7f9fe] px-4 pb-4 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="text-[15px] font-semibold text-[#30313d]">Workspace credentials</p>
          <a
            href={SANDBOX_DOCS_LINKS.apiReference}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[13px] font-medium text-[#16a34a] hover:text-[#15803d]"
          >
            View docs
          </a>
        </div>
        <p className="mt-1 text-[12px] text-[#6b7280]">
          Tenant id and API key for this session (no mock values).
        </p>

        {loading ? (
          <p className="mt-4 text-[13px] text-[#6b7280]">Loading…</p>
        ) : loadError ? (
          <p className="mt-4 text-[13px] text-[#b45309]">{loadError}</p>
        ) : (
          <>
            <CompactKeyRow label="Tenant id" value={keys?.tenant_id ?? '—'} tone="sky" />
            <CompactKeyRow
              label="API key"
              value={secretFull ?? secretDisplay}
              masked={!secretFull}
              copyValue={secretFull ?? undefined}
              tone="sky"
              helper={
                !secretFull
                  ? 'Full secret is only returned once at signup; it appears here if this browser saved it when you copied it then.'
                  : undefined
              }
            />
          </>
        )}

        <Link
          href="/payout-command-view/settings/api-keys"
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#c5d5f0] bg-white py-2.5 text-[13px] font-medium text-[#30313d] shadow-[0_1px_3px_rgba(59,130,246,0.08)] transition hover:bg-[#eef3fc]"
        >
          Manage keys
          <Glyph name="arrow-up-right" className="h-3 w-3" />
        </Link>
      </div>
    </aside>
  )
}
