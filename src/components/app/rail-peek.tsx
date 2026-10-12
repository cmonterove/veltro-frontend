'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { PreviewCard } from '@base-ui/react/preview-card'
import { endOfDay, format, startOfDay } from 'date-fns'
import { FileText, ListTodo, Video, type LucideIcon } from 'lucide-react'
import { useApp } from './app-context'
import { WorkspaceMark } from './marks'
import { ChatAvatar, useChatName, useChatPreview } from '@/components/chat/chat-bits'
import { FileKindIcon, fileTitle } from '@/components/vault/file-visual'
import { Kbd } from '@/components/ui/kbd'
import { useChats } from '@/lib/queries/chats'
import { useTasks } from '@/lib/queries/tasks'
import { useMeetingsInRange } from '@/lib/queries/meetings'
import { useVaultFiles } from '@/lib/queries/attachments'
import { isAssignedTo } from '@/lib/assignees'
import { matchesCounter, type Counter } from '@/lib/scope'
import { cn } from '@/lib/utils'
import type { TaskRow } from '@/lib/database.types'
import type { WorkspaceWithRole } from '@/lib/types'

/**
 * Tarjeta que asoma al pasar el cursor por un ícono del riel colapsado: qué es esa sección y cómo
 * está, sin entrar. Se puede pasar el cursor a la tarjeta y usar sus enlaces.
 */
export function RailPeek({ trigger, children }: { trigger: React.ReactElement<Record<string, unknown>>; children: React.ReactNode }) {
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger render={trigger} delay={250} closeDelay={150} />
      <PreviewCard.Portal>
        <PreviewCard.Positioner side="right" align="start" sideOffset={10} alignOffset={-6} className="z-[60]">
          <PreviewCard.Popup className="popup-motion w-64 overflow-hidden rounded-xl border border-line bg-panel text-sm text-fg shadow-popover outline-none">
            {children}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  )
}

/** Cabecera de la tarjeta: ícono, nombre, atajo y para qué sirve. */
export function PeekHead({ icon: Icon, label, keys, description }: { icon: LucideIcon; label: string; keys?: string[]; description?: string }) {
  return (
    <div className="px-3 pb-2.5 pt-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-accent-ink" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-semibold">{label}</span>
        {keys ? (
          <span className="flex shrink-0 gap-0.5">
            {keys.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </span>
        ) : null}
      </div>
      {description ? <p className="mt-1 text-xs leading-snug text-fg-muted">{description}</p> : null}
    </div>
  )
}

/** Lo que trae cada sección del riel debajo de la cabecera. */
export function NavPeekBody({ href }: { href: string }) {
  switch (href) {
    case '/home':
      return <TodayPeek />
    case '/mesa':
      return <TeamPeek />
    case '/calendar':
      return <MeetingsPeek />
    case '/tasks':
      return <MyTasksPeek />
    case '/vault':
      return <VaultPeek />
    case '/chat':
      return <ChatsPeek />
    default:
      return null
  }
}

/** Tarjeta de un espacio: su nombre, cómo van sus tareas y atajos a sus secciones. */
export function WorkspacePeek({ ws }: { ws: WorkspaceWithRole }) {
  const t = useTranslations('nav')
  const tp = useTranslations('nav.peek')
  const { data } = useTasks({ kind: 'workspace', workspaceId: ws.id })
  const stats = useCounts(data)
  const base = `/w/${ws.slug}`
  const links = [
    { href: `${base}/tasks`, label: t('tasks'), icon: ListTodo },
    { href: `${base}/docs`, label: t('docs'), icon: FileText },
    { href: `${base}/meetings`, label: t('meetings'), icon: Video },
  ]
  return (
    <>
      <Link href={base} className="flex items-center gap-2.5 px-3 pb-2.5 pt-3 hover:bg-hover/60">
        <WorkspaceMark ws={ws} size={22} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{ws.name}</span>
          <span className="block truncate text-xs text-fg-muted">{tp('workspace')}</span>
        </span>
      </Link>
      <Stats
        items={[
          { value: stats?.open, label: tp('stat.open', { count: stats?.open ?? 0 }) },
          { value: stats?.in_progress, label: tp('stat.inProgress') },
          { value: stats?.overdue, label: tp('stat.overdue', { count: stats?.overdue ?? 0 }), danger: true },
        ]}
      />
      <div className="border-t border-line p-1">
        {links.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex h-8 items-center gap-2 rounded-md px-2 text-fg-muted hover:bg-hover hover:text-fg">
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        ))}
      </div>
    </>
  )
}

// --- cada sección ---

function TodayPeek() {
  const tp = useTranslations('nav.peek')
  const stats = useCounts(useMyTasks())
  const meetings = useTodayMeetings()
  return (
    <Stats
      items={[
        { value: stats?.overdue, label: tp('stat.overdue', { count: stats?.overdue ?? 0 }), danger: true },
        { value: stats?.today, label: tp('stat.today') },
        { value: meetings?.length, label: tp('stat.meetings', { count: meetings?.length ?? 0 }) },
      ]}
    />
  )
}

function MyTasksPeek() {
  const tp = useTranslations('nav.peek')
  const stats = useCounts(useMyTasks())
  return (
    <Stats
      items={[
        { value: stats?.open, label: tp('stat.open', { count: stats?.open ?? 0 }) },
        { value: stats?.in_progress, label: tp('stat.inProgress') },
        { value: stats?.overdue, label: tp('stat.overdue', { count: stats?.overdue ?? 0 }), danger: true },
      ]}
    />
  )
}

function TeamPeek() {
  const tp = useTranslations('nav.peek')
  const stats = useCounts(useAllTasks())
  return (
    <Stats
      items={[
        { value: stats?.in_progress, label: tp('stat.inProgress') },
        { value: stats?.blocked, label: tp('stat.blocked', { count: stats?.blocked ?? 0 }), danger: true },
        { value: stats?.overdue, label: tp('stat.overdue', { count: stats?.overdue ?? 0 }), danger: true },
      ]}
    />
  )
}

function MeetingsPeek() {
  const tp = useTranslations('nav.peek')
  const meetings = useTodayMeetings()
  if (!meetings) return <PeekLoading />
  // las que faltan hoy (y la que está en curso), en orden
  const now = Date.now()
  const left = meetings
    .filter((m) => new Date(m.ends_at ?? m.starts_at).getTime() + (m.ends_at ? 0 : 3_600_000) > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  return (
    <PeekSection title={tp('todayLeft')}>
      {left.length ? (
        left.slice(0, 3).map((m) => {
          const live = new Date(m.starts_at).getTime() <= now
          return (
            <Link key={m.id} href={`/m/${m.id}`} className="flex h-8 items-center gap-2.5 rounded-md px-2 hover:bg-hover">
              <span className={cn('w-10 shrink-0 font-mono text-xs tabular-nums', live ? 'font-semibold text-accent-ink' : 'text-fg-subtle')}>
                {live ? tp('now') : format(new Date(m.starts_at), 'HH:mm')}
              </span>
              <span className="min-w-0 flex-1 truncate">{m.title}</span>
            </Link>
          )
        })
      ) : (
        <PeekEmpty>{tp('noMeetings')}</PeekEmpty>
      )}
      {left.length > 3 ? <p className="px-2 pb-1 pt-0.5 text-xs text-fg-subtle">{tp('more', { count: left.length - 3 })}</p> : null}
    </PeekSection>
  )
}

function VaultPeek() {
  const tp = useTranslations('nav.peek')
  const { data } = useVaultFiles()
  if (!data) return <PeekLoading />
  return (
    <PeekSection title={tp('files', { count: data.length })}>
      {data.slice(0, 3).map((a) => (
        <Link key={a.id} href={`/vault?file=${a.id}`} className="flex h-8 items-center gap-2 rounded-md px-2 hover:bg-hover">
          <FileKindIcon a={a} />
          <span className="min-w-0 flex-1 truncate">{fileTitle(a)}</span>
        </Link>
      ))}
    </PeekSection>
  )
}

function ChatsPeek() {
  const tp = useTranslations('nav.peek')
  const { data: chats } = useChats()
  const chatName = useChatName()
  const preview = useChatPreview()
  if (!chats) return <PeekLoading />
  const unread = chats.filter((c) => c.unread > 0)
  return (
    <PeekSection title={unread.length ? tp('unread', { count: unread.length }) : undefined}>
      {unread.length ? (
        unread.slice(0, 3).map((c) => (
          <Link key={c.id} href={`/chat/${c.id}`} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-hover">
            <ChatAvatar chat={c} size={26} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{chatName(c)}</span>
              <span className="block truncate text-xs text-fg-muted">{preview(c.last)}</span>
            </span>
            <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent px-1 text-2xs font-semibold tabular-nums text-accent-fg">
              {c.unread}
            </span>
          </Link>
        ))
      ) : (
        <PeekEmpty>{tp('allRead')}</PeekEmpty>
      )}
    </PeekSection>
  )
}

// --- piezas ---

/** Tres cifras en fila; las de alerta solo se tiñen si no son cero. */
function Stats({ items }: { items: { value: number | undefined; label: string; danger?: boolean }[] }) {
  return (
    <div className="grid grid-cols-3 divide-x divide-line border-t border-line">
      {items.map((s) => (
        <div key={s.label} className="flex min-w-0 flex-col px-3 py-2">
          <span className={cn('text-base font-semibold tabular-nums leading-tight', s.value == null ? 'text-fg-subtle' : s.danger && s.value > 0 ? 'text-danger' : 'text-fg')}>
            {s.value ?? '·'}
          </span>
          <span className="truncate text-2xs text-fg-muted">{s.label}</span>
        </div>
      ))}
    </div>
  )
}

function PeekSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line p-1">
      {title ? <p className="px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{title}</p> : null}
      {children}
    </div>
  )
}

function PeekEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-1.5 text-xs text-fg-muted">{children}</p>
}

function PeekLoading() {
  return (
    <div className="border-t border-line p-3">
      <div className="h-4 w-2/3 animate-pulse rounded bg-hover" />
    </div>
  )
}

// --- datos (los mismos cachés que usan las vistas, así la tarjeta sale al instante si ya pasaste por ahí) ---

function useWsIds() {
  const { workspaces, observedWorkspaces } = useApp()
  return useMemo(() => [...workspaces, ...observedWorkspaces].map((w) => w.id), [workspaces, observedWorkspaces])
}

function useAllTasks() {
  const wsIds = useWsIds()
  return useTasks(wsIds.length ? { kind: 'workspaces', workspaceIds: wsIds } : null).data
}

function useMyTasks() {
  const { user } = useApp()
  const all = useAllTasks()
  return useMemo(() => all?.filter((x) => isAssignedTo(x, user.id)), [all, user.id])
}

function useCounts(tasks: TaskRow[] | undefined) {
  return useMemo(() => {
    if (!tasks) return null
    const now = new Date()
    const count = (c: Counter) => tasks.filter((x) => matchesCounter(x, c, now)).length
    return {
      open: tasks.filter((x) => x.status !== 'done').length,
      overdue: count('overdue'),
      today: count('today'),
      in_progress: count('in_progress'),
      blocked: count('blocked'),
    }
  }, [tasks])
}

function useTodayMeetings() {
  const wsIds = useWsIds()
  const [from, to] = useMemo(() => [startOfDay(new Date()), endOfDay(new Date())], [])
  return useMeetingsInRange(wsIds, from, to).data
}
