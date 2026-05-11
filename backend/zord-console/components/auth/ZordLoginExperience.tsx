'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { LoginFormDark } from './LoginFormDark'
import { MFAForm } from './MFAForm'
import { ZordLogo } from '@/components/ZordLogo'
import { login } from '@/services/auth'
import { UserRole } from '@/types/auth'

type AuthStep = 'login' | 'mfa'
type Environment = 'sandbox' | 'production'
interface AccessStat {
  value: string
  label: string
}

interface AccessHighlight {
  title: string
  description: string
}

interface ZordLoginExperienceProps {
  audience: string
  pageTitle: string
  pageDescription: string
  heroEyebrow: string
  heroTitle: string
  heroDescription: string
  accessBadges: string[]
  trustBadges: string[]
  stats: AccessStat[]
  highlights: AccessHighlight[]
  redirectTo: string
  role: UserRole
  backHref?: string
  backLabel?: string
  supportEmail?: string
  sandboxRedirectTo?: string
  /** When set (e.g. from `?next=` on login URL), overrides `redirectTo` after successful sign-in. */
  postLoginRedirect?: string
}

interface PendingLoginData {
  email: string
  tenantId: string
  environment: Environment
}

function toDisplayName(email: string) {
  const localPart = email.split('@')[0] ?? 'operator'
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function toTenantName(tenantId: string) {
  return tenantId
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function createMailtoLink(email: string, subject: string) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`
}

function renderMultilineText(text: string) {
  return text.split('\n').map((line, index) => (
    <span key={`${line}-${index}`} className="block">
      {line}
    </span>
  ))
}

export function ZordLoginExperience({
  audience,
  pageTitle,
  pageDescription,
  heroEyebrow,
  heroTitle,
  heroDescription,
  accessBadges,
  trustBadges,
  stats,
  highlights,
  redirectTo,
  role,
  backHref = '/',
  backLabel = 'Get Started',
  supportEmail = 'hello@arelais.com',
  sandboxRedirectTo,
  postLoginRedirect,
}: ZordLoginExperienceProps) {
  const router = useRouter()
  const [authStep, setAuthStep] = useState<AuthStep>('login')
  const [mfaEnvironment, setMfaEnvironment] = useState<Environment>('sandbox')
  const [pendingLogin, setPendingLogin] = useState<PendingLoginData | null>(null)

  const goToSupport = (subject: string) => {
    if (typeof window === 'undefined') return
    window.location.href = createMailtoLink(supportEmail, subject)
  }

  const completeLogin = (environment: Environment) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('cx_env', environment)
    }

    const destination =
      environment === 'sandbox' && sandboxRedirectTo ? sandboxRedirectTo : postLoginRedirect ?? redirectTo
    router.push(destination)
  }

  const handleLogin = async (
    email: string,
    password: string,
    tenantId: string,
    environment: Environment,
    rememberDevice: boolean,
  ) => {
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedTenant = tenantId.trim().toLowerCase()

    void rememberDevice

    const loginSurface: 'console' | 'customer' | 'ops' | 'admin' =
      redirectTo.startsWith('/admin')
        ? 'admin'
        : redirectTo.startsWith('/ops')
          ? 'ops'
          : redirectTo.startsWith('/customer')
            ? 'customer'
            : 'console'

    const response = await login({
      workspaceId: normalizedTenant,
      email: normalizedEmail,
      password,
      loginSurface,
    })

    if (response.requires_mfa) {
      setPendingLogin({ email: normalizedEmail, tenantId: normalizedTenant, environment })
      setMfaEnvironment(environment)
      setAuthStep('mfa')
      return
    }

    completeLogin(environment)
  }

  const handleMFA = async (code: string) => {
    if (!pendingLogin) {
      throw new Error('Your sign-in session expired. Please enter your credentials again.')
    }

    await new Promise((resolve) => window.setTimeout(resolve, 450))

    if (!/^\d{6}$/.test(code.trim())) {
      throw new Error('Verification code must be 6 digits.')
    }

    completeLogin(pendingLogin.environment)
  }

  const handleBackToLogin = () => {
    setAuthStep('login')
    setPendingLogin(null)
  }

  const authCardContent =
    authStep === 'login' ? (
      <>
        <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-400">{audience}</p>
        <h1 className="mt-4 text-[clamp(2.4rem,3vw,3.3rem)] font-semibold tracking-[-0.06em] text-slate-950">
          {pageTitle}
        </h1>
        <p className="mt-3 max-w-[30rem] text-[0.96rem] leading-7 text-slate-500">{pageDescription}</p>
        <div className="mt-6">
          <LoginFormDark
            onSubmit={handleLogin}
            onForgotPassword={() => goToSupport(`Reset ${audience} access`)}
            emailPlaceholder="Enter your email"
            tenantPlaceholder="Enter company code"
            submitLabel="Login"
          />
        </div>
      </>
    ) : (
      <>
        <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-400">{audience}</p>
        <h1 className="mt-4 text-[clamp(2.4rem,3vw,3.3rem)] font-semibold tracking-[-0.06em] text-slate-950">
          Confirm secure access
        </h1>
        <p className="mt-3 max-w-[34rem] text-[1rem] leading-7 text-slate-500">
          Production workspaces require an additional verification step before we unlock live payout controls.
        </p>
        <div className="mt-6">
          <MFAForm onSubmit={handleMFA} onBack={handleBackToLogin} environment={mfaEnvironment} mfaMethod="totp" />
        </div>
      </>
    )

  return (
    <main
      className="min-h-screen bg-[linear-gradient(180deg,#edf1f4_0%,#dfe4ea_100%)] text-slate-900"
      style={{
        ['--font-zord-mono' as string]: "'IBM Plex Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
        fontFamily: "'Roobert', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div className="mx-auto flex min-h-screen max-w-[1840px] items-center p-3 lg:p-5">
        <div className="grid w-full gap-3 overflow-hidden rounded-[34px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(233,238,243,0.94))] p-3 shadow-[0_30px_80px_rgba(100,116,139,0.18)] lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
          <section className="flex min-h-[860px] flex-col rounded-[30px] border border-slate-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfe_100%)] px-6 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] lg:px-10 lg:py-8">
            <div className="flex items-start">
              <ZordLogo size="hero" variant="light" className="items-center text-slate-900" />
            </div>

            <div className="mx-auto mt-6 w-full max-w-[560px] lg:mt-8">
              <div className="text-center lg:text-left">{authCardContent}</div>
            </div>

            <div className="mt-auto border-t border-slate-200/80 pt-5 text-sm text-slate-400">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>Copyright © Zord. All rights reserved.</p>
                <div className="flex flex-wrap items-center gap-4">
                  <a href={`mailto:${supportEmail}`} className="transition hover:text-slate-700">
                    Contact us
                  </a>
                  <button
                    type="button"
                    onClick={() => goToSupport('Zord access support')}
                    className="transition hover:text-slate-700"
                  >
                    Help & policy
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="relative min-h-[860px] overflow-hidden rounded-[30px] border border-slate-300/40 bg-[linear-gradient(180deg,#919ba6_0%,#5b6774_28%,#27313d_100%)] p-5 lg:p-8">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.18),rgba(15,23,42,0.08)_36%,rgba(15,23,42,0.56)_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:56px_56px] opacity-40" />
            <div className="relative z-10 flex min-h-full flex-col">
              <div className="relative h-[360px] overflow-hidden rounded-[28px] border border-white/15 bg-slate-950/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] lg:h-[410px]">
                <Image
                  src="/login/login-hero4.png"
                  alt="Zord secure access showcase"
                  fill
                  priority
                  className="object-cover object-center opacity-90"
                />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(226,232,240,0.18),transparent_36%),linear-gradient(180deg,rgba(148,163,184,0.06),rgba(15,23,42,0.44))]" />
              </div>

              <div className="mt-9 max-w-[620px]">
                <div className="inline-flex items-center gap-3 rounded-full border border-white/12 bg-white/8 px-4 py-2 backdrop-blur-md">
                  <span className="h-2 w-2 rounded-full bg-slate-100/90 shadow-[0_0_14px_rgba(255,255,255,0.35)]" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-200/80">{heroEyebrow}</p>
                </div>
                <h2 className="mt-6 max-w-[14ch] text-[clamp(2.75rem,4vw,4.45rem)] font-semibold leading-[0.9] tracking-[-0.075em] text-white">
                  {renderMultilineText(heroTitle)}
                </h2>
                {heroDescription ? (
                  <p className="mt-5 max-w-[540px] text-[1.02rem] leading-8 text-slate-300/78">{heroDescription}</p>
                ) : null}
              </div>

              <div className="mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-white/12 pt-6">
                <div className="max-w-[360px]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                    {highlights[1]?.title ?? 'Platform context'}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-300/85">
                    {highlights[1]?.description ?? highlights[0]?.description}
                  </p>
                </div>

                <div className="flex items-center gap-3 rounded-full border border-white/12 bg-white/10 px-4 py-3 backdrop-blur-md">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/14">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-100" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Secure mode</p>
                    <p className="text-sm font-medium text-white">{trustBadges[0] ?? 'Tenant-safe sessions'}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
