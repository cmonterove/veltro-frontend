'use client'

import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { formatDistanceToNowStrict } from 'date-fns'
import { ArrowRight, CalendarDays, CheckCheck, HardDrive, Inbox, Info, KeyRound, MessagesSquare, Paperclip, PenLine, Reply, Send, ShieldAlert, Star, Tag, Users, type LucideIcon } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MAIL_CATEGORIES, type ApiMailbox, type ApiMailThreadSummary, type MailCategory } from '@/lib/api/correo'
import { useDateLocale } from '@/lib/dates'
import { useMailLabels, useMailThreads } from '@/lib/queries/mail'
import { cn } from '@/lib/utils'
import { unreadOf } from './inbox-tabs'
import type { MailNav } from './mail-list'
import { firstName, personName, shortWhen } from './mail-utils'

const CATEGORY_ICON: Record<MailCategory, LucideIcon> = { primary: Inbox, promotions: Tag, social: Users, updates: Info, forums: MessagesSquare }

/** Remitentes que no esperan respuesta (avisos, boletines, «no-reply»…). */
const AUTOMATED = /(^|[._+-])(no-?reply|do-?not-?reply|notifications?|notificaciones|avisos?|alerts?|alertas|info|mailer|newsletters?|news|bounces?|billing|facturacion|marketing|promo(ciones)?)([._+-]|$)/i
const isAutomated = (email: string) => AUTOMATED.test(email.split('@')[0] ?? '')

/** Quién mandó lo último de un hilo (el último que no soy yo; si solo estoy yo, yo). */
const lastSender = (t: ApiMailThreadSummary) => t.participants.filter((p) => !p.me).at(-1) ?? t.participants.at(-1) ?? null

const WEEK = 7 * 24 * 60 * 60 * 1000

/**
 * Sin un correo abierto: el correo de hoy, no una caja vacía. Arriba un saludo con lo que hay (por
 * leer, esperando respuesta, destacados); a la izquierda lo que falta leer en Recibidos (o Principal,
 * con pestañas) y, si no hay nada, lo último que llegó; a la derecha quién espera respuesta, las
 * pestañas (o carpetas) con lo suyo y atajos. Sale de lo mismo que ya cargó la lista: no pide nada más
 * a Gmail.
 */
export function MailHome({
  box,
  tabs,
  go,
  hrefFor,
  onCompose,
}: {
  box: ApiMailbox
  tabs: boolean
  go: MailNav
  hrefFor: (threadId: string) => string
  onCompose: () => void
}) {
  const t = useTranslations('mail.home')
  const tc = useTranslations('mail.categories')
  const format = useFormatter()
  const tf = useTranslations('mail.folders')
  const { profile } = useApp()
  const locale = useDateLocale()
  const labels = useMailLabels(box.id)
  const inbox = useMailThreads(box.id, 'INBOX', '', tabs ? 'primary' : null)
  const threads = inbox.data?.pages[0]?.items ?? []

  const unread = labels.data ? (tabs ? (labels.data.categories.find((c) => c.id === 'primary')?.unread ?? unreadOf(box, tabs)) : (labels.data.system.find((f) => f.id === 'INBOX')?.unread ?? 0)) : unreadOf(box, tabs)
  const starred = labels.data?.system.find((f) => f.id === 'STARRED')?.total ?? 0
  const toRead = threads.filter((x) => x.unread)
  const now = Date.now()
  const waiting = threads.filter((x) => {
    const who = lastSender(x)
    return !x.unread && !x.lastFromMe && who && !who.me && !isAutomated(who.email) && now - Date.parse(x.date) < WEEK
  })
  const where = tabs ? tc('primary') : tf('INBOX')

  const hour = new Date().getHours()
  const greeting = t(hour < 12 ? 'morning' : hour < 19 ? 'afternoon' : 'evening', { name: firstName({ name: profile.full_name, email: '' }) })
  const today = new Intl.DateTimeFormat(locale.code, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const summary = [
    unread ? t('summaryUnread', { count: unread, where }) : null,
    waiting.length ? t('summaryWaiting', { count: waiting.length }) : null,
    starred ? t('summaryStarred', { count: starred }) : null,
  ].filter(Boolean)

  return (
    <div className="flex min-h-0 w-full flex-col overflow-y-auto px-6 pb-6 pt-6 scrollbar-thin xl:px-8">
      <header className="flex shrink-0 flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-fg-subtle first-letter:uppercase">{today}</p>
          <h2 className="mt-1 text-balance text-[26px] font-bold leading-tight tracking-[-0.03em] text-fg">{greeting}</h2>
          <p className="mt-1 text-sm text-fg-muted">{summary.length ? summary.join(' · ') : t('upToDate', { where })}</p>
        </div>
        <Button variant="primary" onClick={onCompose}>
          <PenLine />
          {t('compose')}
        </Button>
      </header>

      <div className="mt-5 grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* por leer (o, al día, lo último que llegó) */}
        <section className="flex min-h-[18rem] flex-col rounded-2xl border border-line-soft bg-panel">
          <SectionTitle icon={toRead.length ? Inbox : CheckCheck} title={toRead.length ? t('toRead', { where }) : t('latest')} count={toRead.length ? unread : undefined} />
          {inbox.isLoading ? (
            <div className="flex flex-col gap-2 px-3 pb-3">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : (
            <>
              {!toRead.length ? (
                <p className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-success-soft/60 px-3 py-2 text-[13px] text-fg">
                  <CheckCheck className="size-4 shrink-0 text-success" />
                  {t('allRead', { where })}
                </p>
              ) : null}
              <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2 scrollbar-thin">
                {(toRead.length ? toRead.slice(0, 8) : threads.slice(0, 5)).map((x) => (
                  <ThreadLine key={x.id} thread={x} href={hrefFor(x.id)} when={shortWhen(x.date, locale, t('yesterday'))} />
                ))}
              </ul>
              {toRead.length && unread > Math.min(toRead.length, 8) ? (
                <p className="border-t border-line-soft px-4 py-2.5 text-xs text-fg-muted">{t('moreInList', { count: unread - Math.min(toRead.length, 8) })}</p>
              ) : null}
            </>
          )}
        </section>

        <div className="flex min-h-0 flex-col gap-4">
          {/* quién espera respuesta: lo último es de otra persona (no un aviso) y ya lo leíste */}
          <section className="rounded-2xl border border-line-soft bg-panel">
            <SectionTitle icon={Reply} title={t('waiting')} count={waiting.length || undefined} />
            {inbox.isLoading ? (
              <div className="px-3 pb-3">
                <Skeleton className="h-12" />
              </div>
            ) : waiting.length ? (
              <ul className="flex flex-col gap-0.5 px-2 pb-2">
                {waiting.slice(0, 3).map((x) => {
                  const who = lastSender(x)
                  return (
                    <li key={x.id}>
                      <Link href={hrefFor(x.id)} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 outline-none transition-colors hover:bg-hover focus-visible:bg-hover">
                        <Avatar name={who ? personName(who) : '?'} seed={who?.email} size={26} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-fg">{x.subject || t('noSubject')}</span>
                          <span className="block truncate text-2xs text-fg-subtle">
                            {who ? personName(who) : ''} · {formatDistanceToNowStrict(new Date(x.date), { locale, addSuffix: true })}
                          </span>
                        </span>
                        <Reply className="size-3.5 shrink-0 text-fg-subtle" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="px-4 pb-3.5 text-[13px] text-fg-muted">{t('nobodyWaiting')}</p>
            )}
          </section>

          {/* las pestañas (con lo suyo sin leer) o, sin pestañas, las carpetas */}
          <section className="rounded-2xl border border-line-soft bg-panel">
            <SectionTitle icon={tabs ? Tag : Inbox} title={tabs ? t('tabs') : t('folders')} />
            {tabs ? (
              // una fila por pestaña, para que entre el nombre entero («Notificaciones» no cabía en media columna)
              <ul className="flex flex-col gap-0.5 px-2 pb-2">
                {MAIL_CATEGORIES.filter((c) => c !== 'primary' && (labels.data ? (labels.data.categories.find((x) => x.id === c)?.total ?? 0) > 0 : c !== 'forums')).map((c) => {
                  const Icon = CATEGORY_ICON[c]
                  const n = labels.data?.categories.find((x) => x.id === c)?.unread ?? 0
                  return (
                    <li key={c}>
                      <button
                        type="button"
                        onClick={() => go({ f: null, q: null, h: null, cat: c })}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left outline-none transition-colors hover:bg-hover focus-visible:bg-hover"
                      >
                        <Icon className="size-4 shrink-0 text-fg-subtle" />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{tc(c)}</span>
                        <span className={cn('shrink-0 text-2xs tabular-nums', n ? 'font-semibold text-accent-ink' : 'text-fg-subtle')}>{n ? format.number(n, n >= 1000 ? { notation: 'compact', maximumFractionDigits: 1 } : {}) : t('caughtUp')}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 px-3 pb-3">
                {(
                  [
                    { id: 'STARRED', icon: Star, n: starred, value: starred ? t('starredShort', { count: starred }) : t('none') },
                    { id: 'SENT', icon: Send, n: 0, value: t('open') },
                    { id: 'SPAM', icon: ShieldAlert, n: labels.data?.system.find((f) => f.id === 'SPAM')?.unread ?? 0, value: '' },
                    ...(labels.data?.labels ?? []).filter((l) => l.unread).slice(0, 3).map((l) => ({ id: l.id, icon: Tag, n: l.unread, value: '' })),
                  ] as const
                ).map((f) => (
                  <Tile
                    key={f.id}
                    icon={f.icon}
                    label={f.id.startsWith('Label_') ? (labels.data?.labels.find((l) => l.id === f.id)?.name ?? '') : tf(f.id)}
                    value={f.value || (f.n ? t('unreadShort', { count: f.n }) : t('caughtUp'))}
                    strong={f.n > 0 && f.id !== 'STARRED'}
                    onClick={() => go({ f: f.id, q: null, h: null, cat: null })}
                  />
                ))}
              </div>
            )}
          </section>

          {/* atajos: búsquedas que se usan mucho, traer de Drive y los permisos */}
          <section aria-label={t('shortcuts')} className="flex flex-1 flex-col rounded-2xl border border-line-soft bg-panel pt-3">
            <div className="flex flex-wrap gap-1.5 px-3">
              {(
                [
                  ['has:attachment', Paperclip, 'attachments'],
                  ['is:unread', Inbox, 'unread'],
                  ['newer_than:7d', CalendarDays, 'week'],
                  ['is:starred', Star, 'starred'],
                ] as const
              ).map(([q, Icon, k]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => go({ q, f: null, h: null, cat: null })}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full bg-hover px-2.5 text-xs text-fg-muted transition-colors hover:bg-accent-soft hover:text-accent-ink"
                >
                  <Icon className="size-3.5" />
                  {t(`search.${k}`)}
                </button>
              ))}
            </div>
            <div className="mt-auto grid grid-cols-2 gap-1 p-2 pt-2.5">
              <ShortcutLink href="/vault?drive=1" icon={HardDrive} title={t('driveTitle')} body={t('driveBody')} />
              <ShortcutLink href="/settings/preferences#integrations" icon={KeyRound} title={t('permissionsTitle')} body={t('permissionsBody')} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ icon: Icon, title, count }: { icon: LucideIcon; title: string; count?: number }) {
  return (
    <h3 className="flex items-center gap-2 px-4 pb-1.5 pt-3 text-[13px] font-semibold text-fg">
      <Icon className="size-4 text-fg-subtle" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {count ? <span className="rounded-full bg-count px-1.5 text-[11px] font-semibold tabular-nums text-count-fg">{count}</span> : null}
    </h3>
  )
}

function ThreadLine({ thread: x, href, when }: { thread: ApiMailThreadSummary; href: string; when: string }) {
  const who = lastSender(x)
  return (
    <li>
      <Link href={href} className="flex items-start gap-3 rounded-xl px-2 py-2 outline-none transition-colors hover:bg-hover focus-visible:bg-hover">
        <Avatar name={who ? personName(who) : '?'} seed={who?.email} size={32} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-[13.5px]', x.unread ? 'font-semibold text-fg' : 'font-medium text-fg')}>{who ? personName(who) : ''}</span>
            <span className={cn('shrink-0 font-mono text-[11px] tabular-nums', x.unread ? 'font-semibold text-count' : 'text-fg-subtle')}>{when}</span>
          </span>
          <span className={cn('block truncate text-[13px]', x.unread ? 'font-medium text-fg' : 'text-fg')}>{x.subject}</span>
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{x.snippet}</span>
            {x.hasAttachments ? <Paperclip className="size-3 shrink-0 text-fg-subtle" /> : null}
            {x.starred ? <Star className="size-3 shrink-0 fill-[oklch(0.8_0.15_85)] text-[oklch(0.72_0.15_75)]" /> : null}
          </span>
        </span>
      </Link>
    </li>
  )
}

function Tile({ icon: Icon, label, value, strong, onClick }: { icon: LucideIcon; label: string; value: string; strong?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 items-center gap-2.5 rounded-xl bg-hover/60 px-3 py-2 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent-mid/40"
    >
      <Icon className="size-4 shrink-0 text-fg-subtle" />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-fg">{label}</span>
        <span className={cn('block truncate text-2xs', strong ? 'font-semibold text-accent-ink' : 'text-fg-subtle')}>{value}</span>
      </span>
    </button>
  )
}

function ShortcutLink({ href, icon: Icon, title, body }: { href: string; icon: LucideIcon; title: string; body: string }) {
  return (
    <Link href={href} title={body} className="group flex min-w-0 items-center gap-2.5 rounded-xl px-2 py-2 outline-none transition-colors hover:bg-hover focus-visible:bg-hover">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-fg">{title}</span>
      <ArrowRight className="size-3.5 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
