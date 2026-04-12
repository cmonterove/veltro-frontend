'use client'

import { register } from '@/app/(auth)/register/actions'
import { Building2, CheckIcon, EyeIcon, EyeOffIcon, MailIcon, UserIcon } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useId, useState, useTransition } from 'react'

function passwordStrengthScore(pw: string): number {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return Math.min(score, 5)
}

const STRENGTH_KEYS = ['tooWeak', 'weak', 'fair', 'strong', 'veryStrong'] as const

function PasswordStrength({ password }: { password: string }) {
  const t = useTranslations('auth.passwordStrength')
  const score = passwordStrengthScore(password)
  if (!password) return null
  const labelKey = STRENGTH_KEYS[score - 1]
  if (!labelKey) return null

  return (
    <div className="auth-strength">
      <div className="auth-strength-bars">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`auth-strength-bar${i <= score ? ` auth-strength-on t${score}` : ''}`}
          />
        ))}
      </div>
      <span className={`auth-strength-label t${score}`}>{t(labelKey)}</span>
    </div>
  )
}

function FieldError({ msg }: { msg?: string }) {
  return (
    <div className="auth-field-error">
      {msg && (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {msg}
        </>
      )}
    </div>
  )
}

type Errors = Partial<Record<'org' | 'fullName' | 'email' | 'password' | 'confirm' | 'terms', string>>

export function RegisterForm() {
  const t = useTranslations('auth.register')
  const tv = useTranslations('auth.validation')
  const tc = useTranslations('auth.commonAuth')
  const tCommon = useTranslations('common')
  const id = useId()

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [password, setPassword] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Errors>({})

  const clearError = useCallback((field: keyof Errors) => {
    setErrors((p) => ({ ...p, [field]: undefined }))
  }, [])

  function validate(data: Record<string, string>): Errors {
    const e: Errors = {}
    if (!data.org?.trim()) e.org = tv('orgRequired')
    if (!data.fullName?.trim()) e.fullName = tv('fullNameRequired')
    else if (data.fullName.trim().split(/\s+/).filter(Boolean).length < 2) e.fullName = tv('fullNameTwoWords')

    if (!data.email) e.email = tv('emailRequired')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) e.email = tv('emailInvalid')

    if (!data.password) e.password = tv('passwordRequired')
    else if (data.password.length < 8) e.password = tv('passwordMin8')
    else if (passwordStrengthScore(data.password) < 2) e.password = tv('passwordWeak')

    if (!data.confirm) e.confirm = tv('confirmRequired')
    else if (data.confirm !== data.password) e.confirm = tv('confirmMismatch')

    if (!data.terms) e.terms = tv('termsRequired')
    return e
  }

  async function handleSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setServerError(null)

    const raw = new FormData(ev.currentTarget)
    const data = {
      org: (raw.get('org') as string) ?? '',
      fullName: (raw.get('fullName') as string) ?? '',
      email: (raw.get('email') as string) ?? '',
      password: (raw.get('password') as string) ?? '',
      confirm: (raw.get('confirm') as string) ?? '',
      terms: raw.get('terms') as string | null,
    }

    const fieldErrors = validate({
      ...data,
      terms: data.terms ? '1' : '',
    })
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})

    const formData = new FormData(ev.currentTarget)
    formData.delete('confirm')
    formData.delete('terms')

    startTransition(async () => {
      const result = await register(null, formData)
      if (result?.error) setServerError(result.error)
    })
  }

  return (
    <div className="auth-panel">
      <div className="auth-panel-header">
        <div className="auth-panel-label">{t('title')}</div>
        <h2 className="auth-panel-title">
          {t('panelHeading')}
          <span>.</span>
        </h2>
        <p className="auth-panel-sub">
          {t('hasAccount')}{' '}
          <Link href="/login">{t('signInLink')}</Link>
        </p>
      </div>

      {serverError && (
        <div className="auth-error-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="auth-field">
          <input
            id={`${id}-org`}
            name="org"
            type="text"
            placeholder=" "
            autoComplete="organization"
            className={`auth-field-input${errors.org ? ' error' : ''}`}
            onChange={() => clearError('org')}
          />
          <label htmlFor={`${id}-org`} className="auth-field-label">
            {t('orgNameLabel')}
          </label>
          <span className="auth-field-icon" aria-hidden>
            <Building2 size={16} />
          </span>
          <FieldError msg={errors.org} />
        </div>

        <div className="auth-field">
          <input
            id={`${id}-fullName`}
            name="fullName"
            type="text"
            placeholder=" "
            autoComplete="name"
            className={`auth-field-input${errors.fullName ? ' error' : ''}`}
            onChange={() => clearError('fullName')}
          />
          <label htmlFor={`${id}-fullName`} className="auth-field-label">
            {t('fullNameLabel')}
          </label>
          <span className="auth-field-icon" aria-hidden>
            <UserIcon size={16} />
          </span>
          <FieldError msg={errors.fullName} />
        </div>

        <div className="auth-field">
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            placeholder=" "
            autoComplete="email"
            className={`auth-field-input${errors.email ? ' error' : ''}`}
            onChange={() => clearError('email')}
          />
          <label htmlFor={`${id}-email`} className="auth-field-label">
            {t('emailLabel')}
          </label>
          <span className="auth-field-icon" aria-hidden>
            <MailIcon size={16} />
          </span>
          <FieldError msg={errors.email} />
        </div>

        <div className="auth-field">
          <input
            id={`${id}-password`}
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder=" "
            autoComplete="new-password"
            className={`auth-field-input${errors.password ? ' error' : ''}`}
            onChange={(e) => {
              setPassword(e.target.value)
              clearError('password')
            }}
          />
          <label htmlFor={`${id}-password`} className="auth-field-label">
            {t('passwordLabel')}
          </label>
          <span
            className="auth-field-icon clickable"
            onClick={() => setShowPassword((s) => !s)}
            onKeyDown={(ke) => {
              if (ke.key === 'Enter' || ke.key === ' ') {
                ke.preventDefault()
                setShowPassword((s) => !s)
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={showPassword ? tc('hidePassword') : tc('showPassword')}
          >
            {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          </span>
          <PasswordStrength password={password} />
          <FieldError msg={errors.password} />
        </div>

        <div className="auth-field">
          <input
            id={`${id}-confirm`}
            name="confirm"
            type={showConfirm ? 'text' : 'password'}
            placeholder=" "
            autoComplete="new-password"
            className={`auth-field-input${errors.confirm ? ' error' : ''}`}
            onChange={() => clearError('confirm')}
          />
          <label htmlFor={`${id}-confirm`} className="auth-field-label">
            {t('confirmPasswordLabel')}
          </label>
          <span
            className="auth-field-icon clickable"
            onClick={() => setShowConfirm((s) => !s)}
            onKeyDown={(ke) => {
              if (ke.key === 'Enter' || ke.key === ' ') {
                ke.preventDefault()
                setShowConfirm((s) => !s)
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={showConfirm ? tc('hidePassword') : tc('showPassword')}
          >
            {showConfirm ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          </span>
          <FieldError msg={errors.confirm} />
        </div>

        <div className="auth-check-row">
          <input type="checkbox" id={`${id}-terms`} name="terms" value="1" onChange={() => clearError('terms')} />
          <label htmlFor={`${id}-terms`}>
            {t('termsText')}{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer">
              {t('termsLink')}
            </a>{' '}
            {tCommon('and')}{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer">
              {t('privacyLink')}
            </a>
          </label>
        </div>
        {errors.terms && (
          <div className="auth-field-error" style={{ marginTop: '-6px', marginBottom: '8px' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {errors.terms}
          </div>
        )}

        <button type="submit" className="auth-btn-primary" disabled={isPending}>
          {isPending ? <span className="auth-spinner" /> : <CheckIcon size={15} aria-hidden />}
          {isPending ? tc('creatingAccount') : t('submitButton')}
        </button>
      </form>

      <div className="auth-divider">
        <div className="auth-divider-line" />
        <span className="auth-divider-text">{t('dividerSocial')}</span>
        <div className="auth-divider-line" />
      </div>

      <button
        type="button"
        className="auth-btn-secondary"
        onClick={() => alert(tc('oauthComingSoon'))}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        {t('googleButton')}
      </button>
    </div>
  )
}
