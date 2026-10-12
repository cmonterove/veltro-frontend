'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { addDays, subDays } from 'date-fns'
import { ChevronDown, CircleCheck, LayoutGrid, Link2, Tag, UploadCloud, Video, X } from 'lucide-react'
import { canEdit, useApp, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { LabelChip, LabelsPopover } from '@/components/tasks/pickers'
import { StatusIcon } from '@/components/tasks/status-icon'
import { formatBytes } from '@/components/attachments/attachments'
import { MAX_FILE_BYTES, useAttachmentMutations } from '@/lib/queries/attachments'
import { useTasks } from '@/lib/queries/tasks'
import { useMeetingsInRange } from '@/lib/queries/meetings'
import { useDateLocale } from '@/lib/dates'
import { taskPath } from '@/lib/use-open-task'
import type { AttachmentRow } from '@/lib/database.types'
import { cn, taskRef } from '@/lib/utils'
import { FileKindIcon } from './file-visual'
import { LinkedValue, linkTrigger } from './file-inspector'

export type UploadMode = 'files' | 'link'
type Item = { id: string; file: File; title: string }

const fileStub = (f: File) => ({ kind: 'file' as const, mime_type: f.type || null, name: f.name })

/**
 * Subir a la bóveda: archivos (o un link) con su título, etiquetas para todos y, si se quiere, el
 * espacio, la tarea o la reunión de la que cuelgan. Nada de eso es obligatorio: sin vínculos, queda
 * suelto en la bóveda.
 */
export function UploadDialog({
  open,
  onOpenChange,
  initialMode = 'files',
  initialFiles,
  defaultWorkspaceId,
  labelSuggestions,
  onUploaded,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  initialMode?: UploadMode
  /** archivos ya elegidos (p. ej. los que se soltaron sobre la bóveda) */
  initialFiles?: File[]
  defaultWorkspaceId?: string | null
  labelSuggestions: string[]
  onUploaded?: (rows: AttachmentRow[]) => void
}) {
  const t = useTranslations('vault')
  const tu = useTranslations('vault.uploadForm')
  const locale = useDateLocale()
  const { workspaces, observedWorkspaces } = useApp()
  const wsMap = useWorkspaceMap()
  const { upload, addLink } = useAttachmentMutations()
  const editableWs = useMemo(() => workspaces.filter((w) => canEdit(w)), [workspaces])

  const [mode, setMode] = useState<UploadMode>(initialMode)
  const [items, setItems] = useState<Item[]>([])
  const [url, setUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [labels, setLabels] = useState<string[]>([])
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [meetingId, setMeetingId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  // cada vez que se abre, empieza limpio (con lo que se haya soltado y el espacio filtrado, si hay)
  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setItems((initialFiles ?? []).map((file) => ({ id: crypto.randomUUID(), file, title: '' })))
    setUrl('')
    setLinkTitle('')
    setLabels([])
    setWorkspaceId(defaultWorkspaceId && editableWs.some((w) => w.id === defaultWorkspaceId) ? defaultWorkspaceId : null)
    setTaskId(null)
    setMeetingId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // tareas y reuniones para vincular: las del espacio elegido, o de todos si no hay
  const wsIds = useMemo(() => [...workspaces, ...observedWorkspaces].map((w) => w.id), [workspaces, observedWorkspaces])
  const { data: tasks } = useTasks(open ? { kind: 'workspaces', workspaceIds: workspaceId ? [workspaceId] : editableWs.map((w) => w.id) } : null)
  const range = useMemo(() => ({ from: subDays(new Date(), 90), to: addDays(new Date(), 60) }), [])
  const { data: meetings } = useMeetingsInRange(open ? (workspaceId ? [workspaceId] : wsIds) : [], range.from, range.to)
  const ws = workspaceId ? wsMap.get(workspaceId) : undefined
  const task = taskId ? (tasks ?? []).find((x) => x.id === taskId) : undefined
  const meeting = meetingId ? (meetings ?? []).find((m) => m.id === meetingId) : undefined

  // vincular a algo de otro espacio cambia el espacio y suelta lo que no corresponde
  const pickWorkspace = (id: string | null) => {
    setWorkspaceId(id)
    if (task && task.workspace_id !== id) setTaskId(null)
    if (meeting && meeting.workspace_id !== id) setMeetingId(null)
  }
  const pickTask = (id: string) => {
    const target = (tasks ?? []).find((x) => x.id === id)
    setTaskId(id)
    if (!target) return
    setWorkspaceId(target.workspace_id)
    if (meeting && meeting.workspace_id !== target.workspace_id) setMeetingId(null)
  }
  const pickMeeting = (id: string) => {
    const target = (meetings ?? []).find((m) => m.id === id)
    setMeetingId(id)
    if (!target) return
    setWorkspaceId(target.workspace_id)
    if (task && task.workspace_id !== target.workspace_id) setTaskId(null)
  }

  const addFiles = (list: File[]) => setItems((prev) => [...prev, ...list.map((file) => ({ id: crypto.randomUUID(), file, title: '' }))])
  const valid = items.filter((i) => i.file.size <= MAX_FILE_BYTES)
  const linkOk = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+/i.test(url.trim())
  const pending = upload.isPending || addLink.isPending
  const parent = { workspaceId, taskId, meetingId, labels }

  const submit = () => {
    const done = (rows: AttachmentRow[]) => {
      onUploaded?.(rows)
      onOpenChange(false)
    }
    if (mode === 'files') {
      if (!valid.length) return
      upload.mutate({ parent, files: valid.map((i) => i.file), titles: valid.map((i) => i.title || null) }, { onSuccess: done })
    } else {
      if (!linkOk) return
      addLink.mutate({ parent: { ...parent, title: linkTitle.trim() || null }, url: url.trim(), name: linkTitle }, { onSuccess: (row) => done([row]) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader title={tu('title')} description={tu('description')} />
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <DialogBody className="flex flex-col gap-5">
            {/* archivo o link */}
            <div className="flex w-fit items-center rounded-lg bg-hover p-0.5" role="group" aria-label={tu('what')}>
              {(['files', 'link'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid/40',
                    mode === m ? 'bg-panel font-medium text-fg shadow-card' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {m === 'files' ? <UploadCloud className="size-3.5" /> : <Link2 className="size-3.5" />}
                  {tu(`mode.${m}`)}
                </button>
              ))}
            </div>

            {mode === 'files' ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes('Files')) return
                    e.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragging(false)
                    addFiles(Array.from(e.dataTransfer.files))
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid/40',
                    items.length ? 'py-4' : 'py-8',
                    dragging ? 'border-accent-mid bg-accent-soft text-accent-ink' : 'border-line-strong text-fg-muted hover:border-accent-mid/60 hover:bg-hover/50',
                  )}
                >
                  <UploadCloud className={cn(items.length ? 'size-5' : 'size-7', dragging ? 'text-accent-ink' : 'text-fg-subtle')} />
                  <span className="text-sm">
                    {tu('drop')} <span className="font-medium text-accent-ink underline decoration-accent-mid/40 underline-offset-2">{tu('choose')}</span>
                  </span>
                  <span className="text-xs text-fg-subtle">{tu('limit')}</span>
                </button>
                <input
                  ref={input}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    addFiles(Array.from(e.target.files ?? []))
                    e.target.value = ''
                  }}
                />
                {items.length ? (
                  <ul className="flex max-h-56 flex-col divide-y divide-line-soft overflow-y-auto rounded-xl border border-line scrollbar-thin">
                    {items.map((item) => {
                      const tooBig = item.file.size > MAX_FILE_BYTES
                      return (
                        <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                          <FileKindIcon a={fileStub(item.file)} className="size-5" />
                          <div className="flex min-w-0 flex-1 flex-col">
                            <input
                              value={item.title}
                              onChange={(e) => setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, title: e.target.value } : x)))}
                              placeholder={item.file.name}
                              aria-label={tu('fileTitle', { name: item.file.name })}
                              maxLength={200}
                              disabled={tooBig}
                              className="-mx-1 rounded-sm bg-transparent px-1 text-sm font-medium text-fg outline-none placeholder:font-normal placeholder:text-fg-muted hover:bg-hover/60 focus:bg-hover/60 disabled:opacity-60"
                            />
                            <span className={cn('truncate text-xs', tooBig ? 'text-danger' : 'text-fg-subtle')}>
                              {tooBig ? tu('tooBig') : `${item.title ? `${item.file.name} · ` : ''}${formatBytes(item.file.size)}`}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
                            aria-label={tu('remove', { name: item.file.name })}
                            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
                          >
                            <X className="size-3.5" />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                  <span className="font-medium">{tu('url')}</span>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://"
                    autoFocus
                    className="h-9 rounded-lg border border-line bg-panel px-3 text-sm outline-none placeholder:text-fg-subtle focus:border-accent-mid"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                  <span className="font-medium">{t('titleLabel')}</span>
                  <input
                    value={linkTitle}
                    onChange={(e) => setLinkTitle(e.target.value)}
                    placeholder={tu('linkTitlePlaceholder')}
                    maxLength={200}
                    className="h-9 rounded-lg border border-line bg-panel px-3 text-sm outline-none placeholder:text-fg-subtle focus:border-accent-mid"
                  />
                </label>
              </div>
            )}

            {/* etiquetas para todo lo que se sube */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t('labels')}</span>
              <LabelsPopover
                value={labels}
                suggestions={labelSuggestions}
                onChange={setLabels}
                className="h-auto min-h-9 w-full flex-wrap justify-start gap-1 rounded-lg border border-dashed border-line px-2 py-1.5 hover:border-line-strong"
              >
                {labels.length ? (
                  labels.map((l) => <LabelChip key={l} label={l} />)
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm text-fg-subtle">
                    <Tag className="size-3.5" />
                    {t('addLabels')}
                  </span>
                )}
              </LabelsPopover>
            </div>

            {/* vínculos opcionales */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                {tu('linkTo')} <span className="font-normal text-fg-subtle">{tu('optional')}</span>
              </span>
              <div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-xl border border-line px-2 py-1.5 text-sm">
                <span className="pl-1 text-fg-muted">{t('space')}</span>
                <Menu>
                  <MenuTrigger className={linkTrigger}>
                    {ws ? <WorkspaceMark ws={ws} size={16} /> : <LayoutGrid className="size-4 text-fg-subtle" />}
                    <span className={cn('truncate', !ws && 'text-fg-subtle')}>{ws?.name ?? t('noSpace')}</span>
                    <ChevronDown className="ml-auto size-3.5 text-fg-subtle" />
                  </MenuTrigger>
                  <MenuContent className="w-56">
                    <MenuRadioGroup value={workspaceId ?? 'none'} onValueChange={(v) => pickWorkspace(v === 'none' ? null : String(v))}>
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

                <span className="pl-1 text-fg-muted">{t('task')}</span>
                <LinkedValue
                  editable
                  current={
                    task && wsMap.get(task.workspace_id) ? (
                      <Link href={taskPath(wsMap.get(task.workspace_id)!.key, task.number)} target="_blank" className="flex min-w-0 items-center gap-1.5 hover:underline">
                        <StatusIcon status={task.status} />
                        <span className="shrink-0 font-mono text-xs text-fg-subtle">{taskRef(wsMap.get(task.workspace_id)!.key, task.number)}</span>
                        <span className="truncate">{task.title}</span>
                      </Link>
                    ) : null
                  }
                  placeholder={t('linkTask')}
                  icon={<CircleCheck className="size-4 text-fg-subtle" />}
                  items={(tasks ?? [])
                    .filter((x) => x.status !== 'done')
                    .map((x) => {
                      const w = wsMap.get(x.workspace_id)
                      return { id: x.id, label: x.title, sub: w ? `${taskRef(w.key, x.number)} · ${w.name}` : '', icon: <StatusIcon status={x.status} /> }
                    })}
                  onPick={pickTask}
                  onClear={() => setTaskId(null)}
                  searchPlaceholder={t('searchTasks')}
                />

                <span className="pl-1 text-fg-muted">{t('meeting')}</span>
                <LinkedValue
                  editable
                  current={
                    meeting ? (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Video className="size-3.5 shrink-0 text-accent-mid" />
                        <span className="truncate">{meeting.title}</span>
                      </span>
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
                  onPick={pickMeeting}
                  onClear={() => setMeetingId(null)}
                  searchPlaceholder={t('searchMeetings')}
                />
              </div>
              <p className="text-xs text-fg-subtle">{workspaceId || taskId || meetingId ? tu('linkedHint') : tu('looseHint')}</p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {tu('cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={pending} disabled={mode === 'files' ? !valid.length : !linkOk}>
              {mode === 'files' ? tu('submitFiles', { count: valid.length }) : tu('submitLink')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
