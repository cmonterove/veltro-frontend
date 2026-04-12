'use client'

import { login } from '@/app/(auth)/login/actions'
import { EyeIcon, EyeOffIcon, MailIcon } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useId, useState, useTransition } from 'react'

export function LoginForm() {
  const t = useTranslations('auth.login')
  const tv = useTranslations('auth.validation')
  const tc = useTranslations('auth.commonAuth')
  const id = useId()

  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  function validate(email: string, password: string) {
    const e: typeof errors = {}
    if (!email) e.email = tv('emailRequired')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = tv('emailInvalid')
    if (!password) e.password = tv('passwordRequired')
    else if (password.length < 6) e.password = tv('passwordMin6')
    return e
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setServerError(null)

    const formData = new FormData(e.currentTarget)
    const email = (formData.get('email') as string) ?? ''
    const password = (formData.get('password') as string) ?? ''

    const fieldErrors = validate(email, password)
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})

    startTransition(async () => {
      const result = await login(null, formData)
      if (result?.error) setServerError(result.error)
    })
  }

  return (
    <div className="auth-panel">
      <div className="auth-panel-header">
        <div className="auth-panel-label">{t('panelEyebrow')}</div>
        <h2 className="auth-panel-title">
          {t('title')}
          <span>.</span>
        </h2>
        <p className="auth-panel-sub">
          {t('noAccount')}{' '}
          <Link href="/register">{t('signUpLink')}</Link>
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
            id={`${id}-email`}
            name="email"
            type="email"
            placeholder=" "
            autoComplete="email"
            className={`auth-field-input${errors.email ? ' error' : ''}`}
            onChange={() => errors.email && setErrors((p) => ({ ...p, email: undefined }))}
          />
          <label htmlFor={`${id}-email`} className="auth-field-label">
            {t('emailLabel')}
          </label>
          <span className="auth-field-icon" aria-hidden>
            <MailIcon size={16} />
          </span>
          <div className="auth-field-error">
            {errors.email && (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {errors.email}
              </>
            )}
          </div>
        </div>

        <div className="auth-field">
          <input
            id={`${id}-password`}
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder=" "
            autoComplete="current-password"
            className={`auth-field-input${errors.password ? ' error' : ''}`}
            onChange={() => errors.password && setErrors((p) => ({ ...p, password: undefined }))}
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
          <div className="auth-field-error">
            {errors.password && (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {errors.password}
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px', marginTop: '-4px' }}>
          <Link href={'/forgot-password' as Route} className="auth-forgot-link">
            {t('forgotPassword')}
          </Link>
        </div>

        <button type="submit" className="auth-btn-primary" disabled={isPending}>
          {isPending ? <span className="auth-spinner" /> : null}
          {isPending ? tc('signingIn') : t('submitButton')}
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
