'use client'

import { useState, FormEvent, useRef, useEffect } from 'react'

interface MFAFormProps {
  onSubmit: (code: string) => Promise<void>
  onBack?: () => void
  environment: 'sandbox' | 'production'
  mfaMethod?: 'totp' | 'sms' | 'hardware'
}

interface FormErrors {
  code?: string
  general?: string
}

export function MFAForm({ 
  onSubmit, 
  onBack,
  environment,
  mfaMethod = 'totp'
}: MFAFormProps) {
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    codeInputRef.current?.focus()
  }, [])

  const validateCode = (value: string): string | undefined => {
    if (!value.trim()) {
      return 'Verification code is required'
    }
    // TOTP codes are typically 6 digits
    if (mfaMethod === 'totp' && !/^\d{6}$/.test(value.trim())) {
      return 'Code must be 6 digits'
    }
    return undefined
  }

  const handleCodeChange = (value: string) => {
    // Only allow digits for TOTP
    if (mfaMethod === 'totp') {
      const digitsOnly = value.replace(/\D/g, '').slice(0, 6)
      setCode(digitsOnly)
    } else {
      setCode(value)
    }
    
    if (errors.code) {
      setErrors(prev => ({ ...prev, code: undefined, general: undefined }))
    }
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    const codeError = validateCode(code)
    
    if (codeError) {
      setErrors({ code: codeError })
      return
    }

    setIsLoading(true)
    setErrors({})

    try {
      await onSubmit(code.trim())
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : 'Invalid verification code. Please try again.',
      })
      setIsLoading(false)
      setCode('')
      codeInputRef.current?.focus()
    }
  }

  const getMethodName = () => {
    switch (mfaMethod) {
      case 'totp':
        return 'authenticator app'
      case 'sms':
        return 'SMS'
      case 'hardware':
        return 'hardware key'
      default:
        return 'authenticator app'
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Multi-factor authentication</h2>
        <p className="text-gray-400 text-sm mb-6">
          {environment === 'production' 
            ? 'MFA is required for Production environment.'
            : 'Enter the verification code from your authenticator app.'}
        </p>
      </div>

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

      {/* Verification Code */}
      <div>
        <label htmlFor="mfaCode" className="block text-sm font-medium text-gray-300 mb-2">
          Verification code from {getMethodName()}
        </label>
        <input
          ref={codeInputRef}
          id="mfaCode"
          name="mfaCode"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-center text-2xl tracking-widest ${
            errors.code
              ? 'border-red-500'
              : 'border-gray-700'
          }`}
          placeholder={mfaMethod === 'totp' ? '000000' : 'Enter code'}
          maxLength={mfaMethod === 'totp' ? 6 : undefined}
          aria-invalid={errors.code ? 'true' : 'false'}
          disabled={isLoading}
        />
        {errors.code && (
          <p className="mt-2 text-sm text-red-400" role="alert">
            {errors.code}
          </p>
        )}
        {mfaMethod === 'totp' && (
          <p className="mt-2 text-xs text-gray-500">
            Open your authenticator app (Google Authenticator, Authy, etc.) and enter the 6-digit code.
          </p>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading || !code.trim()}
        className="w-full py-3 px-4 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        aria-busy={isLoading}
      >
        {isLoading ? 'Verifying...' : 'Verify'}
      </button>

      {/* Back Button */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="w-full py-2 px-4 text-gray-400 hover:text-white transition-colors text-sm"
        >
          ← Back to sign in
        </button>
      )}
    </form>
  )
}
