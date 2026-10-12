'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { Command } from 'cmdk'
import { Dialog as D } from '@base-ui/react/dialog'
import { useQuery } from '@tanstack/react-query'
import { Activity, CalendarDays, CalendarPlus, CircleCheck, Columns3, Diamond, FilePlus2, FileText, Keyboard, Languages, ListTodo, MessagesSquare, Moon, PanelLeftClose, PanelLeftOpen, Search, Settings, Sparkles, SquarePen, Sun, Vault, Video } from 'lucide-react'
import { format } from 'date-fns'
import { Kbd } from '@/components/ui/kbd'
import { useDateLocale } from '@/lib/dates'
import { useApp, canEdit } from './app-context'
import { createClient } from '@/lib/supabase/client'
import { useCreateDoc } from '@/lib/queries/docs'
import { cn, positionBetween, taskRef } from '@/lib/utils'
import { taskPath } from '@/lib/use-open-task'
import { StatusIcon } from '@/components/tasks/status-icon'
import type { TaskStatus } from '@/lib/database.types'
import { DocMark, WorkspaceMark } from '@/components/app/marks'
import { ChatAvatar, useChatName } from '@/components/chat/chat-bits'
import { FileKindIcon, fileTitle } from '@/components/vault/file-visual'
import { useVaultFiles } from '@/lib/queries/attachments'
import { useChats } from '@/lib/queries/chats'
import { setLocale } from '@/app/actions/preferences'
import { localeNames, locales } from '@/i18n/config'

const groupClass =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-subtle'
const itemClass =
  'mx-1.5 flex h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-sm text-fg data-[selected=true]:bg-hover [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-muted'

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

export function CommandPalette({
  open,
  onOpenChange,
  onNewTask,
  onShortcuts,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onNewTask: () => void
  onShortcuts: () => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}) {
  const t = useTranslations('command')
  const tNav = useTranslations('nav')
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const appLocale = useLocale()
  const [, startLocale] = useTransition()
  const { workspaces } = useApp()
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim(), 180)
  const wsIds = useMemo(() => workspaces.map((w) => w.id), [workspaces])
  const wsById = useMemo(() => new Map(workspaces.map((w) => [w.id, w])), [workspaces])
  const createDoc = useCreateDoc()
  const locale = useDateLocale()

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const { data: results } = useQuery({
    queryKey: ['search', q, wsIds],
    enabled: open && q.length >= 2 && wsIds.length > 0,
    staleTime: 10_000,
    queryFn: async () => {
      const supabase = createClient()
      const like = `%${q.replace(/[%_]/g, '\\$&')}%`
      const num = q.match(/^([a-z0-9]{2,5})-(\d+)$/i)
      const [tasks, docs, meetings, decisions] = await Promise.all([
        num
          ? supabase.from('tasks').select('id, title, status, number, workspace_id').in('workspace_id', wsIds).eq('number', Number(num[2])).limit(8)
          : supabase.from('tasks').select('id, title, status, number, workspace_id').in('workspace_id', wsIds).ilike('title', like).order('updated_at', { ascending: false }).limit(8),
        supabase
          .from('docs')
          .select('id, title, source, workspace_id')
          .in('workspace_id', wsIds)
          .is('archived_at', null)
          .or(`title.ilike.${like},content_text.ilike.${like}`)
          .order('updated_at', { ascending: false })
          .limit(8),
        supabase.from('meetings').select('id, title, starts_at, phase, workspace_id').in('workspace_id', wsIds).ilike('title', like).order('starts_at', { ascending: false }).limit(6),
        supabase.from('meeting_items').select('id, text, meeting_id, workspace_id').in('workspace_id', wsIds).eq('kind', 'decision').ilike('text', like).order('created_at', { ascending: false }).limit(5),
      ])
      return { tasks: tasks.data ?? [], docs: docs.data ?? [], meetings: meetings.data ?? [], decisions: decisions.data ?? [] }
    },
  })

  // la bóveda y Pasillo ya están en caché: se filtran aquí mismo
  const { data: vault } = useVaultFiles(open)
  const { data: chats } = useChats()
  const chatName = useChatName()
  const needle = q.toLowerCase()
  const fileHits =
    q.length >= 2
      ? (vault ?? []).filter((f) => fileTitle(f).toLowerCase().includes(needle) || f.name.toLowerCase().includes(needle) || f.labels.some((l) => l.toLowerCase().includes(needle))).slice(0, 6)
      : []
  const chatHits = q.length >= 2 ? (chats ?? []).filter((c) => chatName(c).toLowerCase().includes(needle)).slice(0, 5) : []

  const go = (href: string) => {
    onOpenChange(false)
    router.push(href)
  }

  const nav = [
    { label: tNav('today'), icon: Activity, href: '/home', keys: ['G', 'H'] },
    { label: tNav('veltro'), icon: Sparkles, href: '/veltro', keys: ['G', 'V'] },
    { label: tNav('mesa'), icon: Columns3, href: '/mesa', keys: ['G', 'M'] },
    { label: tNav('calendar'), icon: CalendarDays, href: '/calendar', keys: ['G', 'C'] },
    { label: tNav('myTasks'), icon: CircleCheck, href: '/tasks', keys: ['G', 'T'] },
    { label: tNav('vault'), icon: Vault, href: '/vault', keys: ['G', 'B'] },
    { label: tNav('pasillo'), icon: MessagesSquare, href: '/chat', keys: ['G', 'P'] },
    { label: tNav('settings'), icon: Settings, href: '/settings', keys: null },
  ]

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Backdrop className="backdrop-motion fixed inset-0 z-50 bg-[oklch(0.2_0.01_165/0.25)] dark:bg-[oklch(0_0_0/0.5)]" />
        <D.Popup className="popup-motion fixed left-1/2 top-[14vh] z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-panel shadow-lift outline-none">
          <D.Title className="sr-only">{t('title')}</D.Title>
          <Command loop className="flex flex-col">
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search className="size-4 text-fg-subtle" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={t('placeholder')}
                className="h-12 flex-1 bg-transparent text-base outline-none placeholder:text-fg-subtle"
                autoFocus
              />
            </div>
            <Command.List className="max-h-[min(420px,60vh)] overflow-y-auto pb-1.5 scrollbar-thin">
              <Command.Empty className="px-4 py-8 text-center text-sm text-fg-muted">{t('empty')}</Command.Empty>

              {results?.tasks.length ? (
                <Command.Group heading={t('tasks')} className={groupClass}>
                  {results.tasks.map((task) => {
                    const ws = wsById.get(task.workspace_id)
                    return (
                      <Command.Item key={task.id} value={`task ${task.id} ${task.title}`} keywords={[query]} onSelect={() => go(ws ? taskPath(ws.key, task.number) : `/tasks/${task.id}`)} className={itemClass}>
                        <StatusIcon status={task.status as TaskStatus} />
                        <span className="w-16 shrink-0 font-mono text-xs text-fg-subtle">{ws ? taskRef(ws.key, task.number) : ''}</span>
                        <span className="truncate">{task.title}</span>
                      </Command.Item>
                    )
                  })}
                </Command.Group>
              ) : null}

              {results?.docs.length ? (
                <Command.Group heading={t('docs')} className={groupClass}>
                  {results.docs.map((doc) => {
                    const ws = wsById.get(doc.workspace_id)
                    return (
                      <Command.Item key={doc.id} value={`doc ${doc.id} ${doc.title}`} keywords={[query]} onSelect={() => go(`/w/${ws?.slug}/docs/${doc.id}`)} className={itemClass}>
                        <DocMark source={doc.source as never} />
                        <span className="truncate">{doc.title || t('untitled')}</span>
                        <span className="ml-auto truncate text-xs text-fg-subtle">{ws?.name}</span>
                      </Command.Item>
                    )
                  })}
                </Command.Group>
              ) : null}

              {fileHits.length ? (
                <Command.Group heading={t('files')} className={groupClass}>
                  {fileHits.map((f) => (
                    <Command.Item key={f.id} value={`file ${f.id} ${fileTitle(f)}`} keywords={[query]} onSelect={() => go(`/vault?file=${f.id}`)} className={itemClass}>
                      <FileKindIcon a={f} />
                      <span className="truncate">{fileTitle(f)}</span>
                      <span className="ml-auto truncate text-xs text-fg-subtle">{f.workspace_id ? wsById.get(f.workspace_id)?.name : t('vaultLoose')}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {chatHits.length ? (
                <Command.Group heading={t('chats')} className={groupClass}>
                  {chatHits.map((c) => (
                    <Command.Item key={c.id} value={`chat ${c.id} ${chatName(c)}`} keywords={[query]} onSelect={() => go(`/chat/${c.id}`)} className={itemClass}>
                      <ChatAvatar chat={c} size={18} />
                      <span className="truncate">{chatName(c)}</span>
                      {c.unread ? <span className="ml-auto rounded-full bg-accent px-1.5 text-2xs font-semibold text-accent-fg">{c.unread}</span> : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {results?.meetings.length ? (
                <Command.Group heading={t('meetings')} className={groupClass}>
                  {results.meetings.map((m) => {
                    const ws = wsById.get(m.workspace_id)
                    return (
                      <Command.Item key={m.id} value={`meeting ${m.id} ${m.title}`} keywords={[query]} onSelect={() => go(`/m/${m.id}`)} className={itemClass}>
                        <Video />
                        <span className="truncate">{m.title}</span>
                        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-fg-subtle">
                          {format(new Date(m.starts_at), 'd MMM', { locale })}
                          {ws ? <WorkspaceMark ws={ws} size={14} /> : null}
                        </span>
                      </Command.Item>
                    )
                  })}
                </Command.Group>
              ) : null}

              {results?.decisions.length ? (
                <Command.Group heading={t('decisions')} className={groupClass}>
                  {results.decisions.map((d) => (
                    <Command.Item key={d.id} value={`decision ${d.id} ${d.text}`} keywords={[query]} onSelect={() => go(`/m/${d.meeting_id}`)} className={itemClass}>
                      <Diamond className="!text-k-decision" />
                      <span className="truncate">{d.text}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              <Command.Group heading={t('actions')} className={groupClass}>
                <Command.Item
                  value={t('newTask')}
                  onSelect={() => {
                    onOpenChange(false)
                    onNewTask()
                  }}
                  className={itemClass}
                >
                  <SquarePen />
                  {t('newTask')}
                  <Kbd className="ml-auto">C</Kbd>
                </Command.Item>
                <Command.Item value={t('newMeeting')} onSelect={() => go('/calendar?new=1')} className={itemClass}>
                  <CalendarPlus />
                  {t('newMeeting')}
                </Command.Item>
                <Command.Item
                  value={resolvedTheme === 'dark' ? tNav('themeToLight') : tNav('themeToDark')}
                  keywords={[tNav('theme'), tNav('themeLight'), tNav('themeDark')]}
                  onSelect={() => {
                    onOpenChange(false)
                    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
                  }}
                  className={itemClass}
                >
                  {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
                  {resolvedTheme === 'dark' ? tNav('themeToLight') : tNav('themeToDark')}
                </Command.Item>
                {locales
                  .filter((l) => l !== appLocale)
                  .map((l) => (
                    <Command.Item
                      key={`locale-${l}`}
                      value={tNav('switchLanguage', { language: localeNames[l] })}
                      keywords={[tNav('language'), 'language', 'idioma', l]}
                      onSelect={() => {
                        onOpenChange(false)
                        startLocale(() => setLocale(l))
                      }}
                      className={itemClass}
                    >
                      <Languages />
                      {tNav('switchLanguage', { language: localeNames[l] })}
                    </Command.Item>
                  ))}
                <Command.Item
                  value={sidebarCollapsed ? tNav('sidebarExpand') : tNav('sidebarCollapse')}
                  onSelect={() => {
                    onOpenChange(false)
                    onToggleSidebar()
                  }}
                  className={cn(itemClass, 'max-md:hidden')}
                >
                  {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
                  {sidebarCollapsed ? tNav('sidebarExpand') : tNav('sidebarCollapse')}
                  <Kbd className="ml-auto">[</Kbd>
                </Command.Item>
                {workspaces.filter((w) => canEdit(w)).map((w) => (
                  <Command.Item
                    key={`newdoc-${w.id}`}
                    value={`${t('newDocIn', { workspace: w.name })}`}
                    onSelect={() =>
                      createDoc.mutate(
                        { workspace_id: w.id, title: '', source: 'manual', position: positionBetween(Date.now() / 1000, null) },
                        { onSuccess: (doc) => go(`/w/${w.slug}/docs/${doc.id}`) },
                      )
                    }
                    className={itemClass}
                  >
                    <FilePlus2 />
                    {t('newDocIn', { workspace: w.name })}
                  </Command.Item>
                ))}
              </Command.Group>

              <Command.Group heading={t('navigation')} className={groupClass}>
                {nav.map(({ label, icon: Icon, href, keys }) => (
                  <Command.Item key={href} value={label} onSelect={() => go(href)} className={itemClass}>
                    <Icon />
                    {label}
                    {keys ? (
                      <span className="ml-auto flex gap-1">
                        {keys.map((k) => (
                          <Kbd key={k}>{k}</Kbd>
                        ))}
                      </span>
                    ) : null}
                  </Command.Item>
                ))}
                <Command.Item
                  value={t('shortcuts')}
                  onSelect={() => {
                    onOpenChange(false)
                    onShortcuts()
                  }}
                  className={itemClass}
                >
                  <Keyboard />
                  {t('shortcuts')}
                  <Kbd className="ml-auto">?</Kbd>
                </Command.Item>
              </Command.Group>

              <Command.Group heading={t('workspaces')} className={groupClass}>
                {workspaces.flatMap((w) => [
                  <Command.Item key={`${w.id}-tasks`} value={`${w.name} ${tNav('tasks')}`} onSelect={() => go(`/w/${w.slug}/tasks`)} className={itemClass}>
                    <ListTodo />
                    <WorkspaceMark ws={w} size={14} />
                    {w.name}
                    <span className="text-fg-subtle">/ {tNav('tasks')}</span>
                  </Command.Item>,
                  <Command.Item key={`${w.id}-docs`} value={`${w.name} ${tNav('docs')}`} onSelect={() => go(`/w/${w.slug}/docs`)} className={itemClass}>
                    <FileText />
                    <WorkspaceMark ws={w} size={14} />
                    {w.name}
                    <span className="text-fg-subtle">/ {tNav('docs')}</span>
                  </Command.Item>,
                  <Command.Item key={`${w.id}-meet`} value={`${w.name} ${tNav('meetings')}`} onSelect={() => go(`/w/${w.slug}/meetings`)} className={itemClass}>
                    <Video />
                    <WorkspaceMark ws={w} size={14} />
                    {w.name}
                    <span className="text-fg-subtle">/ {tNav('meetings')}</span>
                  </Command.Item>,
                ])}
              </Command.Group>
            </Command.List>
          </Command>
        </D.Popup>
      </D.Portal>
    </D.Root>
  )
}
