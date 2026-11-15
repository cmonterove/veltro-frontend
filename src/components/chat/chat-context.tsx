'use client'

import Link from 'next/link'
import { useId, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { differenceInCalendarDays, format } from 'date-fns'
import { ChevronDown, PanelRightClose, PanelRightOpen, Video } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { useLocalStorage } from '@/lib/hooks'
import { useApp, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
import { StatusIcon } from '@/components/tasks/status-icon'
import { FilePreview, fileTitle } from '@/components/vault/file-visual'
import { useAttachment } from '@/lib/queries/attachments'
import { useChatMessages, useChats } from '@/lib/queries/chats'
import { useTask } from '@/lib/queries/tasks'
import { useDateLocale } from '@/lib/dates'
import { assigneesOf } from '@/lib/assignees'
import { taskPath } from '@/lib/use-open-task'
import type { ChatMessageRow, MeetingInvite } from '@/lib/database.types'
import { cn } from '@/lib/utils'
import { previewOrOpen } from '@/components/vault/file-viewer'

/** El panel de contexto oculto o a la vista (se recuerda en este navegador). */
export function useChatContextHidden() {
  return useLocalStorage<boolean>('veltro:chat-context-hidden', false)
}

/** Botón de la cabecera del chat para ocultar o mostrar el panel (solo donde el panel cabe). */
export function ChatContextToggle() {
  const t = useTranslations('pasillo.context')
  const [hidden, setHidden] = useChatContextHidden()
  const label = hidden ? t('showPanel') : t('hidePanel')
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={() => setHidden(!hidden)}
        aria-label={label}
        aria-pressed={!hidden}
        className="hidden size-8 items-center justify-center rounded-lg text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/40 min-[1360px]:inline-flex [&_svg]:size-4"
      >
        {hidden ? <PanelRightOpen /> : <PanelRightClose />}
      </button>
    </Tooltip>
  )
}

/**
 * El contexto del chat abierto, sobre el marco a la derecha (desde 1360 px, para que el chat no se apriete): la próxima
 * reunión que se agendó aquí, las tareas y los archivos que se compartieron, y quién está.
 * Todo sale de los mensajes ya cargados del chat: no le pide nada nuevo al servidor.
 */
export function ChatContext({ chatId }: { chatId: string }) {
  const t = useTranslations('pasillo.context')
  const tp = useTranslations('pasillo')
  const { user } = useApp()
  const memberMap = useMemberMap()
  const { data: chats } = useChats({ fast: true })
  const { data: messages } = useChatMessages(chatId)
  const chat = chats?.find((c) => c.id === chatId)

  const { next, taskIds, fileIds } = useMemo(() => {
    const now = Date.now()
    const live = (messages ?? []).filter((m) => !m.deleted_at)
    const invites = live
      .flatMap((m) => (m.kind === 'meeting' && m.meta.invite && new Date(m.meta.invite.end).getTime() > now ? [m.meta.invite] : []))
      .sort((a, b) => a.start.localeCompare(b.start))
    // lo último compartido primero, sin repetir
    const shared = (kind: ChatMessageRow['kind']) => [...new Set(live.filter((m) => m.kind === kind && m.ref_id).map((m) => m.ref_id!).reverse())].slice(0, 4)
    return { next: invites[0], taskIds: shared('task'), fileIds: shared('file') }
  }, [messages])

  if (!chat) return null
  const people = chat.members.flatMap((m) => memberMap.get(m.user_id) ?? [])

  return (
    <aside className="on-frame hidden w-[288px] shrink-0 flex-col gap-6 overflow-y-auto pb-4 pl-4 pr-2 pt-1 scrollbar-thin min-[1360px]:flex">
      {next ? (
        <Section id="next" title={t('nextMeeting')}>
          <NextMeeting invite={next} />
        </Section>
      ) : null}
      {taskIds.length ? <Tasks ids={taskIds} /> : null}
      {fileIds.length ? (
        <Section id="files" title={t('files')} count={fileIds.length}>
          <div className="flex flex-col gap-1">
            {fileIds.map((id) => (
              <FileLine key={id} id={id} />
            ))}
          </div>
        </Section>
      ) : null}
      <Section id="people" title={t('people')} count={people.length}>
        <div className="flex flex-col gap-2">
          {people.map((p) => (
            <div key={p.id} className="flex items-center gap-2.5">
              <Avatar name={p.full_name} src={p.avatar_url} seed={p.id} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-fg">{p.id === user.id ? `${p.full_name} (${tp('you')})` : p.full_name}</span>
                {p.email ? <span className="block truncate text-[11.5px] text-fg-subtle">{p.email}</span> : null}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </aside>
  )
}

/** Una sección del panel: el título la pliega o despliega (se recuerda en este navegador). */
function Section({ id, title, count, children }: { id: string; title: string; count?: number; children: React.ReactNode }) {
  const t = useTranslations('pasillo.context')
  const [collapsed, setCollapsed] = useLocalStorage<string[]>('veltro:chat-context-collapsed', [])
  const open = !collapsed.includes(id)
  const bodyId = useId()
  return (
    <section>
      <h2>
        <button
          type="button"
          onClick={() => setCollapsed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))}
          aria-expanded={open}
          aria-controls={bodyId}
          title={open ? t('collapse') : t('expand')}
          className="group/sec -mx-1 mb-1.5 flex w-[calc(100%+0.5rem)] items-center gap-1.5 rounded-md px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/40"
        >
          <ChevronDown className={cn('size-3.5 shrink-0 transition-transform duration-200 ease-out', !open && '-rotate-90')} />
          {title}
          {count ? <span className="ml-auto font-mono text-xs font-medium normal-case tracking-normal text-accent-ink">{count}</span> : null}
        </button>
      </h2>
      <div id={bodyId} className="disclosure" data-open={open ? '' : undefined} inert={!open}>
        <div>{children}</div>
      </div>
    </section>
  )
}

/** La próxima reunión como un boleto crema: el día a la izquierda y lo demás al lado. */
function NextMeeting({ invite }: { invite: MeetingInvite }) {
  const t = useTranslations('pasillo.context')
  const tc = useTranslations('pasillo.cards')
  const locale = useDateLocale()
  const start = new Date(invite.start)
  const end = new Date(invite.end)
  const days = Math.max(0, differenceInCalendarDays(start, new Date()))
  return (
    <div className="on-sheet flex gap-3 rounded-[18px] bg-canvas p-3 shadow-[0_18px_30px_-20px_oklch(0.12_0.04_315/0.7)]">
      <span className="flex w-12 shrink-0 flex-col items-center justify-center self-stretch rounded-[12px] bg-accent py-1.5 text-accent-fg">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] opacity-80">{format(start, 'EEE', { locale })}</span>
        <span className="text-xl font-bold leading-tight">{format(start, 'd')}</span>
      </span>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-ink">{t('inDays', { count: days })}</p>
        <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-fg">{invite.title}</p>
        <p className="mt-0.5 text-xs tabular-nums text-fg-muted">
          {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
        </p>
        {invite.conferenceUrl ? (
          <a
            href={invite.conferenceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-xs font-medium text-accent-fg transition-colors hover:bg-accent-hover"
          >
            <Video className="size-3.5" />
            {tc('join')}
          </a>
        ) : null}
      </div>
    </div>
  )
}

/** Las tareas compartidas en el chat (las últimas cuatro); cada una se abre con un clic. */
function Tasks({ ids }: { ids: string[] }) {
  const t = useTranslations('pasillo.context')
  return (
    <Section id="tasks" title={t('tasks')} count={ids.length}>
      <div className="flex flex-col gap-0.5">
        {ids.map((id) => (
          <TaskLine key={id} id={id} />
        ))}
      </div>
    </Section>
  )
}

function TaskLine({ id }: { id: string }) {
  const { data: task } = useTask(id)
  const ws = useWorkspaceMap().get(task?.workspace_id ?? '')
  const memberMap = useMemberMap()
  const locale = useDateLocale()
  if (!task || !ws) return null
  const done = task.status === 'done'
  const who = assigneesOf(task)
    .flatMap((u) => memberMap.get(u)?.full_name.split(' ')[0] ?? [])
    .join(', ')
  return (
    <Link href={taskPath(ws.key, task.number)} className="-mx-2 flex items-start gap-2.5 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-hover">
      <StatusIcon status={task.status} className="mt-0.5 size-4" />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[13px] font-medium leading-snug', done ? 'text-fg-subtle line-through decoration-count/70' : 'text-fg')}>{task.title}</span>
        <span className="block truncate text-[11.5px] text-fg-subtle">
          {[who, task.due_date ? format(new Date(`${task.due_date}T12:00:00`), 'EEE d', { locale }) : null].filter(Boolean).join(' · ')}
        </span>
      </span>
    </Link>
  )
}

function FileLine({ id }: { id: string }) {
  const { data: file } = useAttachment(id)
  if (!file) return null
  return (
    <button type="button" onClick={() => previewOrOpen(file)} className="-mx-2 flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-colors hover:bg-hover">
      <span className="size-9 shrink-0 overflow-hidden rounded-[9px] bg-hover">
        <FilePreview a={file} className="size-full" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-fg">{fileTitle(file)}</span>
        <span className="block truncate text-[11.5px] text-fg-subtle">{file.name}</span>
      </span>
    </button>
  )
}
