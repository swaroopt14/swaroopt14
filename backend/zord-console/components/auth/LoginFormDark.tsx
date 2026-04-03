'use client'

import { useState, FormEvent, useEffect, useRef } from 'react'
import Link from 'next/link'

interface LoginFormDarkProps {
  onSubmit: (email: string, password: string, tenantId: string, environment: 'sandbox' | 'production', rememberDevice: boolean) => Promise<void>
  onSignUpClick?: () => void
  onForgotPassword?: () => void
  emailPlaceholder?: string
}

interface FormErrors {
  email?: string
  password?: string
  tenantId?: string
  environment?: string
  general?: string
}

export function LoginFormDark({ 
  onSubmit,
  onSignUpClick,
  onForgotPassword,
  emailPlaceholder = 'name@company.com'
}: LoginFormDarkProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox')
  const [rememberDevice, setRememberDevice] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [touched, setTouched] = useState({ email: false, password: false, tenantId: false })
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [showCaptcha, setShowCaptcha] = useState(false)
  const emailInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailInputRef.current?.focus()
  }, [])

  const validateEmail = (value: string): string | undefined => {
    if (!value.trim()) {
      return 'Email is required'
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(value)) {
      return 'Please enter a valid email address'
    }
    return undefined
  }

  const validatePassword = (value: string): string | undefined => {
    if (!value) {
      return 'Password is required'
    }
    if (value.length < 12) {
      return 'Password must be at least 12 characters'
    }
    // Silent complexity check - only show error if validation fails
    const hasUpper = /[A-Z]/.test(value)
    const hasLower = /[a-z]/.test(value)
    const hasNumber = /[0-9]/.test(value)
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(value)
    
    if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
      return 'Password must contain uppercase, lowercase, number, and special character'
    }
    return undefined
  }

  const validateTenantId = (value: string): string | undefined => {
    if (!value.trim()) {
      return 'Tenant ID is required'
    }
    // Case-insensitive validation
    if (!/^[a-z0-9-]+$/i.test(value.trim())) {
      return 'Tenant ID can only contain letters, numbers, and hyphens'
    }
    return undefined
  }

  const handleBlur = (field: 'email' | 'password' | 'tenantId') => {
    setTouched(prev => ({ ...prev, [field]: true }))
    if (field === 'email') {
      const error = validateEmail(email)
      setErrors(prev => ({ ...prev, email: error, general: undefined }))
    } else if (field === 'password') {
      const error = validatePassword(password)
      setErrors(prev => ({ ...prev, password: error, general: undefined }))
    } else if (field === 'tenantId') {
      const error = validateTenantId(tenantId)
      setErrors(prev => ({ ...prev, tenantId: error, general: undefined }))
    }
  }

  const handleEmailChange = (value: string) => {
    setEmail(value)
    if (touched.email) {
      const error = validateEmail(value)
      setErrors(prev => ({ ...prev, email: error, general: undefined }))
    }
  }

  const handlePasswordChange = (value: string) => {
    setPassword(value)
    if (touched.password) {
      const error = validatePassword(value)
      setErrors(prev => ({ ...prev, password: error, general: undefined }))
    }
  }

  const handleTenantIdChange = (value: string) => {
    setTenantId(value)
    if (touched.tenantId) {
      const error = validateTenantId(value)
      setErrors(prev => ({ ...prev, tenantId: error, general: undefined }))
    }
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    setTouched({ email: true, password: true, tenantId: true })
    
    const emailError = validateEmail(email)
    const passwordError = validatePassword(password)
    const tenantIdError = validateTenantId(tenantId)
    
    if (emailError || passwordError || tenantIdError) {
      setErrors({
        email: emailError,
        password: passwordError,
        tenantId: tenantIdError,
      })
      return
    }

    setIsLoading(true)
    setErrors({})

    try {
      await onSubmit(
        email.trim().toLowerCase(), 
        password, 
        tenantId.trim().toLowerCase(), 
        environment,
        rememberDevice
      )
      // Reset failed attempts on success
      setFailedAttempts(0)
      setShowCaptcha(false)
    } catch (error) {
      // Increment failed attempts
      const newFailedAttempts = failedAttempts + 1
      setFailedAttempts(newFailedAttempts)
      
      // Show CAPTCHA after 3 failed attempts
      if (newFailedAttempts >= 3) {
        setShowCaptcha(true)
      }
      
      // Generic error message for security (never reveal if email exists)
      setErrors({
        general: 'Invalid credentials',
      })
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {errors.general && (
        <div 
          className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start"
          role="alert"
          aria-live="polite"
        >
          <svg className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <p className="text-sm font-medium text-red-400">{errors.general}</p>
        </div>
      )}

      {/* Work Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
          Work Email
        </label>
        <input
          ref={emailInputRef}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => handleEmailChange(e.target.value)}
          onBlur={() => handleBlur('email')}
          className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
            errors.email && touched.email
              ? 'border-red-500'
              : 'border-gray-700'
          }`}
          placeholder={emailPlaceholder}
          aria-invalid={errors.email && touched.email ? 'true' : 'false'}
          disabled={isLoading}
        />
        {errors.email && touched.email && (
          <p className="mt-2 text-sm text-red-400" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      {/* Password */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            onBlur={() => handleBlur('password')}
            className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all pr-12 ${
              errors.password && touched.password
                ? 'border-red-500'
                : 'border-gray-700'
            }`}
            placeholder="Enter your password"
            aria-invalid={errors.password && touched.password ? 'true' : 'false'}
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-800 rounded p-1 transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            disabled={isLoading}
          >
            {showPassword ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L3 12m3.29-5.71L12 12m-8.71 0L3 21m8.71-9L21 21" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
        {errors.password && touched.password && (
          <p className="mt-2 text-sm text-red-400" role="alert">
            {errors.password}
          </p>
        )}
      </div>

      {/* Tenant ID */}
      <div>
        <label htmlFor="tenantId" className="block text-sm font-medium text-gray-300 mb-2">
          Tenant / Account ID
        </label>
        <input
          id="tenantId"
          name="tenantId"
          type="text"
          autoComplete="organization"
          value={tenantId}
          onChange={(e) => handleTenantIdChange(e.target.value)}
          onBlur={() => handleBlur('tenantId')}
          className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
            errors.tenantId && touched.tenantId
              ? 'border-red-500'
              : 'border-gray-700'
          }`}
          placeholder="acme-finance-prod"
          aria-invalid={errors.tenantId && touched.tenantId ? 'true' : 'false'}
          disabled={isLoading}
        />
        {errors.tenantId && touched.tenantId && (
          <p className="mt-2 text-sm text-red-400" role="alert">
            {errors.tenantId}
          </p>
        )}
      </div>

      {/* Environment */}
      <div>
        <label htmlFor="environment" className="block text-sm font-medium text-gray-300 mb-2">
          Environment
        </label>
        <select
          id="environment"
          name="environment"
          value={environment}
          onChange={(e) => setEnvironment(e.target.value as 'sandbox' | 'production')}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
          disabled={isLoading}
        >
          <option value="sandbox">Sandbox</option>
          <option value="production">Production</option>
        </select>
      </div>

      {/* Remember Device */}
      <div className="flex items-center">
        <input
          id="rememberDevice"
          name="rememberDevice"
          type="checkbox"
          checked={rememberDevice}
          onChange={(e) => setRememberDevice(e.target.checked)}
          className="w-4 h-4 text-purple-600 bg-gray-800 border-gray-700 rounded focus:ring-purple-500 focus:ring-2"
          disabled={isLoading}
        />
        <label htmlFor="rememberDevice" className="ml-2 text-sm text-gray-400">
          Remember this device
        </label>
      </div>

      {/* Rate Limiting Warning */}
      {failedAttempts > 0 && failedAttempts < 3 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
          <p className="text-sm text-yellow-400">
            {failedAttempts === 1 
              ? '1 failed attempt. After 3 failed attempts, you will be required to complete a security check.'
              : `${failedAttempts} failed attempts. One more failed attempt will require a security check.`}
          </p>
        </div>
      )}

      {/* CAPTCHA Placeholder */}
      {showCaptcha && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-sm font-medium text-red-400 mb-3">
            Security check required
          </p>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 flex items-center justify-center min-h-[100px]">
            <p className="text-sm text-gray-400">
              [CAPTCHA would be displayed here in production]
            </p>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Please complete the security check to continue. This helps protect your account from unauthorized access.
          </p>
        </div>
      )}

      {/* Forgot Password & Request Access */}
      <div className="flex items-center justify-between">
        {onForgotPassword ? (
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-sm text-purple-500 hover:text-purple-400 transition-colors"
          >
            Forgot password?
          </button>
        ) : (
          <Link 
            href="#" 
            className="text-sm text-purple-500 hover:text-purple-400 transition-colors"
          >
            Forgot password?
          </Link>
        )}
        {onSignUpClick && (
          <button
            type="button"
            onClick={onSignUpClick}
            className="text-sm text-purple-500 hover:text-purple-400 transition-colors"
          >
            Request access
          </button>
        )}
      </div>

      {/* Login Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3 px-4 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        aria-busy={isLoading}
      >
        {isLoading ? 'Signing in...' : 'Sign in'}
      </button>

    </form>
  )
}
