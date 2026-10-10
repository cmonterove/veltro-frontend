'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Check, Diamond, HelpCircle, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

// Línea de tiempo de la historia (ms). Paso final = estado "cerrado".
const STEPS = [0, 900, 1900, 2900, 4200, 5000, 6400]
const LOOP_MS = 9600
const FINAL = STEPS.length - 1

function useStoryStep() {
  const reduced = useReducedMotion()
  const [step, setStep] = useState(reduced ? FINAL : 0)
  useEffect(() => {
    if (reduced) {
      setStep(FINAL)
      return
    }
    let timers: ReturnType<typeof setTimeout>[] = []
    const run = () => {
      timers.forEach(clearTimeout)
      timers = STEPS.map((at, i) => setTimeout(() => setStep(i), at))
      timers.push(setTimeout(run, LOOP_MS))
    }
    run()
    return () => timers.forEach(clearTimeout)
  }, [reduced])
  return step
}

const people = [
  { i: 'M', c: 'var(--ws-mandarina)', on: 'var(--ws-mandarina-on)' },
  { i: 'J', c: 'var(--ws-blue)', on: 'var(--ws-blue-on)' },
  { i: 'L', c: 'var(--ws-teal)', on: 'var(--ws-teal-on)' },
  { i: 'C', c: 'var(--ws-violet)', on: 'var(--ws-violet-on)' },
]

export function AuthStory() {
  const t = useTranslations('auth.story')
  const tk = useTranslations('meeting.kind')
  const step = useStoryStep()
  const closed = step >= 5
  const phase = step >= 5 ? 2 : step >= 1 ? 1 : 0

  return (
    <aside className="relative hidden overflow-hidden p-3 lg:block">
      <div className="relative flex h-full flex-col overflow-hidden rounded-[28px] bg-accent px-12 pb-10 pt-14 text-accent-fg xl:px-16">
        {/* textura: el isotipo enorme */}
        <svg viewBox="0 0 64 64" className="pointer-events-none absolute -bottom-40 -right-32 size-[720px] opacity-[0.16]" aria-hidden>
          <path d="M15 15 L32 49" fill="none" stroke="var(--logo-a)" strokeWidth="12" strokeLinecap="round" />
          <path d="M49 15 L32 49" fill="none" stroke="var(--accent)" strokeWidth="19" strokeLinecap="round" />
          <path d="M49 15 L32 49" fill="none" stroke="white" strokeWidth="12" strokeLinecap="round" />
        </svg>

        <div className="relative max-w-[30rem]">
          <p className="font-brand text-[40px] font-semibold leading-[1.05] tracking-[-0.04em] xl:text-[46px]">{t('tagline')}</p>
          <p className="mt-4 max-w-[26rem] text-[15px] leading-relaxed text-accent-fg/75">{t('body')}</p>
        </div>

        {/* escena: alturas fijas para que nada empuje el resto de la pantalla */}
        <div className="relative mt-10 flex flex-1 items-center">
          <LayoutGroup>
            <div className="grid w-full max-w-[34rem] gap-4">
              <div className="h-[276px] rounded-2xl bg-panel p-5 text-fg shadow-lift">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-highlight px-2.5 py-1 text-xs font-semibold text-highlight-ink">
                    <motion.span
                      className="size-2 rounded-full bg-mandarina"
                      animate={closed ? { opacity: 1 } : { opacity: [1, 0.35, 1] }}
                      transition={closed ? { duration: 0.2 } : { duration: 1.6, repeat: Infinity }}
                    />
                    {closed ? t('closedBadge') : t('live')}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t('meeting')}</span>
                  <span className="flex -space-x-1.5">
                    {people.map((p) => (
                      <span key={p.i} className="flex size-6 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-panel" style={{ background: p.c, color: p.on }}>
                        {p.i}
                      </span>
                    ))}
                  </span>
                </div>

                <div className="mt-4 flex h-[124px] flex-col gap-1.5 overflow-hidden">
                  <AnimatePresence initial={false}>
                    {step >= 1 ? (
                      <Line key="decision" kindClass="bg-k-decision-soft text-k-decision" icon={<Diamond className="size-3" strokeWidth={2.4} />} kind={tk('decision')}>
                        {t('decision')}
                      </Line>
                    ) : null}
                    {step >= 2 && closed ? <div key="action-slot" className="h-7 shrink-0" aria-hidden /> : null}
                    {step >= 2 && !closed ? (
                      <Line key="action" layoutId="story-action" kindClass="bg-k-action-soft text-k-action" icon={<ArrowRight className="size-3" strokeWidth={2.4} />} kind={tk('action')}>
                        <span>{t('action')}</span>
                        <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-k-action-soft px-1.5 py-0.5 align-middle text-[11px] font-medium text-k-action">
                          <span className="flex size-3.5 items-center justify-center rounded-full bg-[var(--ws-mandarina)] text-[8px] font-bold text-[var(--ws-mandarina-on)]">P</span>
                          {t('owner')}
                        </span>
                        <span className="ml-1 rounded-full bg-hover px-1.5 py-0.5 align-middle text-[11px] text-fg-muted">{t('due')}</span>
                      </Line>
                    ) : null}
                    {step >= 3 ? (
                      <Line key="question" kindClass="bg-k-question-soft text-k-question" icon={<HelpCircle className="size-3" strokeWidth={2.4} />} kind={tk('question')}>
                        {t('question')}
                      </Line>
                    ) : null}
                  </AnimatePresence>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-4">
                  <AnimatePresence mode="wait" initial={false}>
                    {closed ? (
                      <motion.span key="summary" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
                        <Check className="size-3.5 text-accent" />
                        {t('summary')}
                      </motion.span>
                    ) : (
                      <motion.span key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-fg-subtle">
                        {t('capturing')}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <motion.span
                    animate={step === 4 ? { scale: [1, 0.94, 1] } : { scale: 1 }}
                    transition={{ duration: 0.5 }}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors duration-300',
                      closed ? 'bg-hover text-fg-muted' : step >= 4 ? 'bg-accent text-accent-fg' : 'bg-accent/90 text-accent-fg',
                    )}
                  >
                    <Sparkles className="size-3.5" />
                    {closed ? t('closed') : t('close')}
                  </motion.span>
                </div>
              </div>

              {/* resultado */}
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
                <div className="h-[104px] rounded-2xl bg-panel/95 p-4 text-fg shadow-lift">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{t('tasks')}</p>
                  <AnimatePresence>
                    {closed ? (
                      <motion.div layoutId="story-action" className="mt-2.5 flex items-center gap-2 rounded-lg bg-k-action-soft px-2.5 py-2">
                        <svg viewBox="0 0 14 14" className="size-3.5 shrink-0 text-st-todo" aria-hidden>
                          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                        <span className="font-mono text-[11px] text-fg-muted">TM-5</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{t('action')}</span>
                        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="text-[11px] font-medium text-k-action">
                          {t('created')}
                        </motion.span>
                      </motion.div>
                    ) : (
                      <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2.5 text-xs text-fg-subtle">
                        {t('tasksEmpty')}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
                <div className="h-[104px] rounded-2xl bg-panel/95 p-4 text-fg shadow-lift">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{t('memory')}</p>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={closed ? 'saved' : 'none'}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: closed ? 0.25 : 0 }}
                      className={cn('mt-2.5 flex items-center gap-1.5 text-sm', closed ? 'font-medium text-k-decision' : 'text-xs text-fg-subtle')}
                    >
                      {closed ? <Diamond className="size-3.5" strokeWidth={2.4} /> : null}
                      {closed ? t('decisionSaved') : t('memoryEmpty')}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </LayoutGroup>
        </div>

        {/* pasos */}
        <ol className="relative mt-10 flex gap-6 text-sm">
          {(['meet', 'decide', 'advance'] as const).map((s, i) => (
            <li key={s} className={cn('flex items-center gap-2 transition-opacity duration-300', i === phase ? 'opacity-100' : 'opacity-50')}>
              <span className="relative h-1 w-8 overflow-hidden rounded-full bg-accent-fg/25">
                {i === phase ? <motion.span layoutId="story-step" className="absolute inset-0 rounded-full bg-accent-fg" /> : null}
              </span>
              {t(`steps.${s}`)}
            </li>
          ))}
        </ol>
      </div>
    </aside>
  )
}

function Line({
  kind,
  kindClass,
  icon,
  layoutId,
  children,
}: {
  kind: string
  kindClass: string
  icon: React.ReactNode
  layoutId?: string
  children: React.ReactNode
}) {
  return (
    <motion.div
      layoutId={layoutId}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      className="flex h-7 shrink-0 items-center gap-2.5 rounded-lg px-1"
    >
      <span className={cn('inline-flex h-5 w-[78px] shrink-0 items-center justify-center gap-1 rounded-md text-[11px] font-semibold', kindClass)}>
        {icon}
        {kind}
      </span>
      <span className="flex min-w-0 items-center overflow-hidden whitespace-nowrap text-sm text-fg">{children}</span>
    </motion.div>
  )
}
