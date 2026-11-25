'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowLeft, Check, ChevronDown, HardDrive, History, PenLine, Send, Trash2, X } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { GoogleG } from '@/components/calendar/connect-calendar'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useDateLocale } from '@/lib/dates'
import { useDebounced } from '@/lib/hooks'
import type { ApiDriveFile, ApiMailMessage, MailAddress } from '@/lib/api/correo'
import { useMailActions, useMailboxes, useMailContacts, useMailThreads } from '@/lib/queries/mail'
import { cn } from '@/lib/utils'
import { bodyText, fold, forwardSubject, longWhen, parseAddress, personName, quoted, replySubject, replyTargets } from './mail-utils'
import { useMailError } from './mail-errors'
import { DriveInsertDialog } from './mail-drive'

/**
 * Lo que se lleva escrito, guardado en la pestaña (sessionStorage) mientras se escribe: si se sale
 * (a Google a dar un permiso, a otro hilo, se recarga), al volver a abrir ese correo sigue ahí. Al
 * enviar o descartar se borra. Uno por buzón y por correo (el nuevo, o la respuesta a un mensaje).
 */
type Draft = { to: MailAddress[]; cc: MailAddress[]; bcc: MailAddress[]; subject: string; body: string; withQuote: boolean }
const draftKey = (box: string, mode: ComposeMode) => `veltro:mail-draft:${box}:${mode.kind === 'new' ? 'new' : `${mode.kind}:${mode.message.id}`}`
function readDraft(key: string): Draft | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}
function writeDraft(key: string, draft: Draft | null) {
  try {
    if (draft) sessionStorage.setItem(key, JSON.stringify(draft))
    else sessionStorage.removeItem(key)
  } catch {
    // sin almacenamiento (ventana privada, lleno): no se guarda y listo
  }
}

export type ComposeMode =
  | { kind: 'new' }
  | { kind: 'reply' | 'replyAll' | 'forward'; message: ApiMailMessage; threadId: string; subject: string }

/**
 * Escribir un correo desde la cuenta abierta: nuevo, responder (a quien escribió o a todos) o
 * reenviar. Para y Cc con sugerencias de la gente de Veltro, de quienes están en el hilo y de los
 * contactos de Google; «Drive» inserta el enlace de un archivo. Al responder, el mensaje citado va
 * al pie (se puede quitar). ⌘↵ envía.
 *
 * `page`: el correo nuevo, como una hoja de carta que llena el panel (quién envía y a quién arriba, el
 * asunto grande como título y el mensaje con todo el alto); `inline`: la respuesta dentro del hilo.
 */
export function MailComposer({
  box,
  fromEmail,
  mode,
  known = [],
  onClose,
  className,
  variant = 'inline',
}: {
  box: string
  fromEmail: string
  mode: ComposeMode
  /** gente del hilo, para sugerir */
  known?: MailAddress[]
  onClose: () => void
  className?: string
  variant?: 'inline' | 'page'
}) {
  const t = useTranslations('mail.compose')
  const tMail = useTranslations('mail')
  const { profile } = useApp()
  const locale = useDateLocale()
  const mailError = useMailError()
  const { send } = useMailActions(box)
  const mailbox = useMailboxes().data?.items.find((b) => b.id === box)
  // a quién le escribiste hace poco: Para vacío lo ofrece antes de escribir nada
  const recent = useRecentRecipients(box, Boolean(mailbox?.canRead))
  const [driveOpen, setDriveOpen] = useState(false)

  const initial = useMemo(() => {
    if (mode.kind === 'new') return { to: [], cc: [], subject: '', body: '', quote: null as string | null }
    const m = mode.message
    const when = longWhen(m.date, locale)
    if (mode.kind === 'forward') {
      const head = [
        t('forwardHeader'),
        `${t('fromLabel')}: ${personName(m.from)} <${m.from.email}>`,
        `${t('dateLabel')}: ${when}`,
        `${t('subjectLabel')}: ${mode.subject}`,
        `${t('toLabel')}: ${m.to.map((p) => p.email).join(', ')}`,
      ].join('\n')
      return { to: [], cc: [], subject: forwardSubject(mode.subject), body: `\n\n${head}\n\n${bodyText(m)}`, quote: null }
    }
    const { to, cc } = replyTargets(m, mode.kind === 'replyAll')
    return { to, cc, subject: replySubject(mode.subject), body: '', quote: quoted(t('quoteHeader', { when, name: `${personName(m.from)} <${m.from.email}>` }), m) }
  }, [mode, locale, t])

  const key = draftKey(box, mode)
  // lo que quedó escrito de antes (se lee una vez, al abrir)
  const [saved] = useState(() => readDraft(key))
  const [restored, setRestored] = useState(saved !== null)
  const [to, setTo] = useState<MailAddress[]>(saved?.to ?? initial.to)
  const [cc, setCc] = useState<MailAddress[]>(saved?.cc ?? initial.cc)
  const [bcc, setBcc] = useState<MailAddress[]>(saved?.bcc ?? [])
  const [showCc, setShowCc] = useState((saved?.cc ?? initial.cc).length > 0)
  const [showBcc, setShowBcc] = useState((saved?.bcc ?? []).length > 0)
  const [subject, setSubject] = useState(saved?.subject ?? initial.subject)
  const [body, setBody] = useState(saved?.body ?? initial.body)
  const [withQuote, setWithQuote] = useState(saved?.withQuote ?? true)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const text = useRef<HTMLTextAreaElement>(null)
  // un borrador recuperado que ya tiene a quién: se sigue escribiendo el mensaje, donde quedó
  const [startInBody] = useState(() => variant === 'page' && (saved?.to ?? initial.to).length > 0)
  useEffect(() => {
    const ta = text.current
    if (!startInBody || !ta) return
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)
  }, [startInBody])

  // se guarda mientras se escribe; si quedó como al abrirlo, no hay nada que guardar
  useEffect(() => {
    const draft: Draft = { to, cc: showCc ? cc : [], bcc: showBcc ? bcc : [], subject, body, withQuote }
    const blank: Draft = { to: initial.to, cc: initial.cc, bcc: [], subject: initial.subject, body: initial.body, withQuote: true }
    writeDraft(key, JSON.stringify(draft) === JSON.stringify(blank) ? null : draft)
  }, [key, to, cc, bcc, showCc, showBcc, subject, body, withQuote, initial])

  /** Cerrar sin guardar nada (enviado, descartado o cerrado vacío). */
  const done = () => {
    writeDraft(key, null)
    onClose()
  }
  /** Empezar de cero: lo recuperado se va y queda como recién abierto. */
  const startOver = () => {
    setTo(initial.to)
    setCc(initial.cc)
    setBcc([])
    setShowCc(initial.cc.length > 0)
    setShowBcc(false)
    setSubject(initial.subject)
    setBody(initial.body)
    setWithQuote(true)
    setRestored(false)
  }

  const ready = to.length > 0 && (body.trim().length > 0 || (withQuote && initial.quote)) && !send.isPending

  const submit = () => {
    if (!ready) return
    const full = initial.quote && withQuote ? `${body.trimEnd()}\n\n${initial.quote}` : body
    const thread = mode.kind === 'new' ? {} : { threadId: mode.threadId, inReplyTo: mode.message.messageId || undefined, references: mode.message.references || undefined }
    send.mutate(
      { to, cc: showCc ? cc : [], bcc: showBcc ? bcc : [], subject: subject.trim(), text: full, ...thread },
      {
        onSuccess: () => {
          toast.success(t('sent'))
          done()
        },
        onError: (e) => toast.error(mailError(e)),
      },
    )
  }

  const isReply = mode.kind === 'reply' || mode.kind === 'replyAll'
  // hay algo escrito (y por eso queda guardado si se cierra)
  const dirty = to.length > 0 || cc.length > 0 || bcc.length > 0 || subject.trim() !== initial.subject.trim() || body.trim() !== initial.body.trim()

  /** El archivo de Drive entra donde está el cursor, en su propia línea: «Nombre: enlace». */
  const insertDrive = (f: ApiDriveFile) => {
    const ta = text.current
    const at = ta && document.activeElement === ta ? ta.selectionStart : body.length
    const before = body.slice(0, at)
    const line = `${f.name}: ${f.link}`
    const next = `${before}${before && !before.endsWith('\n') ? '\n' : ''}${line}\n${body.slice(at)}`
    setBody(next)
    if (!f.shared)
      toast.warning(t('driveNotShared', { name: f.name }), {
        duration: 10_000,
        action: { label: t('openInDrive'), onClick: () => window.open(f.link, '_blank', 'noopener,noreferrer') },
      })
    requestAnimationFrame(() => {
      ta?.focus()
      const pos = before.length + (before && !before.endsWith('\n') ? 1 : 0) + line.length + 1
      ta?.setSelectionRange(pos, pos)
    })
  }

  const onKeys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
    if (e.key === 'Escape' && !body.trim()) done()
  }
  const ccToggles = (
    <span className="ml-auto flex shrink-0 gap-0.5 self-start pt-1.5">
      {!showCc ? (
        <button type="button" onClick={() => setShowCc(true)} className="rounded-md px-1.5 py-0.5 text-xs font-medium text-fg-muted hover:bg-hover hover:text-fg">
          {t('cc')}
        </button>
      ) : null}
      {!showBcc ? (
        <button type="button" onClick={() => setShowBcc(true)} className="rounded-md px-1.5 py-0.5 text-xs font-medium text-fg-muted hover:bg-hover hover:text-fg">
          {t('bcc')}
        </button>
      ) : null}
    </span>
  )

  if (variant === 'page') {
    return (
      // la hoja llena el panel: lo de arriba fijo, el mensaje se desplaza y el pie queda abajo
      <div className={cn('flex h-full min-h-0 w-full flex-col p-2 sm:p-4', className)} onKeyDown={onKeys}>
        <div className="mx-auto flex min-h-0 w-full max-w-[920px] flex-1 flex-col overflow-hidden rounded-[22px] bg-panel shadow-sheet ring-1 ring-line-soft animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out">
          <header className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3.5 sm:px-6">
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={tMail('backToList')} className="-ml-1.5 lg:hidden">
              <ArrowLeft />
            </Button>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft py-1 pl-2 pr-2.5 text-xs font-semibold text-accent-ink">
              <PenLine className="size-3.5" />
              {tMail('newMessage')}
            </span>
            {/* lo escrito queda en la pestaña: al volver, sigue ahí */}
            {dirty ? (
              <span className="inline-flex items-center gap-1 text-xs text-fg-subtle animate-in fade-in-0 duration-300">
                <Check className="size-3.5" />
                {t('draftSaved')}
              </span>
            ) : null}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('close')} title={t('close')} className="ml-auto max-lg:hidden">
              <X />
            </Button>
          </header>

          {restored ? (
            <div className="mx-4 mb-1 flex items-center gap-2 rounded-xl bg-accent-soft/50 px-3 py-1.5 text-xs text-fg-muted sm:mx-6">
              <History className="size-3.5 shrink-0 text-accent-ink" />
              <span className="min-w-0 flex-1">{t('draftRestored')}</span>
              <button type="button" onClick={startOver} className="shrink-0 rounded px-1 py-0.5 font-medium text-accent-ink hover:underline">
                {t('startOver')}
              </button>
            </div>
          ) : null}

          {/* quién envía y a quién: el encabezado de la carta */}
          <div className="mx-4 flex shrink-0 flex-col divide-y divide-line-soft border-b border-line-soft sm:mx-6">
            <div className="flex min-h-11 items-center gap-3 py-1.5">
              <span className="w-12 shrink-0 text-xs font-medium text-fg-muted">{t('fromLabel')}</span>
              <Avatar name={profile.full_name} src={profile.avatar_url} seed={profile.id} size={24} />
              <span className="min-w-0 truncate text-sm">
                <span className="font-semibold text-fg">{profile.full_name}</span>
                <span className="ml-1.5 text-fg-muted">{fromEmail}</span>
              </span>
            </div>
            <Row label={t('to')} wide>
              <RecipientInput box={box} google={Boolean(mailbox?.canContacts)} value={to} onChange={setTo} known={known} recent={recent} autoFocus={!startInBody} label={t('to')} />
              {ccToggles}
            </Row>
            {showCc ? (
              <Row label={t('cc')} wide>
                <RecipientInput box={box} google={Boolean(mailbox?.canContacts)} value={cc} onChange={setCc} known={known} recent={recent} label={t('cc')} />
              </Row>
            ) : null}
            {showBcc ? (
              <Row label={t('bcc')} wide>
                <RecipientInput box={box} google={Boolean(mailbox?.canContacts)} value={bcc} onChange={setBcc} known={known} recent={recent} label={t('bcc')} />
              </Row>
            ) : null}
          </div>

          {/* el asunto como título y el mensaje con todo el alto */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-5 scrollbar-thin sm:px-6" onClick={(e) => e.target === e.currentTarget && text.current?.focus()}>
            {/* el asunto crece en renglones (en el teléfono no se corta) y Enter pasa al mensaje */}
            <textarea
              rows={1}
              value={subject}
              onChange={(e) => setSubject(e.target.value.replace(/\s*\n\s*/g, ' '))}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.nativeEvent.isComposing) return
                e.preventDefault()
                text.current?.focus()
              }}
              maxLength={500}
              aria-label={t('subject')}
              placeholder={t('subjectPlaceholder')}
              className="w-full shrink-0 resize-none overflow-hidden bg-transparent text-[22px] font-semibold leading-tight tracking-[-0.02em] text-fg outline-none [field-sizing:content] placeholder:text-fg-subtle/60 sm:text-[24px]"
            />
            <textarea
              ref={text}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              aria-label={t('body')}
              placeholder={t('pagePlaceholder')}
              className="mt-3 min-h-40 w-full max-w-[72ch] flex-1 resize-none bg-transparent text-[15px] leading-[1.7] text-fg outline-none placeholder:text-fg-subtle/70"
            />
          </div>

          <footer className="flex shrink-0 items-center gap-2 border-t border-line-soft bg-canvas/50 px-3 py-2.5 sm:px-5">
            <Button variant="primary" onClick={submit} disabled={!ready} loading={send.isPending} className="pl-3 pr-2">
              <Send />
              {t('send')}
              <kbd className="ml-1 hidden rounded-[5px] bg-[oklch(1_0_0/0.16)] px-1 font-sans text-[11px] font-medium sm:inline">⌘↵</kbd>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDriveOpen(true)} title={t('driveHint')}>
              <HardDrive />
              {t('drive')}
            </Button>
            <Button variant="ghost" size="icon" onClick={done} aria-label={t('discard')} title={t('discard')} className="ml-auto hover:text-danger">
              <Trash2 />
            </Button>
          </footer>
        </div>
        <DriveInsertDialog box={box} open={driveOpen} onOpenChange={setDriveOpen} onPick={insertDrive} />
      </div>
    )
  }

  return (
    <div
      className={cn('flex flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-card', className)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          submit()
        }
        if (e.key === 'Escape' && !body.trim()) done()
      }}
    >
      {restored ? (
        <div className="flex items-center gap-2 border-b border-line-soft bg-accent-soft/40 px-4 py-1.5 text-xs text-fg-muted">
          <History className="size-3.5 shrink-0 text-accent-ink" />
          <span className="min-w-0 flex-1">{t('draftRestored')}</span>
          <button type="button" onClick={startOver} className="shrink-0 rounded px-1 py-0.5 font-medium text-accent-ink hover:underline">
            {t('startOver')}
          </button>
        </div>
      ) : null}
      <div className="flex flex-col divide-y divide-line-soft px-4">
        <Row label={t('to')}>
          <RecipientInput box={box} google={Boolean(mailbox?.canContacts)} value={to} onChange={setTo} known={known} recent={recent} autoFocus={!isReply} label={t('to')} />
          <span className="ml-auto flex shrink-0 gap-0.5 self-start pt-1.5">
            {!showCc ? (
              <button type="button" onClick={() => setShowCc(true)} className="rounded px-1.5 py-0.5 text-xs text-fg-muted hover:bg-hover hover:text-fg">
                {t('cc')}
              </button>
            ) : null}
            {!showBcc ? (
              <button type="button" onClick={() => setShowBcc(true)} className="rounded px-1.5 py-0.5 text-xs text-fg-muted hover:bg-hover hover:text-fg">
                {t('bcc')}
              </button>
            ) : null}
          </span>
        </Row>
        {showCc ? (
          <Row label={t('cc')}>
            <RecipientInput box={box} google={Boolean(mailbox?.canContacts)} value={cc} onChange={setCc} known={known} recent={recent} label={t('cc')} />
          </Row>
        ) : null}
        {showBcc ? (
          <Row label={t('bcc')}>
            <RecipientInput box={box} google={Boolean(mailbox?.canContacts)} value={bcc} onChange={setBcc} known={known} recent={recent} label={t('bcc')} />
          </Row>
        ) : null}
        {isReply ? null : (
          <Row label={t('subject')}>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={500}
              aria-label={t('subject')}
              className="h-9 min-w-0 flex-1 bg-transparent text-sm font-medium text-fg outline-none placeholder:text-fg-subtle"
              placeholder={t('subjectPlaceholder')}
            />
          </Row>
        )}
      </div>
      <textarea
        ref={text}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        autoFocus={isReply}
        aria-label={t('body')}
        placeholder={isReply ? t('replyPlaceholder') : t('placeholder')}
        className="min-h-36 resize-none border-t border-line-soft bg-transparent px-4 py-3 text-[14px] leading-relaxed text-fg outline-none [field-sizing:content] placeholder:text-fg-subtle"
        onFocus={(e) => {
          // al reenviar, el cursor arriba (lo reenviado va debajo)
          if (mode.kind === 'forward' && e.currentTarget.selectionStart === e.currentTarget.value.length) e.currentTarget.setSelectionRange(0, 0)
        }}
      />
      {initial.quote ? (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <button
              type="button"
              onClick={() => setQuoteOpen((v) => !v)}
              aria-expanded={quoteOpen}
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-hover hover:text-fg"
            >
              <ChevronDown className={cn('size-3.5 transition-transform', quoteOpen && 'rotate-180')} />
              {withQuote ? t('quoteIncluded') : t('quoteRemoved')}
            </button>
            <button type="button" onClick={() => setWithQuote((v) => !v)} className="rounded px-1 py-0.5 text-accent-ink hover:underline">
              {withQuote ? t('removeQuote') : t('addQuote')}
            </button>
          </div>
          {quoteOpen && withQuote ? (
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-hover/60 px-3 py-2 font-sans text-xs leading-relaxed text-fg-muted scrollbar-thin">{initial.quote}</pre>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center gap-2 border-t border-line-soft bg-canvas/40 px-3 py-2.5">
        <Button variant="primary" onClick={submit} disabled={!ready} loading={send.isPending}>
          <Send />
          {t('send')}
        </Button>
        <kbd className="hidden rounded border border-line px-1.5 font-sans text-[11px] text-fg-subtle sm:inline">⌘↵</kbd>
        <Button variant="ghost" size="sm" onClick={() => setDriveOpen(true)} title={t('driveHint')}>
          <HardDrive />
          {t('drive')}
        </Button>
        <span className="ml-auto min-w-0 truncate text-xs text-fg-subtle">{t('from', { email: fromEmail })}</span>
        <Button variant="ghost" size="icon" onClick={done} aria-label={t('discard')} title={t('discard')}>
          <Trash2 />
        </Button>
      </div>
      <DriveInsertDialog box={box} open={driveOpen} onOpenChange={setDriveOpen} onPick={insertDrive} />
    </div>
  )
}

function Row({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn('flex items-start gap-3 py-0.5', wide ? 'min-h-11' : 'min-h-10')}>
      <span className={cn('w-12 shrink-0 text-xs text-fg-muted', wide ? 'pt-3 font-medium' : 'pt-2.5')}>{label}</span>
      <div className="flex min-w-0 flex-1 items-start gap-2">{children}</div>
    </div>
  )
}

/**
 * A quién le escribiste hace poco: la gente de lo último que enviaste (lo más nuevo primero, sin
 * repetir y sin vos). Sale de Enviados, que la lista del correo ya pide.
 */
function useRecentRecipients(box: string, enabled: boolean): MailAddress[] {
  const { data } = useMailThreads(enabled ? box : null, 'SENT', '')
  return useMemo(() => {
    const seen = new Set<string>()
    const out: MailAddress[] = []
    for (const th of data?.pages[0]?.items ?? [])
      for (const p of [...th.to, ...th.participants]) {
        const key = p.email.toLowerCase()
        if (p.me || !key || seen.has(key)) continue
        seen.add(key)
        out.push({ name: p.name, email: p.email })
      }
    return out
  }, [data])
}

/** `google`: viene de los contactos de Google (no es alguien de Veltro ni del hilo) */
type Suggestion = MailAddress & { photo?: string | null; google?: boolean }

/**
 * Direcciones como fichas: se escriben (o se pegan varias) y entran con Enter, coma o Tab; las
 * sugerencias salen de la gente de Veltro, de quienes están en el hilo y (si la cuenta dio permiso)
 * de sus contactos de Google, con su foto.
 */
function RecipientInput({
  box,
  google,
  value,
  onChange,
  known,
  recent,
  autoFocus,
  label,
}: {
  box: string
  /** sugerir también de los contactos de Google */
  google: boolean
  value: MailAddress[]
  onChange: (v: MailAddress[]) => void
  known: MailAddress[]
  /** a quién le escribí hace poco: se ofrece con el campo vacío */
  recent: MailAddress[]
  autoFocus?: boolean
  label: string
}) {
  const t = useTranslations('mail.compose')
  const { members, user } = useApp()
  const [q, setQ] = useState('')
  const [bad, setBad] = useState(false)
  // -1: nada marcado (con el campo vacío, Enter no elige a nadie sin querer)
  const [active, setActive] = useState(-1)
  const [focused, setFocused] = useState(false)
  // Esc cierra la lista sin cerrar el correo
  const [open, setOpen] = useState(true)
  const input = useRef<HTMLInputElement>(null)
  // autoFocus pone el foco al montar sin avisar si la ventana no lo tenía: se mira dónde quedó
  useEffect(() => {
    if (document.activeElement === input.current) setFocused(true)
  }, [])

  const pool = useMemo(() => {
    const all: MailAddress[] = [...known, ...members.filter((m) => m.id !== user.id).map((m) => ({ name: m.full_name, email: m.email }))]
    return all.filter((a, i) => a.email && all.findIndex((b) => b.email.toLowerCase() === a.email.toLowerCase()) === i)
  }, [known, members, user.id])
  const needle = q.trim().toLowerCase()
  const debounced = useDebounced(needle, 250)
  const contacts = useMailContacts(box, debounced, google)
  const chosen = (a: { email: string }) => value.some((v) => v.email.toLowerCase() === a.email.toLowerCase())
  // «sofia» encuentra a Sofía: se compara sin tildes
  const matches = (a: MailAddress) => fold(`${a.name ?? ''} ${a.email}`).includes(fold(needle))
  const local: Suggestion[] = needle ? pool.filter((a) => !chosen(a) && matches(a)) : []
  // Los de Google que no estén ya. Mientras llega la respuesta de lo último escrito se ven los de la
  // búsqueda anterior, pero solo los que también coinciden con lo que hay escrito ahora.
  const fresh = !contacts.isPlaceholderData && debounced === needle
  const fromGoogle: Suggestion[] =
    needle.length >= 2
      ? (contacts.data?.items ?? [])
          .filter((c) => !chosen(c) && !local.some((l) => l.email.toLowerCase() === c.email.toLowerCase()) && (fresh || matches(c)))
          .map((c) => ({ ...c, google: true }))
      : []
  // sin nada escrito, a quién le escribiste hace poco
  const showingRecent = !needle
  const suggestions: Suggestion[] = showingRecent ? recent.filter((a) => !chosen(a)).slice(0, 6) : [...local, ...fromGoogle].slice(0, 8)
  const listOpen = focused && open && suggestions.length > 0
  const hi = showingRecent ? active : Math.max(active, 0)
  const pick = (s: Suggestion) => {
    add([s])
    setQ('')
    setActive(-1)
  }

  const add = (list: MailAddress[]) => {
    const next = [...value]
    for (const a of list) if (!next.some((v) => v.email.toLowerCase() === a.email.toLowerCase())) next.push(a)
    onChange(next)
  }
  // lo escrito (una o varias, separadas por coma o punto y coma) a fichas; lo que no es un correo queda
  const commit = () => {
    const parts = q.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
    if (!parts.length) return true
    const ok = parts.map(parseAddress)
    if (ok.some((a) => !a)) {
      setBad(true)
      return false
    }
    add(ok as MailAddress[])
    setQ('')
    setBad(false)
    return true
  }

  return (
    <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-1 py-1" onClick={() => input.current?.focus()}>
      {value.map((a) => (
        <span key={a.email} className="inline-flex max-w-full items-center gap-1 rounded-full bg-hover py-0.5 pl-1 pr-1.5 text-[13px] text-fg" title={a.email}>
          <Avatar name={a.name || a.email} seed={a.email} size={18} />
          <span className="truncate">{a.name || a.email}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange(value.filter((v) => v.email !== a.email))
            }}
            aria-label={t('removeRecipient', { email: a.email })}
            className="rounded-full p-0.5 text-fg-subtle hover:bg-active hover:text-fg"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        ref={input}
        value={q}
        autoFocus={autoFocus}
        aria-label={label}
        aria-invalid={bad || undefined}
        onChange={(e) => {
          setQ(e.target.value)
          setBad(false)
          setActive(e.target.value.trim() ? 0 : -1)
          setOpen(true)
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text')
          if (!/[,;\n]/.test(pasted)) return
          e.preventDefault()
          const list = pasted.split(/[,;\n]+/).map(parseAddress).filter((a): a is MailAddress => Boolean(a))
          add(list)
        }}
        onKeyDown={(e) => {
          if (listOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            const down = e.key === 'ArrowDown'
            setActive((i) => (i < 0 ? (down ? 0 : suggestions.length - 1) : (i + (down ? 1 : suggestions.length - 1)) % suggestions.length))
            return
          }
          if (listOpen && e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
            return
          }
          if ((e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) || e.key === ',' || e.key === ';' || (e.key === 'Tab' && q.trim())) {
            if (listOpen && hi >= 0 && e.key !== ',' && e.key !== ';') {
              e.preventDefault()
              pick(suggestions[hi])
              return
            }
            if (q.trim()) {
              e.preventDefault()
              commit()
            }
          }
          if (e.key === 'Backspace' && !q && value.length) onChange(value.slice(0, -1))
        }}
        onFocus={() => {
          setFocused(true)
          setOpen(true)
        }}
        onBlur={() => {
          setFocused(false)
          setActive(-1)
          if (q.trim() && !suggestions.length) commit()
        }}
        className={cn('h-7 min-w-32 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle', bad && 'text-danger')}
        placeholder={value.length ? '' : t('recipientsPlaceholder')}
      />
      {listOpen ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-full max-w-sm overflow-hidden rounded-xl border border-line bg-panel p-1 shadow-lift animate-in fade-in-0 slide-in-from-top-1 duration-150 ease-out">
          {showingRecent ? <p className="px-2 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">{t('recent')}</p> : null}
          <ul role="listbox" aria-label={showingRecent ? t('recent') : label}>
            {suggestions.map((s, i) => (
              <li key={s.email} role="option" aria-selected={i === hi}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(s)
                  }}
                  className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left', i === hi ? 'bg-hover' : 'hover:bg-hover')}
                >
                  <Avatar name={s.name || s.email} seed={s.email} src={s.photo} size={24} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-fg">{s.name || s.email}</span>
                    {s.name ? <span className="block truncate text-2xs text-fg-subtle">{s.email}</span> : null}
                  </span>
                  {s.google ? (
                    <span title={t('fromGoogle')} className="flex shrink-0 opacity-70">
                      <GoogleG className="size-3" />
                      <span className="sr-only">{t('fromGoogle')}</span>
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {bad ? <span className="w-full text-2xs text-danger">{t('badAddress')}</span> : null}
    </div>
  )
}
