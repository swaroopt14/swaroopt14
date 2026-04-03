'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setCurrentUser, setCurrentRole } from '@/services/auth'
import { DarkLoginLayout, SignUpFormMultiStep, LoginFormDark, MFAForm } from '@/components/auth'
import { ZordLogo } from '@/components/ZordLogo'

type AuthStep = 'login' | 'signup' | 'mfa'

interface SignUpData {
  organizationName: string
  organizationType: string
  country: string
  useCases: string[]
  firstName: string
  lastName: string
  email: string
  password: string
  tenantId: string
  timezone: string
  agreeToTerms: boolean
  agreeToDPA: boolean
  understandNoFunds: boolean
}

export default function AdminLoginPage() {
  const router = useRouter()
  const [authStep, setAuthStep] = useState<AuthStep>('login')
  const [mfaEnvironment, setMfaEnvironment] = useState<'sandbox' | 'production'>('sandbox')
  const [pendingLoginData, setPendingLoginData] = useState<{
    email: string
    tenantId: string
    environment: 'sandbox' | 'production'
  } | null>(null)

  const handleSignUp = async (data: SignUpData) => {
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Additional validation for admin access
    if (!data.email.includes('@') && !data.email.includes('admin')) {
      throw new Error('Invalid admin credentials')
    }

    setCurrentUser({
      id: 'admin_1',
      email: data.email,
      role: 'ADMIN',
      name: `${data.firstName} ${data.lastName}`,
    })
    setCurrentRole('ADMIN')

    router.push('/admin/tenants')
  }

  const handleLogin = async (
    email: string,
    password: string,
    tenantId: string,
    environment: 'sandbox' | 'production',
    rememberDevice: boolean
  ) => {
    await new Promise(resolve => setTimeout(resolve, 500))

    // Additional validation for admin access
    if (!email.includes('@') && !email.includes('admin')) {
      throw new Error('Invalid admin credentials')
    }

    setPendingLoginData({ email, tenantId, environment })
    setMfaEnvironment(environment)

    if (environment === 'production') {
      setAuthStep('mfa')
    } else {
      completeLogin(email)
    }
  }

  const handleMFA = async (code: string) => {
    if (!pendingLoginData) return

    await new Promise(resolve => setTimeout(resolve, 500))

    if (code.length !== 6) {
      throw new Error('Invalid verification code')
    }

    completeLogin(pendingLoginData.email)
  }

  const completeLogin = (email: string) => {
    setCurrentUser({
      id: 'admin_1',
      email: email,
      role: 'ADMIN',
      name: 'Platform Admin',
    })
    setCurrentRole('ADMIN')

    router.push('/admin/tenants')
  }

  const handleLoginClick = () => {
    setAuthStep('login')
    setPendingLoginData(null)
  }

  const handleSignUpClick = () => {
    setAuthStep('signup')
    setPendingLoginData(null)
  }

  const handleForgotPassword = () => {
    console.log('Forgot password clicked')
  }

  return (
    <DarkLoginLayout
      logoText="ZORD"
      tagline="Managing Platforms, Controlling Access"
      backToWebsiteLink="/"
    >
      <div>
        {authStep === 'mfa' ? (
          <>
            <MFAForm
              onSubmit={handleMFA}
              onBack={handleLoginClick}
              environment={mfaEnvironment}
              mfaMethod="totp"
            />
          </>
        ) : authStep === 'login' ? (
          <>
            <h1 className="text-3xl font-bold text-white mb-2">Sign in to Zord</h1>
            <p className="text-gray-400 mb-8">
              Don&apos;t have an account?{' '}
              <button
                onClick={handleSignUpClick}
                className="text-purple-500 hover:text-purple-400 underline"
              >
                Request access
              </button>
            </p>
            <LoginFormDark
              onSubmit={handleLogin}
              onSignUpClick={handleSignUpClick}
              onForgotPassword={handleForgotPassword}
              emailPlaceholder="name@company.com"
            />
          </>
        ) : (
          <>
            <div className="mb-6">
              <ZordLogo size="lg" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Create an account</h1>
            <p className="text-gray-400 mb-8">
              Already have an account?{' '}
              <button
                onClick={handleLoginClick}
                className="text-purple-500 hover:text-purple-400 underline"
              >
                Log in
              </button>
            </p>
            <SignUpFormMultiStep onSubmit={handleSignUp} onLoginClick={handleLoginClick} />
          </>
        )}
      </div>
    </DarkLoginLayout>
  )
}
