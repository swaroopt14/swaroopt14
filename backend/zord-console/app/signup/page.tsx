'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { persistEnvMode } from '@/services/auth/persistEnvMode'

type SignupResult = {
  apiKey: string
  tenantId: string
  tenantName: string
}

function SignupMarketingAside() {
  return (
    <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81] p-10 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute -top-20 -left-16 h-80 w-80 rounded-full bg-emerald-400/30 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-violet-500/40 blur-3xl" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      <div className="relative">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <span className="text-[18px] font-black tracking-tight">Z</span>
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Zord Console</span>
        </div>
      </div>

      <div className="relative max-w-md space-y-6">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          New workspace
        </p>
        <h2 className="text-[32px] font-semibold leading-[1.12] tracking-[-0.02em]">Create a tenant in one step.</h2>
        <p className="text-[15px] leading-relaxed text-white/72">
          You are registering a <strong className="font-semibold text-white">dedicated workspace</strong> (tenant) and
          the <strong className="font-semibold text-white">first admin user</strong> for that workspace. After signup
          you are signed in; we only show your tenant API secret once — copy it before leaving this screen.
        </p>

        <ol className="space-y-4 border-t border-white/10 pt-6 text-[14px] leading-relaxed text-white/80">
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[12px] font-bold text-white">
              1
            </span>
            <span>
              <span className="font-semibold text-white">Submit this form</span> — we create the tenant and your admin
              account on the server.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[12px] font-bold text-white">
              2
            </span>
            <span>
              <span className="font-semibold text-white">Copy the API key</span> — shown only now; the backend stores a
              hash. You can rotate later from Settings → API keys.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[12px] font-bold text-white">
              3
            </span>
            <span>
              <span className="font-semibold text-white">Open the sandbox</span> — first session lands in sandbox so you
              can explore safely; switch to live when you are ready.
            </span>
          </li>
        </ol>
      </div>

      <p className="relative text-[12px] text-white/40">Already onboarded? Use Sign in instead.</p>
    </aside>
  )
}

export default function SignUpPage() {
  const router = useRouter()

  const [tenantName, setTenantName] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signupResult, setSignupResult] = useState<SignupResult | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_name: tenantName.trim(),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.message ?? 'Unable to create account right now.')
        setLoading(false)
        return
      }
      const apiKey: string | undefined = data?.api_key
      const tenantId: string | undefined = data?.user?.tenant_id ?? data?.session?.tenant_id
      const newTenantName: string | undefined = data?.user?.tenant_name
      if (apiKey && tenantId) {
        try {
          window.localStorage.setItem(`zord_tenant_api_key:${tenantId}`, apiKey)
        } catch {
          /* localStorage can be disabled */
        }
        setSignupResult({ apiKey, tenantId, tenantName: newTenantName ?? tenantName })
        setLoading(false)
        return
      }
      persistEnvMode('sandbox')
      router.push('/sandbox')
      router.refresh()
    } catch {
      setError('Network error. Try again.')
      setLoading(false)
    }
  }

  async function handleCopyKey() {
    if (!signupResult) return
    try {
      await navigator.clipboard.writeText(signupResult.apiKey)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      /* clipboard API */
    }
  }

  function handleContinue() {
    persistEnvMode('sandbox')
    router.push('/sandbox')
    router.refresh()
  }

  useEffect(() => {
    if (signupResult) persistEnvMode('sandbox')
  }, [signupResult])

  if (signupResult) {
    return (
      <div className="min-h-screen bg-[#f7f7f4] grid lg:grid-cols-[1.05fr_0.95fr]">
        <SignupMarketingAside />
        <main className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_6px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M16.704 5.293a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 011.414-1.414L8.5 12.086l6.79-6.793a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-emerald-700">
                Workspace ready
              </span>
            </div>
            <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-[#0f172a]">
              Save your tenant API key
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-[#475569]">
              Workspace <strong className="font-semibold text-[#0f172a]">{signupResult.tenantName}</strong> is live.
              Your session is already active. Use the key below from your servers as a Bearer token, or skip it and rely
              on the browser session only.
            </p>
            <p className="mt-2 text-[13px] text-[#64748b]">
              Tenant id (for support and APIs):{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-[#0f172a]">
                {signupResult.tenantId}
              </code>
            </p>

            <div className="mt-5 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
              <strong className="font-semibold">One-time disclosure.</strong> We never store this secret in plain text.
              If you lose it, open <span className="font-medium">Settings → API keys</span> in the console and rotate.
            </div>

            <div className="mt-5">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748b]">
                Secret API key
              </label>
              <div className="mt-1.5 flex items-stretch gap-2">
                <code className="flex-1 break-all rounded-[10px] border border-slate-200 bg-[#0f172a] px-3 py-3 font-mono text-[12px] leading-relaxed text-emerald-300">
                  {signupResult.apiKey}
                </code>
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="shrink-0 rounded-[10px] bg-[#0f172a] px-4 text-[13px] font-semibold text-white shadow-[0_4px_12px_rgba(15,23,42,0.18)] transition hover:bg-black"
                >
                  {copyState === 'copied' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleContinue}
              className="mt-6 w-full rounded-[10px] bg-[#0f172a] py-2.5 text-[14px] font-semibold text-white shadow-[0_4px_12px_rgba(15,23,42,0.18)] transition hover:bg-black"
            >
              Continue to sandbox
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f7f4] grid lg:grid-cols-[1.05fr_0.95fr]">
      <SignupMarketingAside />

      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0f172a] text-white font-black">Z</div>
            <span className="text-[15px] font-semibold tracking-tight text-[#0f172a]">Zord Console</span>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Step 1 of 1 — register</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-[#0f172a]">Create your workspace</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-[#64748b]">
            One short form creates your <span className="font-medium text-[#334155]">tenant</span> and your{' '}
            <span className="font-medium text-[#334155]">first admin</span>. Next screen: copy your API key, then continue
            to the sandbox workspace.
          </p>

          <ul className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-[13px] leading-snug text-[#475569]">
            <li className="flex gap-2">
              <span className="text-emerald-600" aria-hidden>
                ✓
              </span>
              <span>
                <span className="font-medium text-[#0f172a]">Company / tenant name</span> — human-readable label; may
                appear in the console and exports.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-600" aria-hidden>
                ✓
              </span>
              <span>
                <span className="font-medium text-[#0f172a]">Your name</span> — display name for the admin profile tied
                to this email.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-600" aria-hidden>
                ✓
              </span>
              <span>
                <span className="font-medium text-[#0f172a]">Password</span> — minimum 8 characters; use a unique
                passphrase for this workspace.
              </span>
            </li>
          </ul>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="block text-[12px] font-semibold text-[#334155]">Company / tenant name</span>
              <input
                type="text"
                required
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                className="mt-1.5 block w-full rounded-[12px] border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-[#0f172a] shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition focus:border-[#0f172a] focus:shadow-[0_0_0_3px_rgba(15,23,42,0.08)]"
                placeholder="e.g. Acme Payments"
                autoComplete="organization"
              />
              <span className="mt-1 block text-[12px] text-[#64748b]">How your organization appears inside Zord.</span>
            </label>

            <label className="block">
              <span className="block text-[12px] font-semibold text-[#334155]">Your full name</span>
              <input
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 block w-full rounded-[12px] border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-[#0f172a] shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition focus:border-[#0f172a] focus:shadow-[0_0_0_3px_rgba(15,23,42,0.08)]"
                placeholder="e.g. Alex Patel"
              />
              <span className="mt-1 block text-[12px] text-[#64748b]">First admin for this new workspace.</span>
            </label>

            <label className="block">
              <span className="block text-[12px] font-semibold text-[#334155]">Work email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 block w-full rounded-[12px] border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-[#0f172a] shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition focus:border-[#0f172a] focus:shadow-[0_0_0_3px_rgba(15,23,42,0.08)]"
                placeholder="you@company.com"
              />
              <span className="mt-1 block text-[12px] text-[#64748b]">Login id for this workspace; must be unique.</span>
            </label>

            <label className="block">
              <span className="block text-[12px] font-semibold text-[#334155]">Password</span>
              <div className="relative mt-1.5">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-[12px] border border-slate-200 bg-white px-3.5 py-2.5 pr-16 text-[14px] text-[#0f172a] shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition focus:border-[#0f172a] focus:shadow-[0_0_0_3px_rgba(15,23,42,0.08)]"
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-2 my-auto h-7 rounded-md px-2 text-[11px] font-semibold text-[#64748b] hover:text-[#0f172a]"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <span className="mt-1 block text-[12px] text-[#64748b]">Use a strong unique password; you can change it later.</span>
            </label>

            {error ? (
              <div className="flex items-start gap-2 rounded-[12px] border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-rose-700">
                <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{error}</span>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-[12px] bg-[#0f172a] py-2.5 text-[14px] font-semibold text-white shadow-[0_6px_16px_rgba(15,23,42,0.18)] transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#94a3b8] disabled:shadow-none"
            >
              {loading ? 'Creating workspace…' : 'Create workspace & admin'}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px] text-[#64748b]">
            Already have an account?{' '}
            <Link href="/signin" className="font-semibold text-[#0f172a] hover:underline">
              Sign in
            </Link>
          </p>
          <p className="mt-3 text-center text-[12px] text-[#94a3b8]">
            By creating a workspace you agree to our{' '}
            <Link href="/terms" className="font-medium underline-offset-2 hover:underline">
              terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="font-medium underline-offset-2 hover:underline">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  )
}
