'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { FileSpreadsheet, FileUp, LayoutTemplate, MoreHorizontal, TriangleAlert, Upload } from 'lucide-react'
import { canEdit, useApp, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Field } from '@/components/ui/input'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'
import { useCreateTask } from '@/lib/queries/tasks'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { taskStatusOf } from '@/lib/statuses'
import { useStatusName } from '@/lib/use-status-name'
import { isTrelloBoard, matchPeople, parseCsv, rowsFromSheet, rowsFromTrello, type ImportRow } from '@/lib/task-transfer'
import { track } from '@/lib/telemetry'
import type { TaskRow } from '@/lib/database.types'
import { cn, taskRef } from '@/lib/utils'
import { StatusIcon } from './status-icon'
import { UseTaskTemplateDialog } from './task-templates'

/** El «⋯» de Tareas: bajar a Excel lo que se ve e importar tareas de Excel, CSV o Trello. */
export function TasksMoreMenu({ tasks }: { tasks: TaskRow[] | undefined }) {
  const t = useTranslations('transfer')
  const { workspaces } = useApp()
  const exportXlsx = useExportTasks()
  const [importing, setImporting] = useState(false)
  const [fromTemplate, setFromTemplate] = useState(false)
  const [busy, setBusy] = useState(false)
  const canImport = workspaces.some((w) => canEdit(w))
  return (
    <>
      <Menu>
        <Tooltip content={t('more')}>
          <MenuTrigger render={<Button variant="secondary" size="icon" aria-label={t('more')} />}>
            <MoreHorizontal />
          </MenuTrigger>
        </Tooltip>
        <MenuContent align="end" className="w-64">
          <MenuItem
            disabled={!tasks?.length || busy}
            onClick={async () => {
              if (!tasks?.length) return
              setBusy(true)
              try {
                await exportXlsx(tasks)
                toast.success(t('exported', { count: tasks.length }))
                track('feature.tasks_export')
              } catch {
                toast.error(t('exportError'))
              } finally {
                setBusy(false)
              }
            }}
          >
            <FileSpreadsheet />
            <span className="flex-1">{t('export')}</span>
            {tasks?.length ? <span className="text-xs tabular-nums text-fg-subtle">{tasks.length}</span> : null}
          </MenuItem>
          {canImport ? (
            <>
              <MenuItem onClick={() => setFromTemplate(true)}>
                <LayoutTemplate />
                {t('fromTemplate')}
              </MenuItem>
              <MenuItem onClick={() => setImporting(true)}>
                <FileUp />
                {t('import')}
              </MenuItem>
            </>
          ) : null}
        </MenuContent>
      </Menu>
      {canImport ? <ImportTasksDialog open={importing} onOpenChange={setImporting} /> : null}
      {canImport ? <UseTaskTemplateDialog open={fromTemplate} onOpenChange={setFromTemplate} /> : null}
    </>
  )
}

/** Lo que se ve, a .xlsx: una fila por tarea con sus datos legibles (estado propio, nombres, fechas). */
function useExportTasks() {
  const t = useTranslations('transfer.columns')
  const tp = useTranslations('tasks.priority')
  const wsMap = useWorkspaceMap()
  const memberMap = useMemberMap()
  const statusName = useStatusName()
  return async (tasks: TaskRow[]) => {
    const { default: writeXlsxFile } = await import('write-excel-file/browser')
    const date = (d: string | null) => (d ? new Date(`${d}T12:00:00`) : null)
    const header = ['ref', 'title', 'status', 'priority', 'assignees', 'due', 'start', 'labels', 'workspace', 'estimate', 'created', 'completed', 'description'].map((k) => ({
      value: t(k),
      fontWeight: 'bold' as const,
    }))
    const rows = tasks.map((x) => {
      const ws = wsMap.get(x.workspace_id)
      const people = x.assignee_ids.flatMap((id) => memberMap.get(id)?.full_name ?? [])
      return [
        { type: String, value: ws ? taskRef(ws.key, x.number) : '' },
        { type: String, value: x.title },
        { type: String, value: statusName(taskStatusOf(x, ws)) },
        { type: String, value: x.priority === 'none' ? '' : tp(x.priority) },
        { type: String, value: people.join(', ') },
        x.due_date ? { type: Date, value: date(x.due_date)!, format: 'dd/mm/yyyy' } : null,
        x.start_date ? { type: Date, value: date(x.start_date)!, format: 'dd/mm/yyyy' } : null,
        { type: String, value: x.labels.join(', ') },
        { type: String, value: ws?.name ?? '' },
        x.estimate_hours != null ? { type: Number, value: x.estimate_hours } : null,
        { type: Date, value: new Date(x.created_at), format: 'dd/mm/yyyy' },
        x.completed_at ? { type: Date, value: new Date(x.completed_at), format: 'dd/mm/yyyy' } : null,
        { type: String, value: (x.description_text ?? '').slice(0, 32_000) },
      ]
    })
    const today = new Date().toISOString().slice(0, 10)
    await writeXlsxFile([header, ...rows] as never, {
      sheet: t('sheet'),
      stickyRowsCount: 1,
      columns: [{ width: 10 }, { width: 48 }, { width: 16 }, { width: 12 }, { width: 28 }, { width: 12 }, { width: 12 }, { width: 22 }, { width: 18 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 60 }],
    }).toFile(`veltro-${t('file')}-${today}.xlsx`)
  }
}

type Parsed = { rows: ImportRow[]; source: 'sheet' | 'trello'; name: string; skipped: number }

/**
 * Importar tareas a un espacio: una hoja de Excel o CSV (con encabezados como Título, Estado,
 * Responsable, Entrega, Etiquetas) o el JSON que exporta Trello. Antes de crear muestra qué entiende.
 */
function ImportTasksDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('transfer.importDialog')
  const ts = useTranslations('tasks.status')
  const { workspaces } = useApp()
  const editable = useMemo(() => workspaces.filter((w) => canEdit(w)), [workspaces])
  const [ws, setWs] = useState('')
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const members = useWorkspaceMembers(ws || null)
  const create = useCreateTask()
  const workspace = editable.find((w) => w.id === ws)

  const reset = () => {
    setParsed(null)
    setError(null)
  }

  // al abrir: el primer espacio editable y sin archivo
  useEffect(() => {
    if (!open) return
    setWs((w) => (editable.some((x) => x.id === w) ? w : (editable[0]?.id ?? '')))
    reset()
  }, [open, editable])

  const read = async (file: File) => {
    reset()
    setReading(true)
    try {
      const name = file.name.toLowerCase()
      if (name.endsWith('.json')) {
        const json = JSON.parse(await file.text())
        if (!isTrelloBoard(json)) throw new Error('notTrello')
        const r = rowsFromTrello(json)
        setParsed({ rows: r.rows, source: 'trello', name: r.board || file.name, skipped: 0 })
      } else {
        let sheet: unknown[][]
        if (name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv') sheet = parseCsv(await file.text())
        else {
          const { readSheet } = await import('read-excel-file/browser')
          sheet = (await readSheet(file)) as unknown[][]
        }
        const r = rowsFromSheet(sheet)
        if (r.missingTitle) throw new Error('noTitle')
        setParsed({ rows: r.rows, source: 'sheet', name: file.name, skipped: r.skipped })
      }
    } catch (e) {
      const code = (e as Error).message
      setError(code === 'notTrello' ? t('notTrello') : code === 'noTitle' ? t('noTitle') : t('unreadable'))
    } finally {
      setReading(false)
    }
  }

  // responsables: por email o nombre entre la gente del espacio elegido
  const people = useMemo(() => members.map((m) => ({ id: m.id, email: m.email, full_name: m.full_name })), [members])
  const prepared = useMemo(
    () =>
      (parsed?.rows ?? []).map((r) => {
        const m = matchPeople(r.assigneeNames, people)
        return { ...r, assigneeIds: m.ids, unknown: m.unknown }
      }),
    [parsed, people],
  )
  const unknownPeople = [...new Set(prepared.flatMap((r) => r.unknown))]
  const byStatus = prepared.reduce<Record<string, number>>((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {})

  const submit = () => {
    if (!ws || !prepared.length) return
    create.mutate(
      prepared.map((r, i) => ({
        workspace_id: ws,
        title: r.title,
        description_text: r.description || undefined,
        status: r.status,
        status_id: null,
        priority: r.priority,
        assignee_ids: r.assigneeIds,
        due_date: r.dueDate,
        start_date: r.startDate && r.dueDate && r.startDate > r.dueDate ? null : r.startDate,
        labels: r.labels,
        position: (i + 1) * 1000,
      })),
      {
        onSuccess: (rows) => {
          toast.success(t('done', { count: rows.length, workspace: workspace?.name ?? '' }))
          track('feature.tasks_import', { props: { source: parsed?.source ?? 'sheet', count: rows.length } })
          onOpenChange(false)
          reset()
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader title={t('title')} description={t('description')} />
        <DialogBody className="flex flex-col gap-4">
          <Field label={t('workspace')} htmlFor="imp-ws">
            <Select id="imp-ws" value={ws} onChange={setWs} placeholder={t('pickWorkspace')} options={editable.map((w) => ({ value: w.id, label: w.name, icon: <WorkspaceMark ws={w} size={16} /> }))} />
          </Field>

          {!parsed ? (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setOver(true)
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setOver(false)
                const f = e.dataTransfer.files[0]
                if (f) void read(f)
              }}
              className={cn(
                'flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-8 text-center transition-colors',
                over ? 'border-accent-mid bg-accent-soft/50' : 'border-line-strong',
              )}
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                <Upload className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium text-fg">{t('drop')}</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-fg-muted">{t('formats')}</p>
              </div>
              <Button size="sm" onClick={() => input.current?.click()} loading={reading}>
                {t('choose')}
              </Button>
              <input
                ref={input}
                type="file"
                hidden
                accept=".xlsx,.csv,.txt,.json,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void read(f)
                }}
              />
              {error ? (
                <p role="alert" className="flex items-center gap-1.5 rounded-md bg-danger-soft px-3 py-2 text-left text-sm text-fg">
                  <TriangleAlert className="size-4 shrink-0 text-danger" />
                  {error}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-fg">{t('found', { count: prepared.length, name: parsed.name })}</span>
                {Object.entries(byStatus).map(([s, n]) => (
                  <span key={s} className="inline-flex items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-xs text-fg-muted">
                    <StatusIcon status={s as ImportRow['status']} className="size-3" />
                    {ts(s)} · {n}
                  </span>
                ))}
                <button type="button" onClick={reset} className="ml-auto text-xs font-medium text-accent-ink hover:underline">
                  {t('other')}
                </button>
              </div>
              <div className="max-h-64 overflow-auto rounded-lg border border-line scrollbar-thin">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-sidebar text-xs text-fg-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t('colTitle')}</th>
                      <th className="px-3 py-2 font-medium">{t('colStatus')}</th>
                      <th className="px-3 py-2 font-medium">{t('colPeople')}</th>
                      <th className="px-3 py-2 font-medium">{t('colDue')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prepared.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t border-line-soft">
                        <td className="max-w-64 truncate px-3 py-1.5 text-fg">{r.title}</td>
                        <td className="px-3 py-1.5">
                          <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                            <StatusIcon status={r.status} className="size-3" />
                            {ts(r.status)}
                          </span>
                        </td>
                        <td className="max-w-40 truncate px-3 py-1.5 text-xs text-fg-muted">
                          {r.assigneeIds.map((id) => members.find((m) => m.id === id)?.full_name.split(' ')[0]).join(', ')}
                          {r.unknown.length ? <span className="text-mandarina-ink"> {r.unknown.join(', ')}?</span> : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-xs tabular-nums text-fg-muted">{r.dueDate ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {prepared.length > 50 ? <p className="text-xs text-fg-subtle">{t('andMore', { count: prepared.length - 50 })}</p> : null}
              {unknownPeople.length ? (
                <p className="flex items-start gap-1.5 rounded-md bg-warning-soft px-3 py-2 text-xs leading-relaxed text-fg">
                  <TriangleAlert className="mt-px size-3.5 shrink-0 text-mandarina-ink" />
                  {t('unknownPeople', { names: unknownPeople.slice(0, 6).join(', '), count: unknownPeople.length })}
                </p>
              ) : null}
              {parsed.skipped ? <p className="text-xs text-fg-subtle">{t('skipped', { count: parsed.skipped })}</p> : null}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button variant="primary" disabled={!ws || !prepared.length} loading={create.isPending} onClick={submit}>
            {prepared.length ? t('submit', { count: prepared.length }) : t('submitEmpty')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
