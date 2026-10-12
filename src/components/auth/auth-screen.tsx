'use client'

import { useActionState, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, MailCheck } from 'lucide-react'
import { requestReset, signIn, signUp, type AuthState } from '@/app/(auth)/actions'
import { Logo } from '@/components/app/logo'
import { LocaleSelect } from '@/components/app/locale-select'
import { Spinner } from '@/components/ui/spinner'
import { DEMO } from '@/lib/demo/config'
import { cn } from '@/lib/utils'
import { AuthStory } from './auth-story'
import { OAuthButtons } from './oauth-buttons'

export type AuthMode = 'login' | 'register' | 'reset'

const EASE = [0.16, 1, 0.3, 1] as const
const PATHS: Record<AuthMode, string> = { login: '/login', register: '/register', reset: '/login' }

function strength(pw: string) {
  if (!pw) return 0
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return Math.min(4, Math.max(1, s - (pw.length < 8 ? 1 : 0)))
}

export function AuthScreen({ initialMode, next, linkError }: { initialMode: AuthMode; next?: string; linkError?: boolean }) {
  const t = useTranslations('auth')
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [submittedIn, setSubmittedIn] = useState<AuthMode | null>(linkError ? 'login' : null)
  const [oauthError, setOauthError] = useState<string | null>(null)

  const [loginState, loginAction, loginPending] = useActionState(signIn, undefined)
  const [registerState, registerAction, registerPending] = useActionState(signUp, undefined)
  const [resetState, resetAction, resetPending] = useActionState(requestReset, undefined)

  const states: Record<AuthMode, AuthState> = { login: loginState, register: registerState, reset: resetState }
  const state = states[mode]
  const pending = mode === 'login' ? loginPending : mode === 'register' ? registerPending : resetPending
  const action = mode === 'login' ? loginAction : mode === 'register' ? registerAction : resetAction
  const error =
    oauthError ?? (submittedIn === mode ? (state?.error ?? (linkError && mode === 'login' ? 'link_expired' : undefined)) : undefined)
  const done = (mode === 'register' && registerState?.checkEmail) || (mode === 'reset' && resetState?.sent)

  const switchTo = (m: AuthMode) => {
    if (m === mode) return
    setMode(m)
    setSubmittedIn(null)
    setOauthError(null)
    setShowPassword(false)
    const qs = next ? `?next=${encodeURIComponent(next)}` : ''
    window.history.replaceState(null, '', `${PATHS[m]}${qs}`)
  }

  // Al volver atrás/adelante en el historial, sincroniza el modo con la URL
  useEffect(() => {
    const onPop = () => setMode(window.location.pathname.startsWith('/register') ? 'register' : 'login')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const score = strength(password)

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.32, ease: EASE }}>
      <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* formulario */}
        <section className="flex min-h-dvh flex-col px-6 py-5 sm:px-10 short:py-4">
          <header className="flex items-center justify-between">
            <Logo />
            <LocaleSelect />
          </header>

          <main className="flex flex-1 items-center justify-center py-8 short:py-4">
            <div className="w-full max-w-[380px]">
              <AnimatePresence mode="wait" initial={false}>
                {done ? (
                  <motion.div
                    key={`done-${mode}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex flex-col items-start gap-4"
                  >
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-highlight text-accent">
                      <MailCheck className="size-6" />
                    </span>
                    <h1 className="font-brand text-[28px] font-semibold leading-tight tracking-[-0.03em]">
                      {mode === 'register' ? t('register.checkEmailTitle') : t('reset.sentTitle')}
                    </h1>
                    <p className="text-base leading-relaxed text-fg-muted">
                      {mode === 'register'
                        ? t('register.checkEmailBody', { email: registerState?.email ?? email })
                        : t('reset.sentBody', { email: resetState?.email ?? email })}
                    </p>
                    <button type="button" onClick={() => switchTo('login')} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink hover:underline">
                      <ArrowLeft className="size-4" />
                      {t('reset.back')}
                    </button>
                  </motion.div>
                ) : (
                  <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    {/* selector de modo */}
                    <div className="relative mb-8 h-10 short:mb-5">
                      <AnimatePresence initial={false} mode="popLayout">
                        {mode === 'reset' ? (
                          <motion.button
                            key="back"
                            type="button"
                            onClick={() => switchTo('login')}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -8 }}
                            className="inline-flex h-10 items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg"
                          >
                            <ArrowLeft className="size-4" />
                            {t('reset.back')}
                          </motion.button>
                        ) : (
                          <motion.div
                            key="tabs"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            role="tablist"
                            className="grid h-10 grid-cols-2 rounded-xl bg-sidebar p-1"
                          >
                            {(['login', 'register'] as const).map((m) => (
                              <button
                                key={m}
                                type="button"
                                role="tab"
                                aria-selected={mode === m}
                                onClick={() => switchTo(m)}
                                className={cn('relative rounded-lg text-sm font-medium transition-colors', mode === m ? 'text-fg' : 'text-fg-muted hover:text-fg')}
                              >
                                {mode === m ? <motion.span layoutId="auth-tab" className="absolute inset-0 rounded-lg bg-panel shadow-card" /> : null}
                                <span className="relative">{t(`tabs.${m}`)}</span>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* título */}
                    <div className="relative mb-7 min-h-[76px] short:mb-5 short:min-h-[60px]">
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.div
                          key={mode}
                          initial={{ opacity: 0, y: 10, filter: 'blur(3px)' }}
                          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                          exit={{ opacity: 0, y: -10, filter: 'blur(3px)' }}
                        >
                          <h1 className="font-brand text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] short:text-[26px]">{t(`${mode}.title`)}</h1>
                          <p className="mt-2 text-[15px] leading-relaxed text-fg-muted short:mt-1.5 short:text-sm">{t(`${mode}.subtitle`)}</p>
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    <AnimatePresence initial={false}>
                      {mode !== 'reset' ? (
                        <motion.div key="oauth" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <OAuthButtons next={next} onError={setOauthError} />
                          <div className="my-5 flex items-center gap-3 text-xs text-fg-subtle short:my-4">
                            <span className="h-px flex-1 bg-line" />
                            {t('oauth.divider')}
                            <span className="h-px flex-1 bg-line" />
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>

                    <form
                      action={action}
                      onSubmit={() => {
                        setSubmittedIn(mode)
                        setOauthError(null)
                      }}
                      className="flex flex-col"
                    >
                      <input type="hidden" name="next" value={next ?? ''} />

                      <AnimatePresence initial={false}>
                        {mode === 'register' ? (
                          <motion.div key="name" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <FieldShell label={t('fields.fullName')} htmlFor="full_name">
                              <input
                                id="full_name"
                                name="full_name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                autoComplete="name"
                                required
                                className={inputCls}
                              />
                            </FieldShell>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>

                      <FieldShell label={t('fields.email')} htmlFor="email">
                        <input
                          id="email"
                          name="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          autoComplete="email"
                          required
                          autoFocus
                          className={inputCls}
                        />
                      </FieldShell>

                      <AnimatePresence initial={false}>
                        {mode !== 'reset' ? (
                          <motion.div key="password" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <FieldShell
                              label={t('fields.password')}
                              htmlFor="password"
                              aside={
                                mode === 'login' ? (
                                  <button type="button" onClick={() => switchTo('reset')} className="text-xs font-medium text-accent-ink hover:underline">
                                    {t('login.forgot')}
                                  </button>
                                ) : null
                              }
                            >
                              <div className="relative">
                                <input
                                  id="password"
                                  name="password"
                                  type={showPassword ? 'text' : 'password'}
                                  value={password}
                                  onChange={(e) => setPassword(e.target.value)}
                                  onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
                                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                  minLength={mode === 'register' ? 8 : undefined}
                                  required
                                  className={cn(inputCls, 'pr-11')}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPassword((v) => !v)}
                                  className="absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-fg-subtle hover:bg-hover hover:text-fg"
                                  aria-label={showPassword ? t('fields.hidePassword') : t('fields.showPassword')}
                                >
                                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                </button>
                              </div>
                              <AnimatePresence initial={false}>
                                {capsLock ? (
                                  <motion.p key="caps" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="pt-1.5 text-xs text-mandarina-ink">
                                    {t('fields.capsLock')}
                                  </motion.p>
                                ) : null}
                                {mode === 'register' && password ? (
                                  <motion.div key="strength" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pt-2.5">
                                    <div className="flex gap-1">
                                      {[1, 2, 3, 4].map((i) => (
                                        <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-hover">
                                          <motion.span
                                            className={cn('block h-full rounded-full', score <= 1 ? 'bg-danger' : score === 2 ? 'bg-mandarina' : 'bg-accent')}
                                            initial={false}
                                            animate={{ width: i <= score ? '100%' : '0%' }}
                                          />
                                        </span>
                                      ))}
                                    </div>
                                    <p className="mt-1.5 text-xs text-fg-muted">{t('strength.label', { level: t(`strength.${score}`) })}</p>
                                  </motion.div>
                                ) : null}
                              </AnimatePresence>
                            </FieldShell>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>

                      <AnimatePresence initial={false}>
                        {error ? (
                          <motion.p
                            key={error}
                            role="alert"
                            initial={{ opacity: 0, height: 0, x: 0 }}
                            animate={{ opacity: 1, height: 'auto', x: [0, -6, 6, -3, 0] }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.4 }}
                            className="overflow-hidden"
                          >
                            <span className="mb-1 block rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{t(`errors.${error}`)}</span>
                          </motion.p>
                        ) : null}
                      </AnimatePresence>

                      <button
                        type="submit"
                        disabled={pending}
                        className="group/submit relative mt-3 inline-flex h-12 short:h-11 items-center justify-center gap-2 overflow-hidden rounded-xl bg-accent px-5 text-[15px] font-semibold text-accent-fg shadow-[0_8px_24px_-10px_var(--accent)] transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.99] disabled:opacity-80"
                      >
                        <AnimatePresence mode="popLayout" initial={false}>
                          <motion.span key={`${mode}-${pending}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="inline-flex items-center gap-2">
                            {pending ? <Spinner className="size-4" /> : null}
                            {t(`${mode}.submit`)}
                            {pending ? null : <ArrowRight className="size-4 transition-transform duration-200 group-hover/submit:translate-x-0.5" />}
                          </motion.span>
                        </AnimatePresence>
                      </button>
                    </form>

                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </main>

          <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-fg-subtle">
            <span>{t('footer', { year: new Date().getFullYear() })}</span>
            {DEMO ? <span className="rounded-full border border-dashed border-line-strong px-3 py-1 text-fg-muted">{t('demoHint')}</span> : null}
          </footer>
        </section>

        {/* historia del producto */}
        <AuthStory />
      </div>
    </MotionConfig>
  )
}

const inputCls =
  'h-12 short:h-11 w-full rounded-xl border border-line bg-panel px-4 text-[15px] text-fg outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-4 focus:ring-accent/15'

function FieldShell({ label, htmlFor, aside, children }: { label: string; htmlFor: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="pb-4 short:pb-3">
      <div className="mb-1.5 flex items-center justify-between short:mb-1">
        <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  )
}
