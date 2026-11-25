'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Archive, ArrowLeft, Forward, Inbox, ListPlus, Mail, Reply, ReplyAll, Star, Trash2, Undo2 } from 'lucide-react'
import { useWorkspaceMap } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { QuickTaskDialog } from '@/components/tasks/quick-task-dialog'
import { useDateLocale } from '@/lib/dates'
import type { ApiMailMessage, MailAddress } from '@/lib/api/correo'
import { useMailActions, useMailThread } from '@/lib/queries/mail'
import { cn, taskRef } from '@/lib/utils'
import { MailAttachments, MailBody } from './mail-body'
import { MailComposer, type ComposeMode } from './mail-composer'
import { errorCode, RECONNECT_CODES, useMailError } from './mail-errors'
import { bodyText, longWhen, personName, shortWhen } from './mail-utils'
import { MailReconnect } from './mail-connect'

/**
 * Un hilo abierto, en la hoja: el asunto con lo que se hace con él (archivar, no leído, estrella,
 * papelera, crear una tarea), cada mensaje (los viejos plegados en una línea; el último y los sin leer,
 * abiertos) y, al pie, responder, responder a todos o reenviar. Al abrirlo queda leído.
 */
export function MailThread({
  box,
  fromEmail,
  threadId,
  folder,
  onBack,
}: {
  box: string
  fromEmail: string
  threadId: string
  folder: string | null
  onBack: () => void
}) {
  const t = useTranslations('mail')
  const locale = useDateLocale()
  const mailError = useMailError()
  const { data, error, isLoading } = useMailThread(box, threadId)
  const { label, trash } = useMailActions(box)
  const [compose, setCompose] = useState<ComposeMode | null>(null)
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const wsMap = useWorkspaceMap()

  // al abrirlo, leído (una vez por hilo; si después se marca «no leído», se respeta)
  const marked = useRef<string | null>(null)
  useEffect(() => {
    if (!data || marked.current === data.id) return
    marked.current = data.id
    if (data.messages.some((m) => m.unread)) label.mutate({ id: data.id, remove: ['UNREAD'] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id])

  useEffect(() => {
    if (compose) bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [compose])

  const known = useMemo<MailAddress[]>(() => {
    const all = (data?.messages ?? []).flatMap((m) => [m.from, ...m.to, ...m.cc]).filter((p) => !p.me)
    return all.filter((p, i) => all.findIndex((x) => x.email.toLowerCase() === p.email.toLowerCase()) === i).map(({ name, email }) => ({ name, email }))
  }, [data])

  if (isLoading) {
    return (
      <div className="flex w-full flex-col gap-4 p-6">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-40" />
        <Skeleton className="h-24" />
      </div>
    )
  }
  if (error || !data) {
    const code = errorCode(error)
    return (
      <div className="flex w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="max-w-sm text-sm text-fg-muted">{mailError(error)}</p>
        {RECONNECT_CODES.includes(code) ? <MailReconnect /> : null}
        <Button variant="secondary" size="sm" onClick={onBack}>
          <ArrowLeft />
          {t('backToList')}
        </Button>
      </div>
    )
  }

  const messages = data.messages
  const last = messages.at(-1)
  const inInbox = data.labelIds.includes('INBOX')
  const inTrash = data.labelIds.includes('TRASH')
  const starred = data.labelIds.includes('STARRED')
  const subject = data.subject || t('noSubject')
  const open = (m: ApiMailMessage) => m === last || m.unread || opened.has(m.id)

  // con muchos mensajes, el medio en una línea («N más»), como en Gmail
  const collapseMiddle = !showAll && messages.length > 5
  const visible = collapseMiddle ? [messages[0]!, ...messages.slice(-2)] : messages
  const hiddenCount = messages.length - visible.length

  const act = (p: Promise<unknown>, done?: string) => p.then(() => done && toast.success(done)).catch((e) => toast.error(mailError(e)))
  const archive = () => {
    void act(label.mutateAsync({ id: data.id, remove: ['INBOX'], folder }), t('archived'))
    if (folder === 'INBOX') onBack()
  }
  const toInbox = () => void act(label.mutateAsync({ id: data.id, add: ['INBOX'] }), t('movedToInbox'))
  const markUnread = () => {
    void act(label.mutateAsync({ id: data.id, add: ['UNREAD'] }))
    onBack()
  }
  const toggleStar = () => void act(label.mutateAsync({ id: data.id, ...(starred ? { remove: ['STARRED'], folder } : { add: ['STARRED'] }) }))
  const toTrash = () => {
    void act(trash.mutateAsync({ id: data.id, undo: inTrash }), inTrash ? t('untrashed') : t('trashed'))
    onBack()
  }

  const startCompose = (kind: 'reply' | 'replyAll' | 'forward', m: ApiMailMessage = last!) => setCompose({ kind, message: m, threadId: data.id, subject: data.subject })
  const replyAllUseful = last ? last.to.length + last.cc.length > 1 : false

  const taskDescription = last
    ? [
        t('task.from', { name: `${personName(last.from)} <${last.from.email}>`, when: longWhen(last.date, locale) }),
        '',
        bodyText(last).slice(0, 4000),
        '',
        `${t('task.link')}: ${typeof window === 'undefined' ? '' : window.location.origin}/mail?b=${box}&h=${data.id}`,
      ].join('\n')
    : ''

  return (
    <div className="flex min-h-0 w-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft px-4 py-3 sm:px-6">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={t('backToList')} className="lg:hidden">
          <ArrowLeft />
        </Button>
        <h1 className="min-w-0 flex-1 basis-60 text-lg font-semibold leading-snug tracking-[-0.015em] text-fg">{subject}</h1>
        <div className="flex items-center gap-0.5">
          {inTrash ? (
            <Action label={t('untrash')} onClick={toTrash} icon={<Undo2 />} />
          ) : inInbox ? (
            <Action label={t('archive')} onClick={archive} icon={<Archive />} />
          ) : (
            <Action label={t('moveToInbox')} onClick={toInbox} icon={<Inbox />} />
          )}
          <Action label={t('markUnread')} onClick={markUnread} icon={<Mail />} />
          <Action label={starred ? t('unstar') : t('star')} onClick={toggleStar} icon={<Star className={cn(starred && 'fill-[oklch(0.8_0.15_85)] text-[oklch(0.72_0.15_75)]')} />} />
          {inTrash ? null : <Action label={t('trash')} onClick={toTrash} icon={<Trash2 />} />}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <Button variant="secondary" size="sm" onClick={() => setTaskOpen(true)}>
            <ListPlus />
            {t('createTask')}
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-[860px] pb-6">
          {visible.map((m, i) => (
            <div key={m.id}>
              {collapseMiddle && i === 1 ? (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="flex w-full items-center gap-3 border-b border-line-soft px-6 py-2 text-left text-xs font-medium text-accent-ink hover:bg-hover/50"
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft tabular-nums">{hiddenCount}</span>
                  {t('moreMessages', { count: hiddenCount })}
                </button>
              ) : null}
              {open(m) ? (
                <MessageCard box={box} m={m} onReply={(kind) => startCompose(kind, m)} />
              ) : (
                <button
                  type="button"
                  onClick={() => setOpened((s) => new Set(s).add(m.id))}
                  className="flex w-full items-center gap-3 border-b border-line-soft px-6 py-2.5 text-left transition-colors hover:bg-hover/50"
                >
                  <Avatar name={personName(m.from)} seed={m.from.email} size={28} />
                  <span className="w-40 shrink-0 truncate text-[13px] font-medium text-fg">{m.from.me ? t('me') : personName(m.from)}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted">{m.snippet}</span>
                  <span className="shrink-0 text-xs text-fg-subtle">{shortWhen(m.date, locale, t('yesterday'))}</span>
                </button>
              )}
            </div>
          ))}

          <div ref={bottom} className="px-4 pt-5 sm:px-6">
            {compose ? (
              <MailComposer key={`${compose.kind}-${'message' in compose ? compose.message.id : ''}`} box={box} fromEmail={fromEmail} mode={compose} known={known} onClose={() => setCompose(null)} />
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => startCompose('reply')}>
                  <Reply />
                  {t('reply')}
                </Button>
                {replyAllUseful ? (
                  <Button variant="secondary" onClick={() => startCompose('replyAll')}>
                    <ReplyAll />
                    {t('replyAll')}
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={() => startCompose('forward')}>
                  <Forward />
                  {t('forward')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* la tarea se crea sin salir del correo: el aviso trae «Abrir» */}
      <QuickTaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        defaults={{ title: subject, description: taskDescription }}
        onCreated={(task) => {
          const ws = wsMap.get(task.workspace_id)
          const ref = ws ? taskRef(ws.key, task.number) : null
          toast.success(ref ? t('taskCreated', { ref }) : t('taskCreatedPlain'), {
            action: { label: t('openTask'), onClick: () => router.push(ref ? `/tasks/${ref}` : `/tasks`) },
          })
        }}
      />
    </div>
  )
}

function Action({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <Tooltip content={label}>
      <Button variant="ghost" size="icon" onClick={onClick} aria-label={label}>
        {icon}
      </Button>
    </Tooltip>
  )
}

/** Un mensaje abierto: quién, a quién y cuándo; el cuerpo; los adjuntos; y responder desde él. */
function MessageCard({ box, m, onReply }: { box: string; m: ApiMailMessage; onReply: (kind: 'reply' | 'replyAll' | 'forward') => void }) {
  const t = useTranslations('mail')
  const locale = useDateLocale()
  const names = (ps: { name: string | null; email: string; me: boolean }[]) => ps.map((p) => (p.me ? t('me') : personName(p))).join(', ')
  return (
    <article className="border-b border-line-soft px-4 py-5 sm:px-6">
      <header className="flex items-start gap-3">
        <Avatar name={personName(m.from)} seed={m.from.email} size={38} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[14.5px] font-semibold text-fg">{m.from.me ? t('me') : personName(m.from)}</span>
            <span className="truncate text-xs text-fg-subtle">{m.from.email}</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-fg-muted" title={[...m.to, ...m.cc].map((p) => p.email).join(', ')}>
            {t('toLine', { names: names(m.to) || '—' })}
            {m.cc.length ? ` · ${t('ccLine', { names: names(m.cc) })}` : ''}
          </p>
        </div>
        <time dateTime={m.date} title={longWhen(m.date, locale)} className="shrink-0 pt-0.5 text-xs text-fg-subtle">
          {longWhen(m.date, locale)}
        </time>
        <span className="flex shrink-0 items-center">
          <Tooltip content={t('reply')}>
            <Button variant="ghost" size="icon" onClick={() => onReply('reply')} aria-label={t('reply')} className="-my-1">
              <Reply />
            </Button>
          </Tooltip>
        </span>
      </header>
      <div className="mt-4 sm:pl-[50px]">
        <MailBody box={box} message={m} />
        <MailAttachments box={box} message={m} />
      </div>
    </article>
  )
}
