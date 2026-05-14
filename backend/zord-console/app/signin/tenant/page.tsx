'use client'

import { FormEvent, Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { SignInShell } from '../_components/SignInShell'

function TenantSignInFormFallback() {
  return (
    <SignInShell>
      <div className="w-full max-w-md animate-pulse space-y-4">
        <div className="mb-8 h-9 w-40 rounded-lg bg-slate-200 lg:hidden" />
        <div className="h-9 w-56 rounded-lg bg-slate-200" />
        <div className="h-4 w-full max-w-sm rounded bg-slate-200" />
        <div className="mt-7 h-10 w-full rounded-xl bg-slate-200" />
        <div className="h-10 w-full rounded-xl bg-slate-200" />
        <div className="h-11 w-full rounded-xl bg-slate-300" />
      </div>
    </SignInShell>
  )
}

function TenantSignInForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/payout-command-view'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          workspace_id: '',
          login_surface: 'customer',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.message ?? 'Unable to sign in right now.')
        setLoading(false)
        return
      }
      persistEnvMode('live')
      router.push(next)
      router.refresh()
    } catch {
      setError('Network error. Try again.')
      setLoading(false)
    }
  }

  return (
    <SignInShell>
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0f172a] text-white font-black">Z</div>
          <span className="text-[15px] font-semibold tracking-tight text-[#0f172a]">Zord Console</span>
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">Tenant sign-in</p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-[#0f172a]">Live workspace</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[#64748b]">
          Sign in to your production tenant. After sign-in you are taken to the live payout command view (or the page
          you opened from).
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
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
          </label>

          <label className="block">
            <div className="flex items-baseline justify-between">
              <span className="block text-[12px] font-semibold text-[#334155]">Password</span>
              <button
                type="button"
                className="text-[11px] font-medium text-[#64748b] hover:text-[#0f172a]"
                onClick={() => {
                  /* TODO: forgot-password flow */
                }}
              >
                Forgot password?
              </button>
            </div>
            <div className="relative mt-1.5">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-[12px] border border-slate-200 bg-white px-3.5 py-2.5 pr-16 text-[14px] text-[#0f172a] shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition focus:border-[#0f172a] focus:shadow-[0_0_0_3px_rgba(15,23,42,0.08)]"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-2 my-auto h-7 rounded-md px-2 text-[11px] font-semibold text-[#64748b] hover:text-[#0f172a]"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
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
            className="group relative w-full overflow-hidden rounded-[12px] bg-[#0f172a] py-2.5 text-[14px] font-semibold text-white shadow-[0_6px_16px_rgba(15,23,42,0.18)] transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#94a3b8] disabled:shadow-none"
          >
            <span className="relative">{loading ? 'Signing in…' : 'Sign in to live'}</span>
          </button>
        </form>

        <p className="mt-5 text-[13px] leading-relaxed text-[#64748b]">
          Prefer the sandbox first?{' '}
          <Link href="/signin" className="font-semibold text-[#0f172a] underline-offset-2 hover:underline">
            Use standard sign-in
          </Link>
          .
        </p>

        <div className="my-6 flex items-center gap-3 text-[12px] text-[#94a3b8]">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="font-medium uppercase tracking-[0.1em]">or</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <Link
          href="/signup"
          className="flex w-full items-center justify-center rounded-[12px] border border-slate-200 bg-white py-2.5 text-[14px] font-semibold text-[#0f172a] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-[#0f172a] hover:bg-[#fafafa]"
        >
          Create a new workspace
        </Link>

        <p className="mt-8 text-center text-[12px] text-[#94a3b8]">
          By signing in you agree to our{' '}
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
    </SignInShell>
  )
}

export default function TenantSignInPage() {
  return (
    <Suspense fallback={<TenantSignInFormFallback />}>
      <TenantSignInForm />
    </Suspense>
  )
}
