'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Inbox, ListPlus, Paperclip, ShieldCheck, Star } from 'lucide-react'
import { GoogleConnectButton } from '@/components/calendar/connect-calendar'
import type { ApiMailboxes } from '@/lib/api/correo'
import { cn } from '@/lib/utils'
import { MailConnectGuide, type GuidePurpose } from './mail-connect-guide'

/**
 * Todavía sin un buzón que se pueda leer. A la izquierda, qué se gana y qué permiso pide (con el botón
 * de Google); a la derecha, cómo se va a ver: unas filas de correo y uno vuelto tarea. Si la cuenta ya
 * estaba conectada para «Avisar por correo», el botón le suma la lectura.
 */
export function MailConnect({ boxes }: { boxes: ApiMailboxes | undefined }) {
  const t = useTranslations('mail.connect')
  const sendOnly = (boxes?.items ?? []).filter((b) => b.provider === 'google' && !b.canRead)
  const configured = boxes?.googleConfigured ?? true

  return (
    <div className="flex h-full min-h-0">
      <main className="flex min-h-0 min-w-0 flex-1 overflow-y-auto scrollbar-thin md:rounded-[20px] md:bg-canvas md:shadow-sheet">
        <div className="mx-auto grid w-full max-w-[1120px] items-center gap-x-14 gap-y-10 px-6 py-10 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:py-14">
          <section className="min-w-0">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
              <Inbox className="size-6" />
            </span>
            <h1 className="mt-5 text-balance text-[28px] font-bold leading-[1.08] tracking-[-0.03em] text-fg sm:text-[34px]">{t('title')}</h1>
            <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-fg-muted">{t('lead')}</p>
            <ul className="mt-6 flex flex-col gap-3">
              {(['read', 'task', 'private'] as const).map((k) => {
                const Icon = k === 'read' ? Inbox : k === 'task' ? ListPlus : ShieldCheck
                return (
                  <li key={k} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-hover text-fg-muted">
                      <Icon className="size-4" />
                    </span>
                    <span className="text-[14px] leading-snug">
                      <span className="block font-semibold text-fg">{t(`${k}Title`)}</span>
                      <span className="block text-fg-muted">{t(`${k}Body`)}</span>
                    </span>
                  </li>
                )
              })}
            </ul>

            <div className="mt-8 flex flex-col items-start gap-3">
              {configured ? (
                sendOnly.length ? (
                  <>
                    <p className="text-sm text-fg">{t('sendOnly', { emails: sendOnly.map((b) => b.email).join(', ') })}</p>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <ConnectMailButton label={t('grantRead')} />
                      <OutlookSoon />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <ConnectMailButton label={t('button')} />
                    <OutlookSoon />
                  </div>
                )
              ) : (
                <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-fg">{t('notConfigured')}</p>
              )}
              <p className="max-w-[58ch] text-xs leading-relaxed text-fg-subtle">{t('permissions')}</p>
            </div>
          </section>

          <InboxPreview />
        </div>
      </main>
    </div>
  )
}

/** Outlook (Microsoft 365): todavía no; se muestra para que se sepa que viene. */
export function OutlookSoon({ className }: { className?: string }) {
  const t = useTranslations('mail.connect')
  return (
    <span
      aria-disabled
      title={t('outlookSoon')}
      className={cn('inline-flex h-10 shrink-0 cursor-default select-none items-center gap-2 rounded-full border border-dashed border-line-strong pl-3.5 pr-2 text-sm text-fg-muted', className)}
    >
      <MicrosoftMark className="size-3.5 opacity-70" />
      Outlook
      <span className="rounded-full bg-hover px-2 py-0.5 text-[11px] font-medium text-fg-subtle">{t('soon')}</span>
    </span>
  )
}

/** Los cuatro cuadros de Microsoft, en chico. */
export function MicrosoftMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('grid shrink-0 grid-cols-2 gap-px', className)}>
      <span className="bg-[#f25022]" />
      <span className="bg-[#7fba00]" />
      <span className="bg-[#00a4ef]" />
      <span className="bg-[#ffb900]" />
    </span>
  )
}

/** Cómo se va a ver: tres correos (uno sin leer, uno con estrella y adjunto) y uno que ya es tarea. */
function InboxPreview() {
  const t = useTranslations('mail.connect.preview')
  const rows = [
    { who: t('row1Who'), subject: t('row1Subject'), snippet: t('row1Snippet'), when: '10:42', unread: true, tone: 'ws-blue' },
    { who: t('row2Who'), subject: t('row2Subject'), snippet: t('row2Snippet'), when: '09:15', star: true, clip: true, tone: 'ws-teal' },
    { who: t('row3Who'), subject: t('row3Subject'), snippet: t('row3Snippet'), when: t('yesterday'), task: true, tone: 'ws-mandarina' },
  ]
  return (
    <div aria-hidden className="relative min-w-0 select-none">
      <div className="rounded-[22px] bg-panel p-2 shadow-lift ring-1 ring-line-soft">
        <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
          <span className="text-[15px] font-bold tracking-[-0.02em] text-fg">{t('inbox')}</span>
          <span className="rounded-full bg-count px-1.5 text-[11px] font-semibold tabular-nums text-count-fg">3</span>
        </div>
        <ul className="flex flex-col gap-1">
          {rows.map((r, i) => (
            <li key={i} className={cn('flex items-start gap-3 rounded-[16px] px-3 py-2.5', i === 0 ? 'bg-accent-soft/70' : 'bg-transparent')}>
              <span className={cn(r.tone, 'flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold')} style={{ background: 'var(--ws-color)', color: 'var(--ws-on)' }}>
                {r.who.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={cn('min-w-0 flex-1 truncate text-[13.5px]', r.unread ? 'font-semibold text-fg' : 'font-medium text-fg')}>{r.who}</span>
                  <span className={cn('shrink-0 font-mono text-[11px]', r.unread ? 'font-semibold text-count' : 'text-fg-subtle')}>{r.when}</span>
                </span>
                <span className={cn('block truncate text-[13px]', r.unread ? 'font-semibold text-fg' : 'text-fg')}>{r.subject}</span>
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{r.snippet}</span>
                  {r.clip ? <Paperclip className="size-3 shrink-0 text-fg-subtle" /> : null}
                  {r.star ? <Star className="size-3 shrink-0 fill-[oklch(0.8_0.15_85)] text-[oklch(0.72_0.15_75)]" /> : null}
                </span>
                {r.task ? (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-success-soft px-1.5 py-0.5 text-[11px] font-medium text-fg">
                    <ListPlus className="size-3 text-success" />
                    {t('becameTask')}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/**
 * El botón de Google para conectar el correo. Antes de ir a Google abre la guía con los pasos (la
 * advertencia de «app no verificada» asusta si no se sabe que va a salir). Sin `returnTo`, al volver
 * de Google se queda donde estaba (el hilo abierto o el correo a medio escribir).
 */
export function ConnectMailButton({
  label,
  size,
  className,
  returnTo,
  purpose,
}: {
  label: string
  size?: 'sm' | 'md'
  className?: string
  returnTo?: string
  /** `driveFiles`: sumar el permiso de bajar archivos de Drive (para la Bóveda) */
  purpose?: GuidePurpose
}) {
  const [guide, setGuide] = useState(false)
  return (
    <>
      <GoogleConnectButton
        kind="mail"
        returnTo={returnTo ?? '/mail'}
        label={label}
        size={size}
        className={className}
        onClick={(e) => {
          e.preventDefault()
          setGuide(true)
        }}
      />
      <MailConnectGuide open={guide} onOpenChange={setGuide} returnTo={returnTo} purpose={purpose} />
    </>
  )
}

/** Volver a conectar (Google retiró el permiso, o la cuenta estaba solo para avisar, o falta contactos o Drive). */
export function MailReconnect({ className, label }: { className?: string; label?: string }) {
  const t = useTranslations('mail.connect')
  return <ConnectMailButton size="sm" label={label ?? t('reconnect')} className={className} />
}
