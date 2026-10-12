'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { format, isSameDay } from 'date-fns'
import { ArrowUpRight, CalendarDays, Check, Download, Video } from 'lucide-react'
import { useApp, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { DocMark, WorkspaceMark } from '@/components/app/marks'
import { AvatarStack } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { StatusIcon } from '@/components/tasks/status-icon'
import { DueDate } from '@/components/tasks/due-date'
import { formatBytes } from '@/components/attachments/attachments'
import { FilePreview, fileTitle } from '@/components/vault/file-visual'
import { openAttachment, useVaultFiles } from '@/lib/queries/attachments'
import { useTask } from '@/lib/queries/tasks'
import { useDocsIn } from '@/lib/queries/docs'
import { useChatMutations } from '@/lib/queries/chats'
import { useDateLocale } from '@/lib/dates'
import { assigneesOf } from '@/lib/assignees'
import { taskStatusOf } from '@/lib/statuses'
import { useStatusName } from '@/lib/use-status-name'
import { taskPath } from '@/lib/use-open-task'
import type { ChatMessageRow, RsvpAnswer } from '@/lib/database.types'
import { cn, excerptOf, taskRef } from '@/lib/utils'

const card = 'mt-1.5 flex w-full max-w-md overflow-hidden rounded-xl border border-line bg-panel text-left'

function Missing() {
  const t = useTranslations('pasillo.cards')
  return <div className={cn(card, 'px-3 py-2.5 text-sm text-fg-subtle')}>{t('missing')}</div>
}

/** Tarea compartida: estado, título, responsables y fecha; un clic la abre. */
export function TaskCard({ id }: { id: string }) {
  const t = useTranslations('pasillo.cards')
  const statusName = useStatusName()
  const { data: task, isLoading } = useTask(id)
  const ws = useWorkspaceMap().get(task?.workspace_id ?? '')
  const memberMap = useMemberMap()
  if (isLoading) return <div className={cn(card, 'h-16 animate-pulse')} />
  if (!task || !ws) return <Missing />
  const people = assigneesOf(task).flatMap((u) => memberMap.get(u) ?? [])
  return (
    <Link href={taskPath(ws.key, task.number)} className={cn(card, 'group/card flex-col gap-1.5 px-3 py-2.5 transition-colors hover:border-line-strong')}>
      <span className="flex items-center gap-1.5 text-2xs text-fg-subtle">
        <WorkspaceMark ws={ws} size={14} />
        <span>{ws.name}</span>
        <span className="font-mono">{taskRef(ws.key, task.number)}</span>
        <ArrowUpRight className="ml-auto size-3.5 opacity-0 transition-opacity group-hover/card:opacity-100" />
      </span>
      <span className="flex items-start gap-2">
        <StatusIcon status={task.status} className="mt-0.5" />
        <span className={cn('text-sm font-medium leading-snug', task.status === 'done' ? 'text-fg-muted line-through' : 'text-fg')}>{task.title}</span>
      </span>
      <span className="flex items-center gap-3 text-xs text-fg-muted">
        <span>{statusName(taskStatusOf(task, ws))}</span>
        {task.due_date ? <DueDate due={task.due_date} done={task.status === 'done'} /> : null}
        {people.length ? <AvatarStack people={people} size={18} ring="panel" className="ml-auto" /> : <span className="ml-auto text-fg-subtle">{t('unassigned')}</span>}
      </span>
    </Link>
  )
}

/** Archivo de la bóveda: vista previa, título y tamaño; se abre o se ve en la bóveda. */
export function FileCard({ id }: { id: string }) {
  const t = useTranslations('pasillo.cards')
  const { data: files, isLoading } = useVaultFiles()
  const file = files?.find((f) => f.id === id)
  if (isLoading) return <div className={cn(card, 'h-20 animate-pulse')} />
  if (!file) return <Missing />
  return (
    <div className={cn(card, 'items-stretch')}>
      <button type="button" onClick={() => openAttachment(file)} className="w-24 shrink-0 border-r border-line" aria-label={t('open')}>
        <FilePreview a={file} className="size-full min-h-20" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2">
        <span className="truncate text-sm font-medium text-fg">{fileTitle(file)}</span>
        <span className="truncate text-xs text-fg-subtle">
          {file.title ? file.name : null}
          {file.size_bytes ? `${file.title ? ' · ' : ''}${formatBytes(file.size_bytes)}` : null}
        </span>
        <span className="flex items-center gap-3 pt-0.5 text-xs">
          <button type="button" onClick={() => openAttachment(file)} className="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">
            <Download className="size-3.5" />
            {file.kind === 'link' ? t('openLink') : t('open')}
          </button>
          <Link href={`/vault?file=${file.id}`} className="text-fg-muted hover:text-fg hover:underline">
            {t('inVault')}
          </Link>
        </span>
      </div>
    </div>
  )
}

/** Documento escrito de un espacio. */
export function DocCard({ id }: { id: string }) {
  const td = useTranslations('docs')
  const { workspaces, observedWorkspaces } = useApp()
  const wsIds = useMemo(() => [...workspaces, ...observedWorkspaces].map((w) => w.id), [workspaces, observedWorkspaces])
  const { data: docs, isLoading } = useDocsIn(wsIds)
  const doc = docs?.find((d) => d.id === id)
  const ws = useWorkspaceMap().get(doc?.workspace_id ?? '')
  if (isLoading) return <div className={cn(card, 'h-16 animate-pulse')} />
  if (!doc || !ws) return <Missing />
  return (
    <Link href={`/w/${ws.slug}/docs/${doc.id}`} className={cn(card, 'flex-col gap-1 px-3 py-2.5 transition-colors hover:border-line-strong')}>
      <span className="flex items-center gap-1.5 text-2xs text-fg-subtle">
        <DocMark source={doc.source} className="size-3.5" />
        {td(`kicker.${doc.source}`)}
        <span aria-hidden>·</span>
        <WorkspaceMark ws={ws} size={14} />
        {ws.name}
      </span>
      <span className="text-sm font-medium text-fg">{doc.title || td('untitled')}</span>
      {doc.excerpt ? <span className="line-clamp-2 text-xs text-fg-muted">{excerptOf(doc.excerpt, 160)}</span> : null}
    </Link>
  )
}

/** Invitación a reunión: cuándo, el enlace para entrar y quién va. Cada persona responde aquí mismo. */
export function InviteCard({ message }: { message: ChatMessageRow }) {
  const t = useTranslations('pasillo.cards')
  const locale = useDateLocale()
  const { user } = useApp()
  const memberMap = useMemberMap()
  const { rsvp } = useChatMutations()
  const invite = message.meta.invite
  if (!invite) return <Missing />
  const start = new Date(invite.start)
  const end = new Date(invite.end)
  const mine = invite.rsvp[user.id]
  const going = Object.entries(invite.rsvp)
    .filter(([, a]) => a === 'yes')
    .flatMap(([id]) => memberMap.get(id) ?? [])
  const count = (a: RsvpAnswer) => Object.values(invite.rsvp).filter((x) => x === a).length
  const now = new Date()
  const past = end < now
  // ya empezó y no ha terminado: se resalta para entrar
  const live = !past && start <= now
  return (
    <div className={cn(card, 'flex-col')}>
      <div className="flex gap-3 px-3 py-2.5">
        {/* la fecha como hoja de calendario: se reconoce de un vistazo */}
        <span className="flex w-12 shrink-0 flex-col items-center overflow-hidden rounded-lg border border-line text-center">
          <span className="w-full bg-accent py-0.5 text-2xs font-semibold uppercase text-accent-fg">{format(start, 'MMM', { locale })}</span>
          <span className="py-1 text-lg font-semibold leading-none text-fg">{format(start, 'd')}</span>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          {live ? (
            <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-success">
              <span className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
                <span className="relative size-2 rounded-full bg-success" />
              </span>
              {t('live')}
            </span>
          ) : (
            <span className="text-2xs font-medium uppercase tracking-wide text-accent-ink">{t('invite')}</span>
          )}
          <span className="text-sm font-semibold leading-snug text-fg">{invite.title}</span>
          <span className="flex items-center gap-1.5 text-xs text-fg-muted">
            <CalendarDays className="size-3.5" />
            <span className="capitalize">{format(start, 'EEEE d', { locale })}</span>
            <span>
              {format(start, 'HH:mm')}–{isSameDay(start, end) ? format(end, 'HH:mm') : format(end, 'd MMM HH:mm', { locale })}
            </span>
          </span>
        </span>
        {invite.conferenceUrl && !past ? (
          <Button size="xs" variant={live ? 'primary' : 'secondary'} className="ml-auto shrink-0 self-start" onClick={() => window.open(invite.conferenceUrl!, '_blank', 'noopener,noreferrer')}>
            <Video />
            {t('join')}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-line bg-sidebar/50 px-3 py-2">
        {past ? (
          <span className="text-xs text-fg-subtle">{t('past')}</span>
        ) : (
          <div className="flex items-center gap-1" role="group" aria-label={t('rsvp')}>
            {(['yes', 'maybe', 'no'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => rsvp.mutate({ message, answer: a })}
                aria-pressed={mine === a}
                className={cn(
                  'inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs transition-colors',
                  mine === a
                    ? a === 'yes'
                      ? 'border-success/40 bg-success-soft font-medium text-success'
                      : a === 'no'
                        ? 'border-danger/30 bg-danger-soft font-medium text-danger'
                        : 'border-accent-mid/40 bg-accent-soft font-medium text-accent-ink'
                    : 'border-line text-fg-muted hover:bg-hover hover:text-fg',
                )}
              >
                {mine === a ? <Check className="size-3" strokeWidth={3} /> : null}
                {t(`answers.${a}`)}
                {count(a) ? <span className="tabular-nums opacity-70">{count(a)}</span> : null}
              </button>
            ))}
          </div>
        )}
        {going.length ? (
          <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap text-xs text-fg-subtle">
            <AvatarStack people={going} size={18} ring="sidebar" />
            {t('going', { count: going.length })}
          </span>
        ) : null}
      </div>
    </div>
  )
}
