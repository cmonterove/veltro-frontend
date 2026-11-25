'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, ChevronDown, Copy, MousePointer2, ShieldCheck, TriangleAlert, UserRound } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { GoogleG } from '@/components/calendar/connect-calendar'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { connectMailHref } from '@/lib/api/correo'
import { useCopy } from '@/lib/clipboard'
import { useMailboxes } from '@/lib/queries/mail'
import { track } from '@/lib/telemetry'
import { cn } from '@/lib/utils'

/**
 * Antes de ir a Google: qué va a aparecer y dónde tocar, en tres dibujos de sus pantallas (elegir la
 * cuenta, la advertencia de «Google no verificó esta app» y las casillas de permisos). Mientras
 * Google no verifique Veltro, la advertencia sale y asusta: así la persona sabe que es normal y cómo
 * seguir. Al pie, para quien administra el Google Workspace de su empresa, cómo quitarla para todos.
 * Los dibujos imitan las pantallas de Google en claro (como el correo, también en el tema oscuro).
 */
export function MailConnectGuide({ open, onOpenChange, returnTo }: { open: boolean; onOpenChange: (o: boolean) => void; returnTo?: string }) {
  const t = useTranslations('mail.guide')
  const [admin, setAdmin] = useState(false)
  const adminRef = useRef<HTMLDivElement>(null)
  // el foco va a «Ir a Google» (siempre a la vista, al pie): si fuera al primer botón de la guía,
  // en pantallas bajas se abriría ya desplazada hasta lo del administrador
  const goRef = useRef<HTMLButtonElement>(null)
  const clientId = useMailboxes().data?.googleClientId ?? null
  const copy = useCopy()
  // al abrir lo del administrador, que se vea entero (queda más abajo de lo que entra en pantalla)
  useEffect(() => {
    if (admin) adminRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [admin])
  const go = () => {
    track('feature.mail_connect')
    window.location.href = connectMailHref(returnTo ?? here())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent initialFocus={goRef} className="flex max-h-[calc(100dvh-12vh-1rem)] flex-col sm:max-w-[980px]">
        <DialogHeader title={t('title')} description={t('description')} />
        <DialogBody className="min-h-0 flex-1 overflow-y-auto pb-3 scrollbar-thin">
          <ol className="grid gap-x-4 gap-y-6 md:grid-cols-3">
            <Step n={1} title={t('step1Title')} body={t('step1Body')}>
              <AccountChooser />
            </Step>
            <Step n={2} title={t('step2Title')} body={t('step2Body')}>
              <Unverified />
            </Step>
            <Step n={3} title={t('step3Title')} body={t('step3Body')}>
              <Consent />
            </Step>
          </ol>

          <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-hover/70 px-4 py-2.5 text-[13px] leading-relaxed text-fg-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
            <span>{t('why')}</span>
          </p>

          <div ref={adminRef} className="mt-2.5 scroll-mb-2 rounded-xl ring-1 ring-inset ring-line-soft">
            <button
              type="button"
              onClick={() => setAdmin((v) => !v)}
              aria-expanded={admin}
              className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-left text-[13px] font-semibold text-fg outline-none transition-colors hover:bg-hover/50 focus-visible:ring-2 focus-visible:ring-accent-mid"
            >
              <span className="flex-1">{t('adminTitle')}</span>
              <ChevronDown className={cn('size-4 text-fg-muted transition-transform duration-200', admin && 'rotate-180')} />
            </button>
            {admin ? (
              <div className="px-4 pb-4 text-[13px] leading-relaxed text-fg-muted">
                <p>{t('adminBody')}</p>
                <ol className="mt-2.5 flex flex-col gap-1.5">
                  {(['admin1', 'admin2', 'admin3', 'admin4'] as const).map((k, i) => (
                    <li key={k} className="flex items-start gap-2.5">
                      <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-hover text-[11px] font-semibold tabular-nums text-fg-muted">{i + 1}</span>
                      <span className="min-w-0 text-fg">
                        {t(k)}
                        {k === 'admin4' && clientId ? (
                          <span className="mt-1.5 flex max-w-full items-center gap-1 rounded-lg bg-hover/70 py-1 pl-2.5 pr-1 text-xs">
                            <span className="shrink-0 text-fg-muted">{t('clientId')}</span>
                            <code className="min-w-0 truncate font-mono text-[11.5px] text-fg">{clientId}</code>
                            <button
                              type="button"
                              onClick={() => copy(clientId, t('clientIdCopied'))}
                              aria-label={t('copyClientId')}
                              title={t('copyClientId')}
                              className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid"
                            >
                              <Copy className="size-3.5" />
                            </button>
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-2.5 text-xs text-fg-subtle">{t('adminNote')}</p>
              </div>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter className="border-t border-line-soft pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button ref={goRef} variant="primary" onClick={go}>
            <GoogleG className="size-4 rounded-full bg-[#ffffff] p-px" />
            {t('continue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Step({ n, title, body, children }: { n: number; title: string; body: string; children: React.ReactNode }) {
  return (
    <li className="flex min-w-0 flex-col">
      <div className="flex items-start gap-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold tabular-nums text-accent-fg">{n}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug text-fg">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{body}</p>
        </div>
      </div>
      <div className="mt-2.5 flex-1">{children}</div>
    </li>
  )
}

/** Dónde está ahora (sin el aviso de la vuelta anterior): a dónde volver de Google si no se dijo otra cosa. */
function here() {
  const u = new URL(window.location.href)
  u.searchParams.delete('mail')
  const path = `${u.pathname}${u.search}`
  return path.length <= 200 ? path : u.pathname
}

// ── Los dibujos de las pantallas de Google ──────────────────────────────────

/** El marco de una pantalla de Google: blanco, con su «G» y «Acceder con Google». */
function GoogleScreen({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTranslations('mail.guide.screens')
  return (
    <figure aria-label={label} className="flex h-full select-none flex-col overflow-hidden rounded-xl bg-[#ffffff] text-[#1f1f1f] shadow-card ring-1 ring-[#dadce0]">
      <div className="flex items-center gap-1.5 border-b border-[#e8eaed] px-3 py-2 text-[10.5px] text-[#5f6368]">
        <GoogleG className="size-3.5" />
        {t('signIn')}
      </div>
      <div className="flex flex-1 flex-col p-3">{children}</div>
    </figure>
  )
}

/** Lo que hay que tocar: un borde de color y el puntero. */
function Tap({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('relative inline-flex rounded-md ring-2 ring-[oklch(0.74_0.17_55)] ring-offset-2 ring-offset-[#ffffff]', className)}>
      {children}
      <MousePointer2 aria-hidden className="absolute -bottom-3 -right-2.5 size-4 rotate-[-8deg] fill-[#1f1f1f] text-[#ffffff] drop-shadow-sm" />
    </span>
  )
}

const Bar = ({ w }: { w: string }) => <span className="block h-1.5 rounded-full bg-[#e8eaed]" style={{ width: w }} />

function AccountChooser() {
  const t = useTranslations('mail.guide.screens')
  const { profile, user } = useApp()
  return (
    <GoogleScreen label={t('chooseLabel')}>
      <p className="text-[13px] font-medium">{t('choose')}</p>
      <p className="mt-0.5 text-[10.5px] text-[#5f6368]">{t('chooseSub')}</p>
      <ul className="mt-3 rounded-lg border border-[#e8eaed]">
        <li className="p-1.5">
          <Tap className="w-full">
            <span className="flex w-full items-center gap-2 rounded-md px-1.5 py-1">
              <Avatar name={profile.full_name} seed={user.email} size={22} />
              <span className="min-w-0 text-left">
                <span className="block truncate text-[11px] font-medium">{profile.full_name}</span>
                <span className="block truncate text-[10px] text-[#5f6368]">{user.email}</span>
              </span>
            </span>
          </Tap>
        </li>
        <li className="flex items-center gap-2 border-t border-[#e8eaed] px-3 py-2 text-[10.5px] text-[#5f6368]">
          <UserRound className="size-4" />
          {t('otherAccount')}
        </li>
      </ul>
      <div aria-hidden className="mt-auto flex flex-col gap-1 pt-3">
        <Bar w="100%" />
        <Bar w="94%" />
        <Bar w="58%" />
      </div>
    </GoogleScreen>
  )
}

function Unverified() {
  const t = useTranslations('mail.guide.screens')
  return (
    <GoogleScreen label={t('unverifiedLabel')}>
      <TriangleAlert className="size-5 text-[#d93025]" />
      <p className="mt-1.5 text-[13px] font-medium">{t('unverified')}</p>
      <div className="mt-2 flex flex-col gap-1">
        <Bar w="100%" />
        <Bar w="86%" />
      </div>
      <span className="mt-3">
        <Tap>
          <span className="px-1 text-[11px] font-medium text-[#1a73e8]">{t('advanced')}</span>
        </Tap>
      </span>
      <div className="mt-3 flex flex-col gap-1">
        <Bar w="92%" />
      </div>
      <span className="mt-2.5">
        <Tap>
          <span className="px-1 text-[11px] font-medium text-[#1a73e8] underline">{t('goTo')}</span>
        </Tap>
      </span>
      <span className="mt-auto flex justify-end pt-3">
        <span className="rounded-full bg-[#1a73e8] px-2.5 py-1 text-[9.5px] font-medium text-[#ffffff] opacity-45">{t('backToSafety')}</span>
      </span>
    </GoogleScreen>
  )
}

function Consent() {
  const t = useTranslations('mail.guide.screens')
  const box = (
    <span className="flex size-3.5 shrink-0 items-center justify-center rounded-[3px] bg-[#1a73e8]">
      <Check className="size-2.5 text-[#ffffff]" strokeWidth={3.5} />
    </span>
  )
  return (
    <GoogleScreen label={t('consentLabel')}>
      <p className="text-[13px] font-medium leading-snug">{t('consent')}</p>
      <span className="mt-2.5">
        <Tap>
          <span className="flex items-center gap-2 px-1 py-0.5 text-[11px] font-medium">
            {box}
            {t('selectAll')}
          </span>
        </Tap>
      </span>
      <ul className="mt-2.5 flex flex-col gap-2 border-t border-[#e8eaed] pt-2.5">
        {(['scopeMail', 'scopeContacts', 'scopeDrive'] as const).map((k) => (
          <li key={k} className="flex items-start gap-2 text-[10.5px] leading-snug text-[#3c4043]">
            {box}
            <span>{t(k)}</span>
          </li>
        ))}
      </ul>
      <span className="mt-auto flex items-center justify-end gap-2 pt-3">
        <span className="px-1 text-[10px] font-medium text-[#1a73e8]">{t('cancel')}</span>
        <Tap>
          <span className="rounded-full bg-[#1a73e8] px-3 py-1 text-[10px] font-medium text-[#ffffff]">{t('continue')}</span>
        </Tap>
      </span>
    </GoogleScreen>
  )
}
