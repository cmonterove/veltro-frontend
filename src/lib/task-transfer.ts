/**
 * Importar tareas: de una hoja (Excel o CSV) o de un tablero de Trello (su JSON exportado) a filas
 * listas para crear. Sin React: lo usa el diálogo de importar y se puede probar aparte.
 *
 * Las columnas se reconocen por el nombre del encabezado en español, inglés o portugués (Título,
 * Title, Nombre…). Estados y prioridades se traducen a las categorías de Veltro; los responsables se
 * buscan por email o por nombre entre la gente del espacio.
 */

import type { TaskPriority, TaskStatus } from './database.types'

export type ImportRow = {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  /** lo que venía escrito (nombres o emails), para buscarlos en el espacio */
  assigneeNames: string[]
  dueDate: string | null
  startDate: string | null
  labels: string[]
}

export type ImportPerson = { id: string; email: string; full_name: string }

type Field = 'title' | 'description' | 'status' | 'priority' | 'assignees' | 'due' | 'start' | 'labels'

/** Sin acentos, minúsculas y sin espacios de más. */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const HEADERS: Record<Field, string[]> = {
  title: ['titulo', 'title', 'nombre', 'name', 'tarea', 'task', 'card name', 'asunto', 'summary', 'resumen'],
  description: ['descripcion', 'description', 'desc', 'notas', 'notes', 'detalle', 'detalles', 'details', 'card description'],
  status: ['estado', 'status', 'lista', 'list', 'list name', 'columna', 'column', 'etapa', 'stage', 'situacao'],
  priority: ['prioridad', 'priority', 'prioridade'],
  assignees: ['responsable', 'responsables', 'asignado', 'asignada', 'asignados', 'assignee', 'assignees', 'owner', 'members', 'miembros', 'responsavel', 'responsaveis'],
  due: ['entrega', 'fecha de entrega', 'vence', 'vencimiento', 'fecha limite', 'due', 'due date', 'deadline', 'fecha', 'date', 'prazo'],
  start: ['inicio', 'fecha de inicio', 'start', 'start date', 'comienzo'],
  labels: ['etiquetas', 'etiqueta', 'labels', 'label', 'tags', 'tag'],
}

/** Qué columna es cada dato (por su encabezado). La primera que coincide gana. */
export function detectColumns(header: unknown[]): Partial<Record<Field, number>> {
  const out: Partial<Record<Field, number>> = {}
  header.forEach((h, i) => {
    const name = fold(String(h ?? ''))
    if (!name) return
    for (const [field, names] of Object.entries(HEADERS) as [Field, string[]][]) {
      if (out[field] === undefined && names.includes(name)) out[field] = i
    }
  })
  return out
}

const STATUS_WORDS: [TaskStatus, string[]][] = [
  ['done', ['hecho', 'hecha', 'hechas', 'terminado', 'terminada', 'completado', 'completada', 'cerrado', 'cerrada', 'finalizado', 'listo', 'done', 'complete', 'completed', 'closed', 'resolved', 'concluido', 'feito']],
  ['in_progress', ['en curso', 'en progreso', 'en proceso', 'haciendo', 'doing', 'in progress', 'wip', 'working', 'em andamento', 'fazendo']],
  ['blocked', ['bloqueado', 'bloqueada', 'blocked', 'en espera', 'on hold', 'esperando']],
  ['backlog', ['backlog', 'ideas', 'algun dia', 'someday']],
  ['todo', ['por hacer', 'pendiente', 'to do', 'todo', 'abierto', 'abierta', 'nuevo', 'nueva', 'open', 'new', 'a fazer']],
]

/** Estado escrito a mano → categoría de Veltro. «Hecho», «Done», «En curso»… Lo que no se reconoce queda por hacer. */
export function statusFrom(v: unknown): TaskStatus {
  const s = fold(String(v ?? ''))
  if (!s) return 'todo'
  for (const [status, words] of STATUS_WORDS) if (words.some((w) => s === w || s.startsWith(`${w} `) || s.endsWith(` ${w}`))) return status
  for (const [status, words] of STATUS_WORDS) if (words.some((w) => w.length > 3 && s.includes(w))) return status
  return 'todo'
}

export function priorityFrom(v: unknown): TaskPriority {
  const s = fold(String(v ?? ''))
  if (/urgen/.test(s) || s === 'p0' || s === 'critica' || s === 'critical') return 'urgent'
  if (/^(alta|high|alto|p1)$/.test(s)) return 'high'
  if (/^(media|medio|medium|normal|p2)$/.test(s)) return 'medium'
  if (/^(baja|bajo|low|p3)$/.test(s)) return 'low'
  return 'none'
}

const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null
}

/** Una fecha de hoja o de texto → AAAA-MM-DD. «15/11/2026» se lee día/mes (así se escribe en español). */
export function dateFrom(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : iso(v.getFullYear(), v.getMonth() + 1, v.getDate())
  if (typeof v === 'number') {
    // número de serie de Excel (días desde 1899-12-30)
    if (v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10)
    return null
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    // día/mes; si el «mes» pasa de 12, era mes/día
    return +m[2] > 12 ? iso(y, +m[1], +m[2]) : iso(y, +m[2], +m[1])
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : iso(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

const splitList = (v: unknown) =>
  String(v ?? '')
    .split(/[,;\n/|]+/)
    .map((x) => x.trim())
    .filter(Boolean)

const text = (v: unknown) => (v instanceof Date ? (dateFrom(v) ?? '') : v == null ? '' : String(v)).trim()

/** Filas de una hoja (la primera es el encabezado) → tareas. Sin columna de título no hay nada que importar. */
export function rowsFromSheet(sheet: unknown[][]): { rows: ImportRow[]; missingTitle: boolean; skipped: number } {
  const [header = [], ...data] = sheet
  const col = detectColumns(header)
  // sin encabezado reconocible, la primera columna es el título
  const titleCol = col.title ?? (Object.keys(col).length === 0 ? 0 : undefined)
  if (titleCol === undefined) return { rows: [], missingTitle: true, skipped: 0 }
  const at = (r: unknown[], f: Field) => (col[f] === undefined ? undefined : r[col[f]!])
  let skipped = 0
  const rows: ImportRow[] = []
  for (const r of data) {
    const title = text(r[titleCol]).slice(0, 500)
    if (!title) {
      if (r.some((c) => text(c))) skipped++
      continue
    }
    rows.push({
      title,
      description: text(at(r, 'description')).slice(0, 20_000),
      status: statusFrom(at(r, 'status')),
      priority: priorityFrom(at(r, 'priority')),
      assigneeNames: splitList(at(r, 'assignees')),
      dueDate: dateFrom(at(r, 'due')),
      startDate: dateFrom(at(r, 'start')),
      labels: splitList(at(r, 'labels'))
        .map((l) => l.toLowerCase().slice(0, 40))
        .slice(0, 20),
    })
  }
  return { rows, missingTitle: false, skipped }
}

/** CSV (coma o punto y coma, con comillas) → filas de celdas. */
export function parseCsv(input: string): string[][] {
  const textIn = input.replace(/^﻿/, '')
  const firstLine = textIn.split(/\r?\n/, 1)[0] ?? ''
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ','
  const out: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < textIn.length; i++) {
    const c = textIn[i]
    if (quoted) {
      if (c === '"' && textIn[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === sep) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && textIn[i + 1] === '\n') i++
      row.push(cell)
      out.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    out.push(row)
  }
  return out.filter((r) => r.some((c) => c.trim()))
}

type TrelloBoard = {
  name?: string
  lists?: { id: string; name: string; closed?: boolean }[]
  cards?: { name: string; desc?: string; idList: string; due?: string | null; start?: string | null; dueComplete?: boolean; closed?: boolean; labels?: { name?: string; color?: string }[]; idMembers?: string[] }[]
  members?: { id: string; fullName?: string; username?: string }[]
}

/** ¿Es el JSON que exporta Trello (Menú del tablero › Imprimir, exportar y compartir › Exportar a JSON)? */
export function isTrelloBoard(v: unknown): v is TrelloBoard {
  return Boolean(v && typeof v === 'object' && Array.isArray((v as TrelloBoard).cards) && Array.isArray((v as TrelloBoard).lists))
}

/** Tablero de Trello → tareas: la lista da el estado, las etiquetas y los miembros pasan tal cual. Sin las archivadas. */
export function rowsFromTrello(board: TrelloBoard): { rows: ImportRow[]; board: string } {
  const lists = new Map((board.lists ?? []).map((l) => [l.id, l]))
  const members = new Map((board.members ?? []).map((m) => [m.id, m.fullName || m.username || '']))
  const rows: ImportRow[] = []
  for (const c of board.cards ?? []) {
    const list = lists.get(c.idList)
    if (c.closed || list?.closed || !c.name?.trim()) continue
    rows.push({
      title: c.name.trim().slice(0, 500),
      description: (c.desc ?? '').trim().slice(0, 20_000),
      status: c.dueComplete ? 'done' : statusFrom(list?.name),
      priority: 'none',
      assigneeNames: (c.idMembers ?? []).map((id) => members.get(id) ?? '').filter(Boolean),
      dueDate: dateFrom(c.due),
      startDate: dateFrom(c.start),
      labels: (c.labels ?? [])
        .map((l) => (l.name || l.color || '').toLowerCase().slice(0, 40))
        .filter(Boolean)
        .slice(0, 20),
    })
  }
  return { rows, board: board.name ?? '' }
}

/** Nombres o emails → ids de la gente del espacio. Por email exacto, nombre completo o un primer nombre que no se repite. */
export function matchPeople(names: string[], people: ImportPerson[]): { ids: string[]; unknown: string[] } {
  const ids: string[] = []
  const unknown: string[] = []
  for (const raw of names) {
    const n = fold(raw)
    const byEmail = people.find((p) => fold(p.email) === n)
    const byName = people.find((p) => fold(p.full_name) === n)
    const first = people.filter((p) => fold(p.full_name).split(' ')[0] === n)
    const hit = byEmail ?? byName ?? (first.length === 1 ? first[0] : undefined)
    if (hit) {
      if (!ids.includes(hit.id)) ids.push(hit.id)
    } else unknown.push(raw)
  }
  return { ids: ids.slice(0, 20), unknown }
}
