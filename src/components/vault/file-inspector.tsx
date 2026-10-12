'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { formatDistanceToNowStrict, subDays, addDays } from 'date-fns'
import { ChevronDown, CircleCheck, Download, ExternalLink, FileText, LayoutGrid, MessageCircle, Search, Tag, Trash2, Video, X } from 'lucide-react'
import { canEdit, useApp, useIsAccountAdmin, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip } from '@/components/ui/tooltip'
import { LabelChip, LabelsPopover } from '@/components/tasks/pickers'
import { StatusIcon } from '@/components/tasks/status-icon'
import { formatBytes } from '@/components/attachments/attachments'
import { openAttachment, useAttachmentMutations } from '@/lib/queries/attachments'
import { useTasks } from '@/lib/queries/tasks'
import { useMeetingsInRange } from '@/lib/queries/meetings'
import { useDateLocale } from '@/lib/dates'
import { taskPath } from '@/lib/use-open-task'
import type { AttachmentRow } from '@/lib/database.types'
import { cn, taskRef } from '@/lib/utils'
import { FileKindIcon, FilePreview, fileKindOf, fileTitle } from './file-visual'
import { useConfirm } from '@/components/ui/confirm'

type Patch = Parameters<ReturnType<typeof useAttachmentMutations>['update']['mutate']>[0]['patch']

/**
 * Detalle de un archivo de la bóveda: se le pone título y etiquetas, y se vincula (o se suelta) de un
 * espacio, una tarea o una reunión. Todo se guarda al momento.
 */
export function FileInspector({ file, labelSuggestions, onClose, onShare }: { file: AttachmentRow; labelSuggestions: string[]; onClose: () => void; onShare: () => void }) {
  const t = useTranslations('vault')
  const locale = useDateLocale()
  const { workspaces, observedWorkspaces, user } = useApp()
  const wsMap = useWorkspaceMap()
  const memberMap = useMemberMap()
  const ws = file.workspace_id ? wsMap.get(file.workspace_id) : undefined
  // suelto: lo cambia quien lo subió o un administrador de la cuenta; de un espacio: quien puede editar ahí
  const admin = useIsAccountAdmin()
  const editable = file.workspace_id ? canEdit(ws) : file.uploaded_by === user.id || admin
  const { update, remove } = useAttachmentMutations()
  const set = (patch: Patch) => update.mutate({ id: file.id, patch })
  const confirm = useConfirm()
  const tConfirm = useTranslations('confirm')
  const [title, setTitle] = useState(file.title ?? '')
  const uploader = memberMap.get(file.uploaded_by ?? '')
  const editableWs = workspaces.filter((w) => canEdit(w))

  // tareas y reuniones a las que se puede vincular: las del espacio del archivo, o de todos si está suelto
  const wsIds = useMemo(() => [...workspaces, ...observedWorkspaces].map((w) => w.id), [workspaces, observedWorkspaces])
  const { data: tasks } = useTasks(editable ? { kind: 'workspaces', workspaceIds: file.workspace_id ? [file.workspace_id] : editableWs.map((w) => w.id) } : null)
  const range = useMemo(() => ({ from: subDays(new Date(), 90), to: addDays(new Date(), 60) }), [])
  const { data: meetings } = useMeetingsInRange(file.workspace_id ? [file.workspace_id] : wsIds, range.from, range.to)
  const task = file.task_id ? (tasks ?? []).find((x) => x.id === file.task_id) : undefined
  const meeting = file.meeting_id ? (meetings ?? []).find((m) => m.id === file.meeting_id) : undefined

  // al vincular a algo de otro espacio, lo que colgaba del espacio anterior se suelta
  const linkTask = (id: string) => {
    const target = (tasks ?? []).find((x) => x.id === id)
    const moves = target && target.workspace_id !== file.workspace_id
    set({ task_id: id, ...(moves ? { meeting_id: null, doc_id: null } : {}) })
  }
  const linkMeeting = (id: string) => {
    const target = (meetings ?? []).find((m) => m.id === id)
    const moves = target && target.workspace_id !== file.workspace_id
    set({ meeting_id: id, ...(moves ? { task_id: null, doc_id: null } : {}) })
  }
  const saveTitle = () => {
    const next = title.trim()
    if (next !== (file.title ?? '')) set({ title: next || null })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <FileKindIcon a={file} />
        <span className="text-xs font-medium text-fg-muted">{t(`kinds.${fileKindOf(file)}`)}</span>
        <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={onClose} aria-label={t('close')}>
          <X />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-5 scrollbar-thin">
        <button type="button" onClick={() => openAttachment(file)} className="block w-full overflow-hidden rounded-xl border border-line" aria-label={t('open')}>
          <FilePreview a={file} large className="h-36 w-full" />
        </button>

        {editable ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setTitle(file.title ?? '')
                e.currentTarget.blur()
              }
            }}
            placeholder={file.name}
            aria-label={t('titleLabel')}
            maxLength={200}
            className="-mx-2 mt-4 w-[calc(100%+1rem)] rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold leading-snug text-fg outline-none placeholder:text-fg-subtle hover:border-line focus:border-accent-mid"
          />
        ) : (
          <h2 className="mt-4 text-lg font-semibold leading-snug text-fg">{fileTitle(file)}</h2>
        )}
        <p className="mt-1 break-all text-xs text-fg-subtle">
          {file.kind === 'link' ? file.url : file.name}
          {file.size_bytes ? ` · ${formatBytes(file.size_bytes)}` : null}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-muted">
          {uploader ? <Avatar name={uploader.full_name} src={uploader.avatar_url} seed={uploader.id} size={16} /> : null}
          {t('uploadedBy', { who: uploader?.full_name ?? t('someone'), when: formatDistanceToNowStrict(new Date(file.created_at), { addSuffix: true, locale }) })}
        </p>

        <section className="mt-6">
          <h3 className="mb-2 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{t('labels')}</h3>
          {editable ? (
            <LabelsPopover
              value={file.labels}
              suggestions={labelSuggestions}
              onChange={(labels) => set({ labels })}
              className="h-auto min-h-8 w-full flex-wrap justify-start gap-1 rounded-lg border border-dashed border-line px-2 py-1 hover:border-line-strong"
            >
              {file.labels.length ? (
                file.labels.map((l) => <LabelChip key={l} label={l} />)
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-fg-subtle">
                  <Tag className="size-3.5" />
                  {t('addLabels')}
                </span>
              )}
            </LabelsPopover>
          ) : (
            <div className="flex flex-wrap gap-1">
              {file.labels.length ? file.labels.map((l) => <LabelChip key={l} label={l} />) : <span className="text-sm text-fg-subtle">—</span>}
            </div>
          )}
        </section>

        <section className="mt-6">
          <h3 className="mb-1 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{t('linkedTo')}</h3>
          <p className="mb-2 text-xs text-fg-subtle">{t('linkedHint')}</p>
          <dl className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 text-sm">
            <dt className="text-fg-muted">{t('space')}</dt>
            <dd className="min-w-0">
              {editable ? (
                <Menu>
                  <MenuTrigger className={linkTrigger}>
                    {ws ? <WorkspaceMark ws={ws} size={16} /> : <LayoutGrid className="size-4 text-fg-subtle" />}
                    <span className={cn('truncate', !ws && 'text-fg-subtle')}>{ws?.name ?? t('noSpace')}</span>
                    <ChevronDown className="ml-auto size-3.5 text-fg-subtle" />
                  </MenuTrigger>
                  <MenuContent className="w-56">
                    <MenuRadioGroup
                      value={file.workspace_id ?? 'none'}
                      onValueChange={(v) => {
                        const next = v === 'none' ? null : String(v)
                        if (next !== file.workspace_id) set({ workspace_id: next, task_id: null, meeting_id: null, doc_id: null })
                      }}
                    >
                      <MenuRadioItem value="none" closeOnClick>
                        <LayoutGrid />
                        {t('noSpace')}
                      </MenuRadioItem>
                      <MenuSeparator />
                      {editableWs.map((w) => (
                        <MenuRadioItem key={w.id} value={w.id} closeOnClick>
                          <WorkspaceMark ws={w} size={16} />
                          {w.name}
                        </MenuRadioItem>
                      ))}
                    </MenuRadioGroup>
                  </MenuContent>
                </Menu>
              ) : (
                <span className="flex h-8 items-center gap-2">
                  {ws ? <WorkspaceMark ws={ws} size={16} /> : null}
                  {ws?.name ?? t('noSpace')}
                </span>
              )}
            </dd>

            <dt className="text-fg-muted">{t('task')}</dt>
            <dd className="min-w-0">
              <LinkedValue
                editable={editable}
                current={
                  task && ws ? (
                    <Link href={taskPath(ws.key, task.number)} className="flex min-w-0 items-center gap-1.5 hover:underline">
                      <StatusIcon status={task.status} />
                      <span className="shrink-0 font-mono text-xs text-fg-subtle">{taskRef(ws.key, task.number)}</span>
                      <span className="truncate">{task.title}</span>
                    </Link>
                  ) : file.task_id ? (
                    <span className="text-fg-subtle">{t('linked')}</span>
                  ) : null
                }
                placeholder={t('linkTask')}
                icon={<CircleCheck className="size-4 text-fg-subtle" />}
                items={(tasks ?? [])
                  .filter((x) => x.status !== 'done' || x.id === file.task_id)
                  .map((x) => {
                    const w = wsMap.get(x.workspace_id)
                    return { id: x.id, label: x.title, sub: w ? `${taskRef(w.key, x.number)} · ${w.name}` : '', icon: <StatusIcon status={x.status} /> }
                  })}
                onPick={linkTask}
                onClear={() => set({ task_id: null })}
                searchPlaceholder={t('searchTasks')}
              />
            </dd>

            <dt className="text-fg-muted">{t('meeting')}</dt>
            <dd className="min-w-0">
              <LinkedValue
                editable={editable}
                current={
                  meeting ? (
                    <Link href={`/m/${meeting.id}`} className="flex min-w-0 items-center gap-1.5 hover:underline">
                      <Video className="size-3.5 shrink-0 text-accent-mid" />
                      <span className="truncate">{meeting.title}</span>
                    </Link>
                  ) : file.meeting_id ? (
                    <span className="text-fg-subtle">{t('linked')}</span>
                  ) : null
                }
                placeholder={t('linkMeeting')}
                icon={<Video className="size-4 text-fg-subtle" />}
                items={(meetings ?? []).map((m) => ({
                  id: m.id,
                  label: m.title || t('untitledMeeting'),
                  sub: `${new Date(m.starts_at).toLocaleDateString(locale.code, { day: 'numeric', month: 'short' })} · ${wsMap.get(m.workspace_id)?.name ?? ''}`,
                  icon: <Video className="size-3.5 text-accent-mid" />,
                }))}
                onPick={linkMeeting}
                onClear={() => set({ meeting_id: null })}
                searchPlaceholder={t('searchMeetings')}
              />
            </dd>

            {file.doc_id && ws ? (
              <>
                <dt className="text-fg-muted">{t('doc')}</dt>
                <dd className="min-w-0">
                  <Link href={`/w/${ws.slug}/docs/${file.doc_id}`} className="flex h-8 min-w-0 items-center gap-1.5 hover:underline">
                    <FileText className="size-3.5 shrink-0 text-fg-subtle" />
                    <span className="truncate">{t('openDoc')}</span>
                  </Link>
                </dd>
              </>
            ) : null}
          </dl>
        </section>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-t border-line p-3">
        <Button size="sm" onClick={() => openAttachment(file)}>
          {file.kind === 'link' ? <ExternalLink /> : <Download />}
          {file.kind === 'link' ? t('openLink') : t('open')}
        </Button>
        <Button variant="primary" size="sm" onClick={onShare}>
          <MessageCircle />
          {t('share')}
        </Button>
        {editable ? (
          <Tooltip content={t('delete')}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto text-fg-muted hover:text-danger"
              aria-label={t('delete')}
              onClick={async () => {
                if (!(await confirm({ title: t('deleteConfirm', { name: fileTitle(file) }), danger: true, confirmLabel: tConfirm('delete') }))) return
                remove.mutate(file)
                onClose()
              }}
            >
              <Trash2 />
            </Button>
          </Tooltip>
        ) : null}
      </div>
    </div>
  )
}

export const linkTrigger =
  'flex h-8 w-full min-w-0 items-center gap-2 rounded-lg border border-transparent px-2 text-left text-sm outline-none hover:border-line hover:bg-hover/60 focus-visible:ring-2 focus-visible:ring-accent-mid/40 data-[popup-open]:border-line data-[popup-open]:bg-hover/60'

export type PickItem = { id: string; label: string; sub: string; icon: React.ReactNode }

/** Vínculo a una tarea o reunión: muestra el actual y abre un buscador para elegir otro o soltarlo. */
export function LinkedValue({
  editable,
  current,
  placeholder,
  icon,
  items,
  onPick,
  onClear,
  searchPlaceholder,
}: {
  editable: boolean
  current: React.ReactNode
  placeholder: string
  icon: React.ReactNode
  items: PickItem[]
  onPick: (id: string) => void
  onClear: () => void
  searchPlaceholder: string
}) {
  const t = useTranslations('vault')
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const shown = (needle ? items.filter((i) => i.label.toLowerCase().includes(needle) || i.sub.toLowerCase().includes(needle)) : items).slice(0, 50)
  if (!editable) return <span className="flex h-8 min-w-0 items-center">{current ?? <span className="text-fg-subtle">—</span>}</span>
  return (
    <div className="flex min-w-0 items-center gap-1">
      {current ? <span className="flex h-8 min-w-0 flex-1 items-center px-2">{current}</span> : null}
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setQ('')
        }}
      >
        <PopoverTrigger
          className={current ? 'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg' : linkTrigger}
          aria-label={placeholder}
        >
          {current ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <>
              {icon}
              <span className="truncate text-fg-subtle">{placeholder}</span>
            </>
          )}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-1">
          <div className="flex items-center gap-2 border-b border-line px-2 pb-1">
            <Search className="size-3.5 shrink-0 text-fg-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              autoFocus
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle"
            />
          </div>
          <div className="max-h-64 overflow-y-auto pt-1 scrollbar-thin">
            {shown.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => {
                  onPick(i.id)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-hover"
              >
                <span className="flex shrink-0">{i.icon}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-fg">{i.label}</span>
                  {i.sub ? <span className="truncate text-2xs text-fg-subtle">{i.sub}</span> : null}
                </span>
              </button>
            ))}
            {shown.length === 0 ? <p className="px-2 py-2 text-sm text-fg-subtle">{t('noResults')}</p> : null}
          </div>
          {current ? (
            <div className="border-t border-line pt-1">
              <MenuLikeButton
                onClick={() => {
                  onClear()
                  setOpen(false)
                }}
              >
                <X className="size-3.5" />
                {t('unlink')}
              </MenuLikeButton>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}

function MenuLikeButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-fg-muted hover:bg-hover hover:text-fg">
      {children}
    </button>
  )
}
