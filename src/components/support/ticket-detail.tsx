'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { format, isToday } from 'date-fns'
import { toast } from 'sonner'
import { ArrowLeft, ArrowUp, CircleCheck, Clock, Hand, MapPin, MoreHorizontal, RotateCcw } from 'lucide-react'
import { WorkspaceMark } from '@/components/app/marks'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar } from '@/components/ui/avatar'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '@/components/ui/menu'
import { Tooltip } from '@/components/ui/tooltip'
import { toErrorCode } from '@/lib/errors'
import { useDateLocale } from '@/lib/dates'
import { useMarkTicketRead, useReplyTicket, useSetTicketStatus, useTicket, useTicketFileUrls, type TicketDetail as Ticket, type TicketFile, type TicketMessage } from '@/lib/queries/support'
import { LIMITS, TICKET_STEPS, firstName, type TicketStatus } from '@/lib/support'
import { cn } from '@/lib/utils'
import { AuthorAvatar, CATEGORY_ICON, PeopleOrVeltro, StatusPill, SupportIcon, TICKET_TONE, TicketStatusIcon, UrgentTag, useAgo, useDestinationText } from './support-bits'
import { AttachButton, QueuedFiles, SentFiles, useDropTarget, useFileQueue } from './support-files'

const STATUS_ACTION_ICON = { in_review: Hand, resolved: CircleCheck, open: RotateCcw } as const

/** Un ticket: cabecera con su estado, línea de estados, conversación con sus archivos y responder. */
export function TicketDetail({ id }: { id: string }) {
  const t = useTranslations('ticket')
  const router = useRouter()
  const { data: ticket, isLoading, isError } = useTicket(id)
  const { mutate: markRead } = useMarkTicketRead()

  // al abrirlo (y si llega algo mientras se mira) lo que hay queda leído
  const unread = ticket?.unreadCount ?? 0
  useEffect(() => {
    if (unread > 0 && document.visibilityState === 'visible') markRead(id)
  }, [id, unread, markRead])

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="h-14 border-b border-line" />
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-8">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-20" />
          <Skeleton className="h-32" />
        </div>
      </div>
    )
  }
  if (isError || !ticket) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <EmptyState
          icon={<SupportIcon />}
          title={t('notFound')}
          description={t('notFoundHint')}
          action={
            <Button size="sm" onClick={() => router.push('/support')}>
              <ArrowLeft />
              {t('back')}
            </Button>
          }
        />
      </div>
    )
  }
  return <TicketView ticket={ticket} />
}

function TicketView({ ticket }: { ticket: Ticket }) {
  const t = useTranslations('ticket')
  const ts = useTranslations('support')
  const te = useTranslations('errors')
  const router = useRouter()
  const ago = useAgo()
  const destinationText = useDestinationText()
  const setStatus = useSetTicketStatus(ticket.id)
  const { data: urls } = useTicketFileUrls(ticket.id, ticket.filesCount)
  const composer = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const recipient = ticket.forMe
  const resolved = ticket.status === 'resolved'
  const Category = CATEGORY_ICON[ticket.category]
  const creatorName = ticket.creator?.fullName ?? ts('someone')

  // los archivos del alta van con la descripción (el primer mensaje); los demás, con su respuesta
  const filesByMessage = useMemo(() => {
    const first = ticket.messages.find((m) => m.authorKind !== 'system')?.id
    const map = new Map<string, TicketFile[]>()
    for (const f of ticket.files) {
      const key = f.messageId ?? first ?? ''
      map.set(key, [...(map.get(key) ?? []), f])
    }
    return map
  }, [ticket.messages, ticket.files])

  // se abre arriba (el título y la línea de estados dan el contexto); si llega algo mientras se mira
  // o al responder, baja hasta lo nuevo
  const count = ticket.messages.length
  const seen = useRef(count)
  useEffect(() => {
    if (count > seen.current) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
    seen.current = count
  }, [count])

  const change = (status: 'open' | 'in_review' | 'resolved') =>
    setStatus.mutate(status, {
      onSuccess: () => {
        if (status === 'resolved') toast.success(t('toastResolved'))
        else if (status === 'in_review') toast.success(t('toastTaken'))
        else {
          toast(t('toastReopened'))
          if (ticket.mine) window.setTimeout(() => composer.current?.focus(), 80)
        }
      },
      onError: (e) => toast.error(t('statusError'), { description: te(toErrorCode(e)) }),
    })

  // estados que permite la API: el más probable a la vista y el resto en «Cambiar estado».
  // Abierto y me llegó: «Tomarlo» ya está en el aviso de abajo; resuelto: «Volver a abrir» está en el pie.
  const actions = (['in_review', 'resolved', 'open'] as const).filter((s) => ticket.allowedStatuses.includes(s))
  const primary = !resolved && actions.includes('resolved') ? 'resolved' : null
  const others = actions.filter((s) => s !== primary)
  const label = (s: (typeof actions)[number]) => (s === 'in_review' && ticket.status !== 'open' ? t('statusTo.review') : t(`statusTo.${s}`))

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-5">
        <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => router.push('/support')} aria-label={t('back')}>
          <ArrowLeft />
        </Button>
        <TicketStatusIcon status={ticket.status} className="size-4" />
        <span className="font-mono text-xs text-fg-muted">{ticket.code}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{ticket.title}</span>
        <div className="flex shrink-0 items-center gap-1">
          {primary ? (
            <Button size="sm" onClick={() => change(primary)} loading={setStatus.isPending && setStatus.variables === primary} disabled={setStatus.isPending}>
              {(() => {
                const Icon = STATUS_ACTION_ICON[primary]
                return <Icon />
              })()}
              <span className="max-sm:sr-only">{label(primary)}</span>
            </Button>
          ) : null}
          {others.length ? (
            <Menu>
              <Tooltip content={t('changeStatus')}>
                <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t('changeStatus')} disabled={setStatus.isPending} />}>
                  <MoreHorizontal />
                </MenuTrigger>
              </Tooltip>
              <MenuContent align="end" className="w-56">
                <MenuLabel>{t('changeStatus')}</MenuLabel>
                {others.map((s) => {
                  const Icon = STATUS_ACTION_ICON[s]
                  return (
                    <MenuItem key={s} onClick={() => change(s)}>
                      <Icon />
                      {label(s)}
                    </MenuItem>
                  )
                })}
              </MenuContent>
            </Menu>
          ) : null}
        </div>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pb-10 pt-7 sm:px-8">
          {/* cabecera */}
          <section>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusPill label={ts(`status.${ticket.status}`)} tone={TICKET_TONE[ticket.status]} />
              {ticket.urgent ? <UrgentTag /> : null}
            </div>
            <h1 className="mt-2.5 text-balance text-xl font-semibold leading-tight tracking-[-0.015em] text-fg">{ticket.title}</h1>
            <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-fg-muted">
              <Meta icon={<Category className="size-3.5" />} label={ts(`category.${ticket.category}`)} />
              {ticket.workspace ? <Meta icon={<WorkspaceMark ws={ticket.workspace} size={16} />} label={ticket.workspace.name} /> : null}
              {ticket.whereText ? <Meta icon={<MapPin className="size-3.5" />} label={t('happenedIn', { where: ticket.whereText })} /> : null}
              {ticket.mine ? (
                <Meta icon={<PeopleOrVeltro people={ticket.destination === 'veltro' ? null : ticket.recipients} size={18} ring="canvas" />} label={ts('toLine', { to: destinationText(ticket.destination, ticket.recipients) })} />
              ) : (
                <Meta
                  icon={<Avatar name={creatorName} src={ticket.creator?.avatarUrl} seed={ticket.createdBy} size={18} />}
                  label={t('fromRole', { name: creatorName, role: t(`roleTag.${ticket.creator?.role ?? 'member'}`) })}
                />
              )}
              <Meta icon={<Clock className="size-3.5" />} label={t('createdAgo', { when: ago(ticket.createdAt) })} />
            </dl>
          </section>

          <StatusSteps ticket={ticket} />

          {/* a quien lo recibe: que lo tome para que se sepa que alguien lo mira */}
          {recipient && ticket.status === 'open' ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-mandarina/30 bg-warning-soft px-4 py-3">
              <Hand className="size-4 shrink-0 text-mandarina-ink" aria-hidden />
              <p className="min-w-0 flex-1 text-sm text-fg">{t('takeHint', { name: firstName(ticket.creator?.fullName) || ts('someone') })}</p>
              <Button size="sm" variant="primary" onClick={() => change('in_review')} disabled={setStatus.isPending}>
                {t('take')}
              </Button>
            </div>
          ) : null}

          {/* conversación */}
          <section aria-label={t('conversation')}>
            <h2 className="mb-1 text-sm font-semibold text-fg">{t('conversation')}</h2>
            <ol className="flex flex-col">
              {ticket.messages.map((m) => (
                <Fragment key={m.id}>
                  {m.authorKind === 'system' ? (
                    <SystemLine m={m} ago={ago} />
                  ) : (
                    <MessageRow m={m} ago={ago} files={filesByMessage.get(m.id) ?? []} urls={urls} />
                  )}
                </Fragment>
              ))}
            </ol>
          </section>

          {/* quien lo abrió confirma si quedó */}
          {ticket.mine && ticket.status === 'answered' ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/25 bg-success-soft px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{t('resolvedQ')}</p>
                <p className="text-xs text-fg-muted">{t('resolvedQHint', { who: ticket.destination === 'veltro' ? t('whoVeltro') : t('whoReplier') })}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => change('open')} disabled={setStatus.isPending}>
                {t('stillHappening')}
              </Button>
              <Button size="sm" variant="primary" onClick={() => change('resolved')} disabled={setStatus.isPending}>
                <CircleCheck />
                {t('yesResolved')}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {ticket.canReply ? (
        <Composer ticket={ticket} inputRef={composer} />
      ) : resolved && (ticket.mine || recipient) ? (
        <div className="mx-auto flex w-full max-w-3xl shrink-0 items-center gap-3 px-3 pb-3 sm:px-8 sm:pb-4">
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-panel px-4 py-2.5">
            <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
            <p className="min-w-0 flex-1 text-sm text-fg-muted">{t('isResolved')}</p>
            {actions.includes('open') ? (
              <Button size="sm" onClick={() => change('open')} disabled={setStatus.isPending}>
                <RotateCcw />
                {t('reopen')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Meta({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <dt className="flex shrink-0 items-center text-fg-subtle">{icon}</dt>
      <dd className="truncate">{label}</dd>
    </div>
  )
}

/** La hora de un paso: la hora si fue hoy, la fecha si no. */
function useStepTime() {
  const dl = useDateLocale()
  return (iso: string) => {
    const d = new Date(iso)
    return isToday(d) ? format(d, 'HH:mm') : format(d, 'd MMM', { locale: dl })
  }
}

/** Línea de estados: los cuatro pasos, hasta dónde llegó y cuándo. */
function StatusSteps({ ticket }: { ticket: Ticket }) {
  const t = useTranslations('ticket')
  const ts = useTranslations('support')
  const when = useStepTime()
  const idx = TICKET_STEPS.indexOf(ticket.status)
  return (
    <ol
      className="grid grid-cols-4 rounded-xl border border-line bg-panel px-2 py-4"
      aria-label={t('steps', { status: ts(`status.${ticket.status}`), step: idx + 1, total: TICKET_STEPS.length })}
    >
      {TICKET_STEPS.map((st, i) => {
        const done = i <= idx
        const current = i === idx
        const at = done ? ticket.reachedAt[st] : undefined
        return (
          <li key={st} className="flex min-w-0 flex-col items-center gap-1.5" aria-current={current ? 'step' : undefined}>
            <span className="relative flex h-5 w-full items-center justify-center">
              {i > 0 ? <span className={cn('absolute left-0 right-1/2 h-0.5', done ? 'bg-accent-mid' : 'bg-line')} /> : null}
              {i < TICKET_STEPS.length - 1 ? <span className={cn('absolute left-1/2 right-0 h-0.5', i < idx ? 'bg-accent-mid' : 'bg-line')} /> : null}
              {current ? (
                <span className="relative flex size-5 items-center justify-center rounded-full bg-accent-soft">
                  <span className="size-2.5 rounded-full bg-accent-mid" />
                </span>
              ) : (
                <span className={cn('relative size-2.5 rounded-full', done ? 'bg-accent-mid' : 'border-2 border-line-strong bg-panel')} />
              )}
            </span>
            <span className={cn('max-w-full truncate px-1 text-xs', current ? 'font-semibold text-fg' : done ? 'text-fg-muted' : 'text-fg-subtle')}>{ts(`status.${st}`)}</span>
            <span className="h-4 text-2xs tabular-nums text-fg-subtle">{at ? when(at) : ''}</span>
          </li>
        )
      })}
    </ol>
  )
}

function SystemLine({ m, ago }: { m: TicketMessage; ago: (iso: string) => string }) {
  const t = useTranslations('ticket')
  const status = (TICKET_STEPS as string[]).includes(m.body) ? (m.body as TicketStatus) : null
  return (
    <li className="flex items-center justify-center gap-1.5 py-2 text-xs text-fg-subtle">
      {status ? <TicketStatusIcon status={status} className="size-3" /> : null}
      <span>
        {status ? t(`system.${status}`) : m.body}
        {m.author && !m.mine ? ` · ${firstName(m.author.fullName)}` : ''} · {ago(m.createdAt)}
      </span>
    </li>
  )
}

function MessageRow({ m, ago, files, urls }: { m: TicketMessage; ago: (iso: string) => string; files: TicketFile[]; urls: ReturnType<typeof useTicketFileUrls>['data'] }) {
  const t = useTranslations('ticket')
  const ts = useTranslations('support')
  const veltro = m.authorKind === 'veltro'
  const name = veltro ? t('veltroTeam') : m.mine ? t('you') : (m.author?.fullName ?? ts('someone'))
  const locale = useLocale()
  return (
    <li className="flex gap-3 py-3">
      <AuthorAvatar person={m.author} veltro={veltro} size={32} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-fg">{name}</span>
          <time dateTime={m.createdAt} title={new Date(m.createdAt).toLocaleString(locale)} className="text-2xs tabular-nums text-fg-subtle">
            {ago(m.createdAt)}
          </time>
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">{m.body}</p>
        <SentFiles files={files} urls={urls} className="mt-2.5" />
      </div>
    </li>
  )
}

/** Responder: texto y archivos (pegar, arrastrar o el clip). Enter envía; Mayús+Enter, otra línea. */
function Composer({ ticket, inputRef }: { ticket: Ticket; inputRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const t = useTranslations('ticket')
  const ts = useTranslations('support')
  const te = useTranslations('errors')
  const reply = useReplyTicket(ticket.id)
  const queue = useFileQueue()
  const drop = useDropTarget(queue.add)
  const [text, setText] = useState('')
  const hasFiles = queue.items.length > 0
  const ready = (text.trim().length > 0 || hasFiles) && !queue.uploading && !queue.failed && !reply.isPending
  const placeholder = ticket.mine ? t('replyMine') : t('replyTo', { name: firstName(ticket.creator?.fullName) || ts('someone') })

  const send = () => {
    if (!ready) {
      if (queue.uploading) toast.info(t('waitUploads'))
      return
    }
    const files = queue.payload()
    // sin texto pero con archivos: el mensaje lo dice (la conversación siempre tiene texto)
    const body = text.trim() || t('filesOnly', { count: files.length })
    reply.mutate(
      { body, files },
      {
        onSuccess: () => {
          setText('')
          queue.clear()
        },
        onError: (e) => toast.error(t('replyError'), { description: te(toErrorCode(e)) }),
      },
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl shrink-0 px-3 pb-3 sm:px-8 sm:pb-4" {...drop.props}>
      <div
        className={cn(
          'rounded-xl border bg-panel shadow-card transition-colors focus-within:border-accent-mid',
          drop.over ? 'border-accent-mid bg-accent-soft/40' : 'border-line',
        )}
      >
        <QueuedFiles queue={queue} className="px-3 pt-3" />
        <AutoTextarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={queue.onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={drop.over ? t('dropHere') : placeholder}
          aria-label={placeholder}
          maxLength={LIMITS.reply}
          className="max-h-48 bg-transparent px-3.5 pb-1 pt-3 text-sm leading-relaxed outline-none placeholder:text-fg-subtle"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <AttachButton queue={queue} />
          <span className="ml-auto mr-2 hidden text-2xs text-fg-subtle sm:inline">{t('enterHint')}</span>
          <Button size="icon-sm" variant="primary" onClick={send} disabled={!ready} loading={reply.isPending} aria-label={ts('send')} className="rounded-lg">
            {reply.isPending ? null : <ArrowUp />}
          </Button>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {queue.uploading ? t('uploading') : ''}
      </p>
    </div>
  )
}
