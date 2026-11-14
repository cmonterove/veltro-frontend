'use client'

import { useActionState, useState, useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { MotionConfig, motion } from 'motion/react'
import { format } from 'date-fns'
import { ArrowRight, CircleAlert, Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { acceptWithPassword, acceptWithSession, switchAccount, type AcceptState, type InvitePeek } from '@/app/invite/actions'
import { Logo } from '@/components/app/logo'
import { LocaleSelect } from '@/components/app/locale-select'
import { Avatar } from '@/components/ui/avatar'
import { Spinner } from '@/components/ui/spinner'
import { passwordProblem } from '@/lib/api/ajustes'
import { useDateLocale } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { AuthStory } from './auth-story'
import { FieldShell, inputCls } from './auth-screen'
import { OAuthButtons } from './oauth-buttons'

const EASE = [0.16, 1, 0.3, 1] as const

const primaryCls =
  'group/submit relative inline-flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-accent px-5 text-[15px] font-semibold text-accent-fg shadow-[0_8px_24px_-10px_var(--accent)] transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.99] disabled:opacity-80'

/**
 * Aceptar una invitación. Quien no tiene usuario lo crea aquí (nombre y contraseña) o entra con
 * Google; quien ya tiene, entra y vuelve; con la sesión de otro correo, se ofrece cambiarla.
 */
export function InviteScreen({ token, peek, me }: { token: string; peek: InvitePeek | null; me: { email: string; fullName: string } | null }) {
  const t = useTranslations('invite')
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.32, ease: EASE }}>
      <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="flex min-h-dvh flex-col px-6 py-5 sm:px-10">
          <header className="flex items-center justify-between">
            <Logo />
            <LocaleSelect />
          </header>
          <main className="flex flex-1 items-center justify-center py-8">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[400px]">
              {!peek ? (
                <Dead title={t('notFound.title')} body={t('notFound.body')} />
              ) : peek.status === 'accepted' ? (
                <Dead title={t('accepted.title')} body={t('accepted.body', { account: peek.accountName })} action={{ href: me ? '/home' : '/login', label: me ? t('accepted.open') : t('accepted.login') }} />
              ) : peek.status !== 'pending' ? (
                <Dead title={t('expired.title')} body={t('expired.body', { inviter: peek.inviter?.fullName ?? t('someone') })} />
              ) : (
                <Pending token={token} peek={peek} me={me} />
              )}
            </motion.div>
          </main>
          <footer className="text-xs text-fg-subtle">{t('footer', { year: new Date().getFullYear() })}</footer>
        </section>
        <AuthStory />
      </div>
    </MotionConfig>
  )
}

function Dead({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-warning-soft text-mandarina-ink">
        <CircleAlert className="size-6" />
      </span>
      <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
      <p className="text-base leading-relaxed text-fg-muted">{body}</p>
      {action ? (
        <Link href={action.href} className={cn(primaryCls, 'mt-2 w-auto')}>
          {action.label}
          <ArrowRight className="size-4" />
        </Link>
      ) : null}
    </div>
  )
}

function Pending({ token, peek, me }: { token: string; peek: InvitePeek; me: { email: string; fullName: string } | null }) {
  const t = useTranslations('invite')
  const next = `/invite/${token}`
  const [oauthError, setOauthError] = useState<string | null>(null)
  const sameUser = me && me.email.toLowerCase() === peek.email

  return (
    <>
      {/* quién invita y a qué */}
      <div className="mb-7">
        <div className="mb-4 flex items-center gap-2.5">
          <Avatar name={peek.inviter?.fullName ?? '?'} src={peek.inviter?.avatarUrl ?? null} size={32} />
          <p className="text-sm text-fg-muted">{t('invitedBy', { inviter: peek.inviter?.fullName ?? t('someone') })}</p>
        </div>
        <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.02em]">{peek.accountName}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
          {peek.role === 'admin' ? t('asAdmin') : peek.workspaces.length ? t('withSpaces', { spaces: peek.workspaces.join(', ') }) : t('asMember')}
        </p>
      </div>

      {sameUser ? (
        <JoinWithSession token={token} account={peek.accountName} email={me.email} />
      ) : me ? (
        <OtherSession token={token} me={me.email} invited={peek.email} />
      ) : (
        <>
          <OAuthButtons next={next} onError={setOauthError} />
          {oauthError ? <p className="mt-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{t(`errors.${oauthError === 'oauth_unavailable' ? 'oauth_unavailable' : 'generic'}`)}</p> : null}
          <div className="my-5 flex items-center gap-3 text-xs text-fg-subtle">
            <span className="h-px flex-1 bg-line" />
            {peek.hasUser ? t('orLogin') : t('orPassword')}
            <span className="h-px flex-1 bg-line" />
          </div>
          {peek.hasUser ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm leading-relaxed text-fg-muted">{t('hasUser', { email: peek.email })}</p>
              <Link href={`/login?next=${encodeURIComponent(next)}`} className={primaryCls}>
                {t('login')}
                <ArrowRight className="size-4 transition-transform duration-200 group-hover/submit:translate-x-0.5" />
              </Link>
            </div>
          ) : (
            <CreateUser token={token} peek={peek} />
          )}
        </>
      )}
    </>
  )
}

function JoinWithSession({ token, account, email }: { token: string; account: string; email: string }) {
  const t = useTranslations('invite')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">{t('signedInAs', { email })}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await acceptWithSession(token)
            if (res?.error) setError(res.error)
          })
        }
        className={primaryCls}
      >
        {pending ? <Spinner className="size-4" /> : null}
        {t('join', { account })}
        {pending ? null : <ArrowRight className="size-4 transition-transform duration-200 group-hover/submit:translate-x-0.5" />}
      </button>
      {error ? <ErrorLine code={error} /> : null}
    </div>
  )
}

function OtherSession({ token, me, invited }: { token: string; me: string; invited: string }) {
  const t = useTranslations('invite')
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl bg-warning-soft px-3.5 py-3 text-sm leading-relaxed text-fg">{t('otherSession', { me, invited })}</p>
      <button type="button" disabled={pending} onClick={() => start(() => switchAccount(token))} className={primaryCls}>
        {pending ? <Spinner className="size-4" /> : null}
        {t('switch', { email: invited })}
      </button>
    </div>
  )
}

function CreateUser({ token, peek }: { token: string; peek: InvitePeek }) {
  const t = useTranslations('invite')
  const ta = useTranslations('auth')
  const tv = useTranslations('validation')
  const tp = useTranslations('settings.profile')
  const locale = useDateLocale()
  const [state, action, pending] = useActionState<AcceptState, FormData>(acceptWithPassword, undefined)
  const [name, setName] = useState(peek.fullName ?? '')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [touched, setTouched] = useState({ name: false, password: false })
  const nameProblem = name.trim().length >= 2 ? null : name.trim() ? tv('tooShort', { min: 2, count: name.trim().length }) : tv('required')
  const pwProblem = !password ? tv('passwordMissing') : passwordProblem(password) ? tp(passwordProblem(password)!) : null

  return (
    <form
      action={action}
      noValidate
      onSubmit={(e) => {
        if (nameProblem || pwProblem) {
          e.preventDefault()
          setTouched({ name: true, password: true })
          document.getElementById(nameProblem ? 'full_name' : 'password')?.focus()
        }
      }}
      className="flex flex-col"
    >
      <input type="hidden" name="token" value={token} />
      <FieldShell label={ta('fields.email')} htmlFor="email" icon={Mail} valid>
        <input id="email" value={peek.email} readOnly aria-readonly className={cn(inputCls, 'cursor-default bg-sidebar pr-11 text-fg-muted')} />
      </FieldShell>
      <FieldShell label={ta('fields.fullName')} htmlFor="full_name" icon={UserRound} valid={!nameProblem} error={touched.name ? nameProblem : null}>
        <input
          id="full_name"
          name="full_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched((s) => ({ ...s, name: true }))}
          autoComplete="name"
          autoFocus={!peek.fullName}
          aria-invalid={Boolean(touched.name && nameProblem)}
          aria-describedby={touched.name && nameProblem ? 'full_name-error' : undefined}
          className={cn(inputCls, 'pr-11')}
        />
      </FieldShell>
      <FieldShell
        label={t('choosePassword')}
        htmlFor="password"
        icon={LockKeyhole}
        valid={!pwProblem}
        error={touched.password ? pwProblem : null}
        trailing={
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
            aria-label={show ? ta('fields.hidePassword') : ta('fields.showPassword')}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        }
      >
        <input
          id="password"
          name="password"
          type={show ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched((s) => ({ ...s, password: true }))}
          autoComplete="new-password"
          autoFocus={Boolean(peek.fullName)}
          aria-invalid={Boolean(touched.password && pwProblem)}
          aria-describedby={touched.password && pwProblem ? 'password-error' : undefined}
          className={cn(inputCls, !pwProblem ? 'pr-20' : 'pr-11')}
        />
      </FieldShell>
      {state?.error ? <ErrorLine code={state.error} /> : null}
      <button type="submit" disabled={pending} className={cn(primaryCls, 'mt-3')}>
        {pending ? <Spinner className="size-4" /> : null}
        {t('create', { account: peek.accountName })}
        {pending ? null : <ArrowRight className="size-4 transition-transform duration-200 group-hover/submit:translate-x-0.5" />}
      </button>
      <p className="mt-3 text-xs leading-relaxed text-fg-subtle">{t('expires', { date: format(new Date(peek.expiresAt), 'd MMMM', { locale }) })}</p>
    </form>
  )
}

function ErrorLine({ code }: { code: string }) {
  const t = useTranslations('invite.errors')
  const known = ['invitation_expired', 'invitation_accepted', 'invitation_not_found', 'invitation_email_mismatch', 'invitation_login_required', 'plan_limit_members', 'rate_limited', 'weak_password', 'missing_fields', 'oauth_unavailable']
  return (
    <p role="alert" className="mb-1 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
      {t(known.includes(code) ? code : 'generic')}
    </p>
  )
}
