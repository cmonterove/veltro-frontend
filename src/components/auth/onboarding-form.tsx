'use client'

import { useActionState, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { ArrowRight, Building2, Check, FileText, LayoutGrid } from 'lucide-react'
import { completeOnboarding } from '@/app/onboarding/actions'
import { Logo } from '@/components/app/logo'
import { LocaleSelect } from '@/components/app/locale-select'
import { WorkspaceMark, monogramOf } from '@/components/app/marks'
import { Spinner } from '@/components/ui/spinner'
import { WORKSPACE_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { FieldShell, inputCls } from './auth-screen'

const EASE = [0.16, 1, 0.3, 1] as const

/**
 * Primer paso después de crear la cuenta: el nombre de la cuenta y el primer espacio. A la derecha,
 * en vivo, cómo va a quedar (la cuenta, el espacio con su color y lo que trae para empezar).
 */
export function OnboardingScreen({ firstName, demo }: { firstName: string; demo?: React.ReactNode }) {
  const t = useTranslations('onboarding')
  const te = useTranslations('errors')
  const ta = useTranslations('auth')
  const tc = useTranslations('settings.teams.colors')
  const [state, action, pending] = useActionState(completeOnboarding, undefined)
  const [account, setAccount] = useState('')
  const [wsName, setWsName] = useState('')
  const [color, setColor] = useState<string>('violet')
  const [timezone, setTimezone] = useState('')
  const mark = { name: wsName.trim() || 'V', color }

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [])

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.32, ease: EASE }}>
      <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="flex min-h-dvh flex-col px-6 py-5 sm:px-10 short:py-4">
          <header className="flex items-center justify-between">
            <Logo />
            <LocaleSelect />
          </header>

          <main className="flex flex-1 items-center justify-center py-8 short:py-4">
            <div className="w-full max-w-[400px]">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-highlight px-3 py-1 text-xs font-medium text-accent-ink">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                {t('eyebrow')}
              </p>
              <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-fg short:text-2xl">{t('title', { name: firstName })}</h1>
              <p className="mt-2 text-base leading-relaxed text-fg-muted short:text-sm">{t('subtitle')}</p>

              <form action={action} className="mt-8 short:mt-5">
                <input type="hidden" name="icon" value={monogramOf(mark)} />
                <input type="hidden" name="color" value={color} />
                <input type="hidden" name="timezone" value={timezone} />

                <FieldShell label={t('accountLabel')} htmlFor="account_name" icon={Building2} valid={account.trim().length >= 2}>
                  <input
                    id="account_name"
                    name="account_name"
                    required
                    maxLength={80}
                    autoFocus
                    autoComplete="organization"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    placeholder={t('accountPlaceholder')}
                    className={inputCls}
                  />
                </FieldShell>
                <p className="-mt-2 mb-4 text-xs leading-relaxed text-fg-subtle short:mb-3">{t('accountHint')}</p>

                <div className="group/field pb-4 short:pb-3">
                  <label htmlFor="workspace_name" className="mb-1.5 block text-sm font-medium text-fg transition-colors group-has-[input:focus]/field:text-accent-ink short:mb-1">
                    {t('workspaceLabel')}
                  </label>
                  <div className="relative">
                    {/* la marca del espacio, en vivo, adentro del campo */}
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                      <WorkspaceMark ws={mark} size={26} />
                    </span>
                    <input
                      id="workspace_name"
                      name="workspace_name"
                      required
                      maxLength={80}
                      value={wsName}
                      onChange={(e) => setWsName(e.target.value)}
                      placeholder={t('workspacePlaceholder')}
                      className={cn(inputCls, 'pl-12')}
                    />
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-fg-subtle">{t('workspaceHint')}</p>
                </div>

                <fieldset className="pb-2">
                  <legend className="mb-2 text-sm font-medium text-fg">{t('colorLabel')}</legend>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('colorLabel')}>
                    {WORKSPACE_COLORS.map((c) => {
                      const on = color === c
                      return (
                        <button
                          key={c}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          aria-label={tc(c)}
                          onClick={() => setColor(c)}
                          className={cn(
                            `ws-${c}`,
                            'flex size-8 items-center justify-center rounded-full outline-none ring-offset-2 ring-offset-canvas transition-[box-shadow,transform] duration-150 hover:scale-105 focus-visible:ring-2 focus-visible:ring-accent-mid',
                            on && 'ring-2 ring-fg/70',
                          )}
                          style={{ background: 'var(--ws-color)', color: 'var(--ws-on)' }}
                        >
                          {on ? <Check className="size-4" strokeWidth={3} /> : null}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>

                <AnimatePresence initial={false}>
                  {state?.error ? (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
                      role="alert"
                    >
                      {te(state.error)}
                    </motion.p>
                  ) : null}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={pending}
                  className="group/submit mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-semibold text-accent-fg shadow-[0_8px_24px_-10px_var(--accent)] transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.99] disabled:opacity-80 short:mt-4 short:h-11"
                >
                  {pending ? <Spinner className="size-4" /> : null}
                  {t('submit')}
                  {pending ? null : <ArrowRight className="size-4 transition-transform duration-200 group-hover/submit:translate-x-0.5" />}
                </button>
              </form>

              {demo ? (
                <div className="mt-6 flex items-center gap-3 text-xs text-fg-subtle">
                  <span className="h-px flex-1 bg-line" />
                  {demo}
                  <span className="h-px flex-1 bg-line" />
                </div>
              ) : null}
            </div>
          </main>

          <footer className="text-xs text-fg-subtle">{ta('footer', { year: new Date().getFullYear() })}</footer>
        </section>

        <Preview account={account.trim()} workspace={wsName.trim()} color={color} firstName={firstName} />
      </div>
    </MotionConfig>
  )
}

/** A la derecha: así va a quedar, en vivo. La cuenta arriba, el espacio con su marca y lo que trae para empezar. */
function Preview({ account, workspace, color, firstName }: { account: string; workspace: string; color: string; firstName: string }) {
  const t = useTranslations('onboarding.preview')
  const ts = useTranslations('seed')
  const tasks = [ts('task1'), ts('task2'), ts('task3')]
  const accountName = account || t('accountFallback')
  const wsName = workspace || t('workspaceFallback')
  const mark = { name: workspace || 'V', color }
  return (
    <aside className="relative hidden overflow-hidden p-3 lg:sticky lg:top-0 lg:block lg:h-dvh">
      <div className="relative flex h-full flex-col overflow-hidden rounded-[28px] bg-ciruela px-12 pb-10 pt-14 text-white xl:px-16 short:pb-7 short:pt-10">
        {/* trazos de fondo, como en la pantalla de entrar */}
        <svg aria-hidden viewBox="0 0 600 600" className="pointer-events-none absolute -bottom-40 -right-32 size-[620px] opacity-[0.08]">
          <path d="M80 360 L240 520 L560 80" fill="none" stroke="white" strokeWidth="90" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <h2 className="max-w-md text-[34px] font-semibold leading-[1.1] tracking-[-0.02em] short:text-[28px]">{t('title')}</h2>
        <p className="mt-3 max-w-md text-base leading-relaxed text-white/75">{t('subtitle')}</p>

        <div className="relative mt-10 flex flex-1 items-start gap-4 short:mt-6">
          {/* la barra lateral: la cuenta y el espacio */}
          <div className="w-[180px] shrink-0 rounded-2xl bg-white/[0.08] p-3 xl:w-[210px] ring-1 ring-white/10 backdrop-blur-sm">
            <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.10] p-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-white/20 text-sm font-semibold">{accountName[0]?.toUpperCase()}</span>
              <span className="min-w-0">
                <motion.span key={accountName} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="block truncate text-sm font-semibold">
                  {accountName}
                </motion.span>
                <span className="block text-2xs text-white/60">{t('oneWorkspace')}</span>
              </span>
            </div>
            <p className="mb-1.5 mt-4 px-1 text-2xs font-semibold uppercase tracking-[0.08em] text-white/50">{t('workspaces')}</p>
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.14] px-1.5 py-1.5">
              <WorkspaceMark ws={mark} size={22} />
              <span className="truncate text-sm font-medium">{wsName}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 px-1.5 py-1.5 text-sm text-white/40">
              <span className="size-[22px] rounded-md border border-dashed border-white/25" />
              {t('more')}
            </div>
          </div>

          {/* el espacio por dentro: lo que trae para arrancar */}
          <div className="min-w-0 flex-1 rounded-2xl bg-canvas p-4 text-fg shadow-[0_24px_60px_-20px_oklch(0.15_0.05_310/0.6)]">
            <div className="flex items-center gap-2.5">
              <WorkspaceMark ws={mark} size={28} />
              <span className="min-w-0 truncate text-[15px] font-semibold">{wsName}</span>
            </div>
            <div className="mt-3 flex gap-3 border-b border-line text-xs text-fg-muted">
              <span className="-mb-px border-b-2 border-accent pb-2 font-medium text-fg">{t('tabSummary')}</span>
              <span className="pb-2">{t('tabTasks')}</span>
              <span className="pb-2">{t('tabDocs')}</span>
              <span className="pb-2">{t('tabMeetings')}</span>
            </div>
            <p className="mb-2 mt-4 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{t('ready')}</p>
            <ul className="flex flex-col gap-1.5">
              {tasks.map((x, i) => (
                <motion.li
                  key={x}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.08 }}
                  className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-2 text-sm"
                >
                  <span className="size-3.5 shrink-0 rounded-full border-[1.5px] border-fg-subtle" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{x}</span>
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent-ink">{firstName[0]?.toUpperCase()}</span>
                </motion.li>
              ))}
              <li className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-2 text-sm">
                <FileText className="size-3.5 shrink-0 text-fg-subtle" />
                <span className="min-w-0 flex-1 truncate">{ts('welcomeTitle')}</span>
                <LayoutGrid className="size-3.5 text-fg-subtle" />
              </li>
            </ul>
          </div>
        </div>
      </div>
    </aside>
  )
}
