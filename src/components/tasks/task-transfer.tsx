'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { parseISO } from 'date-fns'
import { toast } from 'sonner'
import { ArrowRight, Check, Download, FileSpreadsheet, FileUp, LayoutTemplate, MoreHorizontal, RefreshCw, SquareKanban, TriangleAlert, Upload } from 'lucide-react'
import { canEdit, useApp, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/switch'
import { Tooltip } from '@/components/ui/tooltip'
import { shortDate, useDateLocale } from '@/lib/dates'
import { statusKey, workspaceStatuses, type StatusOption } from '@/lib/statuses'
import { useCreateTask } from '@/lib/queries/tasks'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { taskStatusOf } from '@/lib/statuses'
import { useStatusName } from '@/lib/use-status-name'
import { fold, IMPORT_FIELDS, isTrelloBoard, matchPeople, parseCsv, rowsFromSheet, rowsFromTrello, type ImportField, type ImportRow } from '@/lib/task-transfer'
import { track } from '@/lib/telemetry'
import type { TaskRow, TaskStatus } from '@/lib/database.types'
import { cn, taskRef } from '@/lib/utils'
import { PriorityIcon, StatusIcon } from './status-icon'
import { UseTaskTemplateDialog } from './task-templates'

/**
 * El «⋯» de Tareas: bajar a Excel lo que se ve e importar tareas de Excel, CSV o Trello. Desde un
 * espacio, lo importado va a ese espacio.
 */
export function TasksMoreMenu({ tasks, workspaceId }: { tasks: TaskRow[] | undefined; workspaceId?: string }) {
  const t = useTranslations('transfer')
  const { workspaces } = useApp()
  const exportXlsx = useExportTasks()
  const [importing, setImporting] = useState(false)
  const [fromTemplate, setFromTemplate] = useState(false)
  const [busy, setBusy] = useState(false)
  const canImport = workspaces.some((w) => canEdit(w))
  const params = useSearchParams()
  const pathname = usePathname()

  // ?import=1 (p. ej. desde «Para arrancar» del espacio): abre el importador y se limpia la dirección.
  // Mira el parámetro y no solo el montaje: si Tareas ya estaba abierta y la dirección cambia adentro de
  // la app, la página no se vuelve a montar. Y con history.replaceState, no router.replace: este pide la
  // página otra vez al servidor y, con la API lejos, la lista se rearma y el importador se cierra.
  const wantsImport = params.get('import') === '1'
  useEffect(() => {
    if (!wantsImport || !canImport) return
    setImporting(true)
    const rest = new URLSearchParams(params.toString())
    rest.delete('import')
    window.history.replaceState(null, '', rest.size ? `${pathname}?${rest}` : pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsImport, canImport])

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
      {canImport ? <ImportTasksDialog open={importing} onOpenChange={setImporting} defaultWorkspaceId={workspaceId} /> : null}
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

const TEMPLATE_WIDTH: Record<ImportField, number> = { title: 44, status: 14, assignees: 24, due: 12, start: 12, priority: 12, labels: 20, description: 48 }

/**
 * La plantilla para empezar de cero: las columnas que se leen, con los nombres del idioma de cada
 * quien, y tres tareas de ejemplo que se importan tal cual (la primera, a nombre de quien la baja).
 */
function useImportTemplate() {
  const t = useTranslations('transfer.importDialog')
  const tc = useTranslations('transfer.columns')
  const ts = useTranslations('tasks.status')
  const tp = useTranslations('tasks.priority')
  const { profile } = useApp()
  return async () => {
    const { default: writeXlsxFile } = await import('write-excel-file/browser')
    const day = (n: number) => {
      const d = new Date()
      d.setHours(12, 0, 0, 0)
      d.setDate(d.getDate() + n)
      return d
    }
    const examples: Record<ImportField, string | Date | null>[] = [
      { title: t('example1'), status: ts('todo'), assignees: profile.full_name, due: day(3), start: null, priority: tp('high'), labels: t('example1Labels'), description: t('example1Notes') },
      { title: t('example2'), status: ts('in_progress'), assignees: profile.full_name, due: day(7), start: day(1), priority: tp('medium'), labels: t('example2Labels'), description: null },
      { title: t('example3'), status: ts('done'), assignees: null, due: null, start: null, priority: tp('low'), labels: null, description: null },
    ]
    const header = IMPORT_FIELDS.map((f) => ({ value: tc(f), fontWeight: 'bold' as const }))
    const rows = examples.map((ex) =>
      IMPORT_FIELDS.map((f) => {
        const v = ex[f]
        return v instanceof Date ? { type: Date, value: v, format: 'dd/mm/yyyy' } : v ? { type: String, value: v } : null
      }),
    )
    await writeXlsxFile([header, ...rows] as never, {
      sheet: tc('sheet'),
      stickyRowsCount: 1,
      columns: IMPORT_FIELDS.map((f) => ({ width: TEMPLATE_WIDTH[f] })),
    }).toFile(`veltro-${t('templateFile')}.xlsx`)
  }
}

type FileKind = 'xlsx' | 'csv' | 'json'

type Parsed = {
  rows: ImportRow[]
  source: 'sheet' | 'trello'
  kind: FileKind
  file: string
  /** el nombre del tablero, si es de Trello */
  board?: string
  skipped: number
  columns: ImportField[]
  ignored: string[]
  headerless: boolean
}

const STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'blocked', 'done']
/** De un tablero de Trello se trae: la tarjeta, su lista (como estado), miembros, fechas y etiquetas. */
const TRELLO_FIELDS: ImportField[] = ['title', 'status', 'assignees', 'due', 'start', 'labels', 'description']
/** En la vista previa se listan todas (con su casilla) hasta este tope; las demás se importan igual. */
const PREVIEW_ROWS = 500

const kindOf = (file: File): FileKind => {
  const name = file.name.toLowerCase()
  if (name.endsWith('.json')) return 'json'
  return name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv' ? 'csv' : 'xlsx'
}

const KIND_TONE: Record<FileKind, string> = {
  xlsx: 'bg-[oklch(0.94_0.05_152)] text-[oklch(0.42_0.1_152)] dark:bg-[oklch(0.34_0.06_152)] dark:text-[oklch(0.9_0.07_152)]',
  csv: 'bg-[oklch(0.94_0.04_205)] text-[oklch(0.44_0.08_215)] dark:bg-[oklch(0.34_0.05_215)] dark:text-[oklch(0.9_0.06_205)]',
  json: 'bg-[oklch(0.94_0.04_255)] text-[oklch(0.46_0.12_258)] dark:bg-[oklch(0.34_0.07_258)] dark:text-[oklch(0.9_0.06_255)]',
}

/** La etiqueta del tipo de archivo (XLSX, CSV, JSON), en su color. */
function FileBadge({ kind, large }: { kind: FileKind; large?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-mono font-semibold uppercase tracking-wider',
        large ? 'size-10 rounded-[10px] text-[11px]' : 'h-5 rounded-[5px] px-1.5 text-[10px]',
        KIND_TONE[kind],
      )}
    >
      {kind}
    </span>
  )
}

/**
 * Importar tareas a un espacio: una hoja de Excel o CSV o el JSON que exporta Trello. Primero, qué
 * archivo sirve y cómo armarlo (con plantilla); después, qué entendimos antes de crear nada: qué
 * columnas se usan, cómo queda cada estado (y cambiarlo), las tareas y a quién no encontramos.
 */
function ImportTasksDialog({ open, onOpenChange, defaultWorkspaceId }: { open: boolean; onOpenChange: (o: boolean) => void; defaultWorkspaceId?: string }) {
  const t = useTranslations('transfer.importDialog')
  const tc = useTranslations('transfer.columns')
  const ts = useTranslations('tasks.status')
  const tTransfer = useTranslations('transfer')
  const statusName = useStatusName()
  const { workspaces } = useApp()
  const dateLocale = useDateLocale()
  const editable = useMemo(() => workspaces.filter((w) => canEdit(w)), [workspaces])
  const [ws, setWs] = useState('')
  const [parsed, setParsed] = useState<Parsed | null>(null)
  // cómo queda cada estado escrito (por su forma sin acentos ni mayúsculas): la clave del estado del espacio, si se cambió a mano
  const [mapping, setMapping] = useState<Record<string, string>>({})
  // las filas que se dejan afuera (por su posición en el archivo): por defecto entran todas
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const members = useWorkspaceMembers(ws || null)
  const create = useCreateTask()
  const downloadTemplate = useImportTemplate()
  const workspace = editable.find((w) => w.id === ws)

  const reset = () => {
    setParsed(null)
    setError(null)
    setMapping({})
    setExcluded(new Set())
  }

  // al abrir: el espacio desde el que se abrió (o el último elegido, o el primero editable) y sin archivo
  useEffect(() => {
    if (!open) return
    setWs((w) => {
      if (defaultWorkspaceId && editable.some((x) => x.id === defaultWorkspaceId)) return defaultWorkspaceId
      return editable.some((x) => x.id === w) ? w : (editable[0]?.id ?? '')
    })
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const read = async (file: File) => {
    reset()
    setReading(true)
    const kind = kindOf(file)
    try {
      if (kind === 'json') {
        const json = JSON.parse(await file.text())
        if (!isTrelloBoard(json)) throw new Error('notTrello')
        const r = rowsFromTrello(json)
        setParsed({ rows: r.rows, source: 'trello', kind, file: file.name, board: r.board || undefined, skipped: 0, columns: TRELLO_FIELDS, ignored: [], headerless: false })
      } else {
        let sheet: unknown[][]
        if (kind === 'csv') sheet = parseCsv(await file.text())
        else {
          const { readSheet } = await import('read-excel-file/browser')
          sheet = (await readSheet(file)) as unknown[][]
        }
        const r = rowsFromSheet(sheet)
        if (r.missingTitle) throw new Error('noTitle')
        setParsed({ rows: r.rows, source: 'sheet', kind, file: file.name, skipped: r.skipped, columns: r.columns, ignored: r.ignored, headerless: r.headerless })
      }
    } catch (e) {
      const code = (e as Error).message
      setError(code === 'notTrello' ? t('notTrello') : code === 'noTitle' ? t('noTitle') : t('unreadable'))
    } finally {
      setReading(false)
    }
  }

  // los estados del espacio elegido: los propios (p. ej. los de su plantilla) o los cinco de siempre
  const own = useMemo(() => workspaceStatuses(workspace), [workspace])
  // un estado escrito → uno del espacio: primero por su nombre («Entregado» → Entregado), si no por su categoría
  const optionFor = useMemo(() => {
    const byName = new Map(own.flatMap((o) => (o.name ? [[fold(o.name), o] as const] : [])))
    return (raw: string, category: TaskStatus): StatusOption => {
      const picked = raw ? mapping[fold(raw)] : undefined
      return own.find((o) => statusKey(o) === picked) ?? (raw ? byName.get(fold(raw)) : undefined) ?? own.find((o) => o.category === category) ?? own[0]
    }
  }, [own, mapping])

  // los estados como venían escritos (la celda o la lista de Trello): cuántas tareas y en qué estado quedan
  const rawStatuses = useMemo(() => {
    const seen = new Map<string, { label: string; count: number; category: TaskStatus }>()
    for (const r of parsed?.rows ?? []) {
      if (!r.statusRaw) continue
      const key = fold(r.statusRaw)
      const cur = seen.get(key)
      if (cur) cur.count++
      else seen.set(key, { label: r.statusRaw, count: 1, category: r.status })
    }
    return [...seen.entries()].map(([key, v]) => ({ key, ...v }))
  }, [parsed])

  // responsables: por email o nombre entre la gente del espacio elegido
  const people = useMemo(() => members.map((m) => ({ id: m.id, email: m.email, full_name: m.full_name })), [members])
  const prepared = useMemo(
    () =>
      (parsed?.rows ?? []).map((r) => {
        const m = matchPeople(r.assigneeNames, people)
        const option = optionFor(r.statusRaw, r.status)
        return { ...r, option, status: option.category, assigneeIds: m.ids, unknown: m.unknown }
      }),
    [parsed, people, optionFor],
  )
  const unknownPeople = [...new Set(prepared.flatMap((r) => r.unknown))]
  const byStatus = STATUSES.map((s) => [s, prepared.filter((r) => r.status === s).length] as const).filter(([, n]) => n > 0)
  const statusOptions = own.map((o) => ({ value: statusKey(o), label: statusName(o), icon: <StatusIcon status={o.category} /> }))
  const firstName = (id: string) => members.find((m) => m.id === id)?.full_name.split(' ')[0]

  const chosen = prepared.filter((_, i) => !excluded.has(i))
  /** Marca o desmarca un grupo de filas: si están todas, salen todas; si no, entran todas. */
  const toggleRows = (idx: number[]) =>
    setExcluded((prev) => {
      const next = new Set(prev)
      const allIn = idx.every((i) => !prev.has(i))
      idx.forEach((i) => (allIn ? next.add(i) : next.delete(i)))
      return next
    })
  const stateOf = (idx: number[]) => {
    const on = idx.filter((i) => !excluded.has(i)).length
    return { on, checked: on === idx.length && on > 0, indeterminate: on > 0 && on < idx.length }
  }
  const allIdx = prepared.map((_, i) => i)
  // columnas que solo aparecen si el archivo trae ese dato (así el título y la descripción tienen más lugar)
  const showPeople = prepared.some((r) => r.assigneeNames.length)
  const showDue = prepared.some((r) => r.dueDate)
  const groupIdx = (key: string) => prepared.flatMap((r, i) => (r.statusRaw && fold(r.statusRaw) === key ? [i] : []))

  const submit = () => {
    if (!ws || !chosen.length) return
    create.mutate(
      chosen.map((r, i) => ({
        workspace_id: ws,
        title: r.title,
        description_text: r.description || undefined,
        status: r.option.category,
        status_id: r.option.id,
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

  const choose = () => input.current?.click()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* al elegir el archivo: alto tope y, si no cabe, se desplaza el cuerpo con el pie a la vista. Al
          revisarlo: casi a pantalla completa, con los estados al costado y la tabla con todo el texto */}
      <DialogContent
        viewportClassName={parsed ? 'pt-4 sm:pt-6' : undefined}
        className={cn(
          'flex flex-col',
          parsed ? 'h-[calc(100dvh-2rem)] sm:h-[calc(100dvh-3rem)] sm:max-w-[min(1320px,calc(100vw-3rem))]' : 'max-h-[calc(100dvh-12vh-1rem)] sm:max-w-[720px]',
        )}
      >
        <DialogHeader title={t('title')} description={parsed ? undefined : t('description')} />
        <DialogBody
          className={cn('flex min-h-0 flex-1 flex-col gap-5 pb-5', parsed ? 'overflow-hidden' : 'overflow-y-auto scrollbar-thin')}
          // se puede soltar el archivo en cualquier parte del diálogo, también para cambiarlo
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('Files')) return
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const f = e.dataTransfer.files[0]
            if (f) void read(f)
          }}
        >
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

          {!parsed ? (
            <>
              <div
                className={cn(
                  'flex flex-col items-center gap-4 rounded-2xl border border-dashed px-5 py-6 text-center transition-colors duration-150 sm:flex-row sm:py-5 sm:text-left',
                  over ? 'border-accent-mid bg-accent-soft/60' : 'border-line-strong bg-canvas/60',
                )}
              >
                <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-2xl transition-colors duration-150', over ? 'bg-accent text-accent-fg' : 'bg-accent-soft text-accent-ink')}>
                  <Upload className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{over ? t('dropNow') : t('drop')}</p>
                  <p className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5 text-[13px] text-fg-muted sm:justify-start">
                    <FileBadge kind="xlsx" />
                    <FileBadge kind="csv" />
                    <FileBadge kind="json" />
                    <span className="ml-0.5">{t('accepts')}</span>
                  </p>
                </div>
                <Button variant="primary" onClick={choose} loading={reading}>
                  <FileUp />
                  {t('choose')}
                </Button>
              </div>

              {error ? (
                <p role="alert" className="-mt-2 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] leading-snug text-fg">
                  <TriangleAlert className="mt-px size-4 shrink-0 text-danger" />
                  {error}
                </p>
              ) : null}

              <div className="grid gap-x-8 gap-y-6 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                <section className="min-w-0">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <FileSpreadsheet className="size-4 text-[oklch(0.55_0.12_152)]" />
                    {t('sheetTitle')}
                  </h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{t('sheetBody')}</p>
                  <ul className="mt-2.5 flex flex-wrap gap-1.5">
                    {IMPORT_FIELDS.map((f) => (
                      <li key={f} className={cn('rounded-md px-1.5 py-0.5 text-xs', f === 'title' ? 'bg-accent-soft font-medium text-accent-ink' : 'bg-hover text-fg-muted')}>
                        {tc(f)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2.5 text-xs leading-relaxed text-fg-subtle">{t('sheetNote')}</p>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await downloadTemplate()
                        track('feature.tasks_import_template')
                      } catch {
                        toast.error(tTransfer('exportError'))
                      }
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium text-accent-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/30"
                  >
                    <Download className="size-3.5" />
                    {t('template')}
                  </button>
                </section>

                <section className="min-w-0 sm:border-l sm:border-line-soft sm:pl-8">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <SquareKanban className="size-4 text-[oklch(0.55_0.13_255)]" />
                    {t('trelloTitle')}
                  </h3>
                  <ol className="mt-2.5 flex flex-col gap-2">
                    {(['trelloStep1', 'trelloStep2', 'trelloStep3'] as const).map((k, i) => (
                      <li key={k} className="flex items-start gap-2.5 text-[13px] leading-snug text-fg">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-hover text-[11px] font-semibold tabular-nums text-fg-muted">{i + 1}</span>
                        <span className="pt-0.5">{t(k)}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 text-xs leading-relaxed text-fg-subtle">{t('trelloNote')}</p>
                </section>
              </div>
            </>
          ) : (
            <>
              <div className={cn('-mx-2 flex shrink-0 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors', over && 'bg-accent-soft/60')}>
                <FileBadge kind={parsed.kind} large />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{parsed.board ?? parsed.file}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-fg-muted">
                    <span>{t('found', { count: prepared.length })}</span>
                    {byStatus.map(([s, n]) => (
                      <span key={s} className="inline-flex items-center gap-1 tabular-nums" title={ts(s)}>
                        <StatusIcon status={s} className="size-3" />
                        {n}
                      </span>
                    ))}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={choose} loading={reading}>
                  <RefreshCw />
                  {t('other')}
                </Button>
              </div>

              {prepared.length ? (
                <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
                  {/* al costado: qué columnas se usan y cómo queda cada estado (con su casilla, para dejar afuera un grupo entero) */}
                  <aside className="flex shrink-0 flex-col gap-5 overflow-y-auto rounded-xl bg-canvas/70 p-4 ring-1 ring-inset ring-line-soft scrollbar-thin max-lg:max-h-64 lg:w-[21rem]">
                    <section className="min-w-0">
                      <h3 className="text-[13px] font-semibold text-fg">{parsed.source === 'trello' ? t('listsTitle') : t('statusesTitle')}</h3>
                      {rawStatuses.length ? (
                        <ul className="-mx-2 mt-2 flex flex-col gap-1">
                          {rawStatuses.map((s) => {
                            const idx = groupIdx(s.key)
                            const st = stateOf(idx)
                            return (
                              <li key={s.key} className="rounded-lg px-2 py-1.5 transition-colors hover:bg-panel/70">
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    checked={st.checked}
                                    indeterminate={st.indeterminate}
                                    onCheckedChange={() => toggleRows(idx)}
                                    aria-label={t('includeGroup', { value: s.label })}
                                  />
                                  <span className={cn('min-w-0 flex-1 text-[13px] leading-snug', st.on ? 'text-fg' : 'text-fg-subtle line-through')}>{s.label}</span>
                                  <span className="shrink-0 text-xs tabular-nums text-fg-subtle">{st.on === idx.length ? idx.length : `${st.on}/${idx.length}`}</span>
                                </div>
                                <div className="mt-1.5 flex items-center gap-2 pl-6">
                                  <ArrowRight className="size-3.5 shrink-0 text-fg-subtle" />
                                  <Select
                                    aria-label={t('statusFor', { value: s.label })}
                                    value={statusKey(optionFor(s.label, s.category))}
                                    onChange={(v) => setMapping((m) => ({ ...m, [s.key]: v }))}
                                    options={statusOptions}
                                    className="h-7 min-w-0 flex-1 px-2 text-xs"
                                  />
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      ) : (
                        <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{t('noStatus', { status: statusName(optionFor('', 'todo')) })}</p>
                      )}
                    </section>

                    <section className="min-w-0">
                      <h3 className="text-[13px] font-semibold text-fg">{parsed.source === 'trello' ? t('fromBoard') : t('columnsTitle')}</h3>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {parsed.columns.map((f) => (
                          <li key={f} className="inline-flex items-center gap-1 rounded-md bg-success-soft px-1.5 py-0.5 text-xs text-fg">
                            <Check className="size-3 text-success" strokeWidth={2.5} />
                            {tc(f)}
                          </li>
                        ))}
                        {parsed.ignored.map((h, i) => (
                          <li key={`${h}-${i}`} className="max-w-40 truncate rounded-md bg-hover px-1.5 py-0.5 text-xs text-fg-subtle line-through decoration-fg-subtle/60">
                            {h}
                          </li>
                        ))}
                      </ul>
                      {parsed.headerless ? (
                        <p className="mt-2 text-xs leading-relaxed text-fg-subtle">{t('headerless')}</p>
                      ) : parsed.ignored.length ? (
                        <p className="mt-2 text-xs leading-relaxed text-fg-subtle">{t('ignoredNote')}</p>
                      ) : null}
                    </section>

                    {unknownPeople.length ? (
                      <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs leading-relaxed text-fg">
                        <TriangleAlert className="mt-px size-3.5 shrink-0 text-mandarina-ink" />
                        {t('unknownPeople', { names: unknownPeople.slice(0, 6).join(', '), count: unknownPeople.length })}
                      </p>
                    ) : null}
                    {parsed.skipped ? <p className="text-xs text-fg-subtle">{t('skipped', { count: parsed.skipped })}</p> : null}
                  </aside>

                  {/* las tareas con todo su texto: el título entero, la descripción y las etiquetas; cada una con su casilla */}
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line">
                    <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
                      <table className="w-full min-w-[46rem] table-fixed text-left text-sm">
                        <colgroup>
                          <col className="w-11" />
                          <col />
                          <col className="w-[11.5rem]" />
                          <col className="w-[10rem]" />
                          {showPeople ? <col className="w-[8rem]" /> : null}
                          {showDue ? <col className="w-[5.5rem]" /> : null}
                        </colgroup>
                        <thead className="sticky top-0 z-[1] bg-sidebar text-xs text-fg-muted">
                          <tr>
                            <th className="px-3 py-2.5">
                              <Checkbox
                                checked={stateOf(allIdx).checked}
                                indeterminate={stateOf(allIdx).indeterminate}
                                onCheckedChange={() => toggleRows(allIdx)}
                                aria-label={t('selectAll')}
                              />
                            </th>
                            <th className="px-3 py-2.5 font-medium">{t('colTitle')}</th>
                            <th className="px-3 py-2.5 font-medium">{t('colStatus')}</th>
                            <th className="px-3 py-2.5 font-medium">{t('colLabels')}</th>
                            {showPeople ? <th className="px-3 py-2.5 font-medium">{t('colPeople')}</th> : null}
                            {showDue ? <th className="px-3 py-2.5 text-right font-medium">{t('colDue')}</th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {prepared.slice(0, PREVIEW_ROWS).map((r, i) => {
                            const on = !excluded.has(i)
                            return (
                              <tr
                                key={i}
                                onClick={() => toggleRows([i])}
                                className={cn('cursor-pointer border-t border-line-soft align-top transition-[background-color,opacity] hover:bg-hover/40', !on && 'opacity-45')}
                              >
                                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                  <Checkbox checked={on} onCheckedChange={() => toggleRows([i])} aria-label={t('include', { title: r.title })} />
                                </td>
                                <td className="px-3 py-2.5">
                                  <p className="flex items-start gap-1.5 text-[13.5px] font-medium leading-snug text-fg">
                                    {r.priority !== 'none' ? <PriorityIcon priority={r.priority} className="mt-[3px]" /> : null}
                                    <span className={cn('min-w-0', !on && 'line-through decoration-fg-subtle/70')}>{r.title}</span>
                                  </p>
                                  {r.description ? <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-fg-muted">{r.description}</p> : null}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="inline-flex items-start gap-1.5 text-xs leading-snug text-fg">
                                    <StatusIcon status={r.option.category} className="mt-px size-3.5" />
                                    {statusName(r.option)}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5">
                                  {r.labels.length ? (
                                    <span className="flex flex-wrap gap-1">
                                      {r.labels.map((l) => (
                                        <span key={l} className="rounded bg-hover px-1.5 py-px text-[11px] text-fg-muted">
                                          {l}
                                        </span>
                                      ))}
                                    </span>
                                  ) : null}
                                </td>
                                {showPeople ? (
                                  <td className="px-3 py-2.5 text-xs leading-snug text-fg-muted">
                                    {r.assigneeIds.map(firstName).filter(Boolean).join(', ')}
                                    {r.unknown.length ? (
                                      <span className="text-mandarina-ink">
                                        {r.assigneeIds.length ? ', ' : ''}
                                        {r.unknown.join(', ')}?
                                      </span>
                                    ) : null}
                                  </td>
                                ) : null}
                                {showDue ? (
                                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-fg-muted">{r.dueDate ? shortDate(parseISO(r.dueDate), dateLocale) : ''}</td>
                                ) : null}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {prepared.length > PREVIEW_ROWS ? (
                      <p className="border-t border-line-soft bg-canvas/60 px-3 py-1.5 text-xs text-fg-subtle">{t('andMore', { count: prepared.length - PREVIEW_ROWS })}</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="rounded-xl bg-canvas/70 px-4 py-6 text-center text-sm leading-relaxed text-fg-muted ring-1 ring-inset ring-line-soft">{t('empty')}</p>
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter className="flex-wrap justify-between gap-x-4 gap-y-3 border-t border-line-soft pt-4">
          <div className="flex min-w-0 items-center gap-2 text-[13px] text-fg-muted">
            <span className="shrink-0">{t('into')}</span>
            {editable.length > 1 ? (
              <Select
                aria-label={t('workspace')}
                value={ws}
                onChange={setWs}
                placeholder={t('pickWorkspace')}
                options={editable.map((w) => ({ value: w.id, label: w.name, icon: <WorkspaceMark ws={w} size={16} /> }))}
                className="h-8 w-56 max-w-full"
              />
            ) : workspace ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-fg">
                <WorkspaceMark ws={workspace} size={16} />
                <span className="truncate">{workspace.name}</span>
              </span>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {parsed && prepared.length && chosen.length !== prepared.length ? (
              <span className="mr-2 text-[13px] tabular-nums text-fg-muted">{t('selected', { count: chosen.length, total: prepared.length })}</span>
            ) : null}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            {parsed ? (
              <Button variant="primary" disabled={!ws || !chosen.length} loading={create.isPending} onClick={submit}>
                {chosen.length ? t('submit', { count: chosen.length }) : t('submitEmpty')}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
