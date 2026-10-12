import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import { DEMO_USER_ID } from './config'
import type { Filter, Query, Result } from './query'
import { buildSeed, LOOSE_FILES, SEED_VERSION, type DemoStore } from './seed'
import { seedChats } from './chats-seed'

// ============================================================
// Base de datos en memoria para el modo demo.
// Emula las tablas, defaults y triggers de supabase/migrations/*_v2_core.sql
// (sin RLS: el usuario demo es dueño de la cuenta y ve todo).
// Se persiste en .demo/db.json para sobrevivir reinicios del servidor.
// ============================================================

type Row = Record<string, unknown>

const FILE = path.join(process.cwd(), '.demo', 'db.json')
const g = globalThis as unknown as { __veltroDemo?: DemoStore; __veltroDemoTimer?: ReturnType<typeof setTimeout> }

export function store(): DemoStore {
  // también al cambiar la versión del seed con el servidor ya corriendo (la memoria sobrevive al recargado en caliente)
  if (g.__veltroDemo && g.__veltroDemo.version !== SEED_VERSION) g.__veltroDemo = undefined
  if (!g.__veltroDemo) {
    try {
      const saved = JSON.parse(fs.readFileSync(FILE, 'utf8')) as DemoStore
      // un seed de una versión anterior se regenera
      g.__veltroDemo = saved.version === SEED_VERSION ? saved : buildSeed(new Date())
    } catch {
      g.__veltroDemo = buildSeed(new Date())
    }
    persist()
  }
  if ((g.__veltroDemo.schema ?? 0) < DEMO_SCHEMA) {
    upgrade(g.__veltroDemo)
    persist()
  }
  return g.__veltroDemo
}

/**
 * Cambios de esquema sobre datos demo ya guardados, sin regenerarlos (no se pierde lo que la persona probó).
 * 1: tasks.assignee_ids (varios responsables).
 * 2: tareas sin responsable con fecha esta semana, para repartirlas desde el calendario.
 * 3: bóveda (account_id, title y labels en adjuntos, archivos sueltos) y Pasillo (chats de ejemplo).
 */
const DEMO_SCHEMA = 3
const UNASSIGNED_DEMO_TASKS = ['Coordinar muestras para degustación en Farmatodo', 'Relevar precios de la competencia', 'Preparar ambiente de pruebas para el cliente']
function upgrade(saved: DemoStore) {
  const from = saved.schema ?? 0
  if (from < 1) {
    for (const t of saved.tables.tasks) {
      if (!Array.isArray(t.assignee_ids)) t.assignee_ids = t.assignee_id ? [t.assignee_id] : []
    }
  }
  if (from < 2) {
    // los ids del seed son aleatorios: se enlaza por la clave del espacio y se numera a continuación
    const fresh = buildSeed(new Date())
    const freshKey = new Map(fresh.tables.workspaces.map((w) => [w.id, w.key]))
    for (const title of UNASSIGNED_DEMO_TASKS) {
      if (saved.tables.tasks.some((t) => t.title === title)) continue
      const row = fresh.tables.tasks.find((t) => t.title === title)
      const ws = row && saved.tables.workspaces.find((w) => w.key === freshKey.get(row.workspace_id))
      if (!row || !ws) continue
      ws.task_seq = Number(ws.task_seq ?? 0) + 1
      saved.tables.tasks.push({ ...row, workspace_id: ws.id, number: ws.task_seq, created_by: ws.created_by ?? row.created_by })
    }
  }
  if (from < 3) {
    const accountId = (saved.tables.accounts[0]?.id as string | undefined) ?? null
    for (const a of saved.tables.attachments) {
      if (!Array.isArray(a.labels)) a.labels = []
      if (a.title === undefined) a.title = null
      if (!a.account_id) a.account_id = saved.tables.workspaces.find((w) => w.id === a.workspace_id)?.account_id ?? accountId
    }
    // títulos y etiquetas de los archivos de ejemplo (sin pisar lo que la persona haya cambiado)
    const fresh = buildSeed(new Date())
    for (const f of fresh.tables.attachments) {
      const mine = saved.tables.attachments.find((a) => a.name === f.name)
      if (!mine) continue
      if (!mine.title) mine.title = f.title
      if (!(mine.labels as string[]).length) mine.labels = f.labels
    }
    if (accountId) {
      for (const f of LOOSE_FILES(accountId)) {
        if (saved.tables.attachments.some((a) => a.name === f.row.name)) continue
        saved.files[f.storage_path] = f.dataUrl
        const by = saved.tables.profiles.find((p) => p.email === `${f.by}@veltro.demo`)?.id ?? DEMO_USER_ID
        saved.tables.attachments.push({ ...f.row, id: uuid(), uploaded_by: by, created_at: new Date(Date.now() - f.hours * 3_600_000).toISOString() })
      }
    }
    seedChats(saved, new Date())
  }
  saved.schema = DEMO_SCHEMA
}

export function resetStore() {
  g.__veltroDemo = buildSeed(new Date())
  persist()
}

export function persist() {
  if (g.__veltroDemoTimer) clearTimeout(g.__veltroDemoTimer)
  g.__veltroDemoTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true })
      fs.writeFileSync(FILE, JSON.stringify(g.__veltroDemo))
    } catch {
      // sin disco: se queda en memoria
    }
  }, 300)
}

const now = () => new Date().toISOString()
const uuid = () => crypto.randomUUID()
const clone = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T))

class DbError extends Error {
  constructor(public code: string) {
    super(code)
  }
}

// ---------------- filtros ----------------

function likeToRegex(pattern: string) {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\' && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    else if (c === '%') re += '.*'
    else if (c === '_') re += '.'
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'is')
}

function splitTopLevel(expr: string) {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const c of expr) {
    if (c === '(') depth++
    if (c === ')') depth--
    if (c === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
    } else cur += c
  }
  if (cur) parts.push(cur)
  return parts
}

function parseOr(expr: string): Filter[] {
  return splitTopLevel(expr).map((part) => {
    const [col, op, ...rest] = part.split('.')
    const raw = rest.join('.')
    if (op === 'in') return { op: 'in', col, value: raw.replace(/^\(|\)$/g, '').split(',').filter(Boolean) }
    if (op === 'is') return { op: 'is', col, value: raw === 'null' ? null : raw === 'true' }
    if (op === 'ilike') return { op: 'ilike', col, value: raw }
    return { op: 'eq', col, value: raw }
  })
}

function matches(row: Row, f: Filter): boolean {
  switch (f.op) {
    case 'eq':
      return String(row[f.col]) === String(f.value)
    case 'neq':
      return String(row[f.col]) !== String(f.value)
    case 'in':
      return f.value.map(String).includes(String(row[f.col]))
    case 'is':
      return f.value === null ? row[f.col] == null : row[f.col] === f.value
    case 'ilike':
      return typeof row[f.col] === 'string' && likeToRegex(f.value).test(row[f.col] as string)
    case 'contains': {
      const have = Array.isArray(row[f.col]) ? (row[f.col] as unknown[]).map(String) : []
      return f.value.every((v) => have.includes(String(v)))
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (row[f.col] == null) return false
      const c = compare(row[f.col], f.value)
      return f.op === 'gt' ? c > 0 : f.op === 'gte' ? c >= 0 : f.op === 'lt' ? c < 0 : c <= 0
    }
    case 'or':
      return parseOr(f.expr).some((sub) => matches(row, sub))
  }
}

function compare(a: unknown, b: unknown) {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

function project(row: Row, columns: string | null) {
  if (!columns || columns.trim() === '*' || columns.includes('(')) return row
  const out: Row = {}
  for (const c of columns.split(',').map((x) => x.trim()).filter(Boolean)) out[c] = row[c]
  return out
}

// ---------------- defaults y triggers ----------------

const DEFAULTS: Record<string, () => Row> = {
  profiles: () => ({ avatar_url: null, locale: 'es', timezone: 'America/Caracas', must_change_password: false, full_name: '' }),
  accounts: () => ({ plan_id: 'free' }),
  account_members: () => ({ role: 'member', title: null, department_id: null, reports_to: null }),
  departments: () => ({ head_id: null }),
  workspaces: () => ({ icon: '', color: 'violet', description: null, task_seq: 0, task_fields: [], task_statuses: [], created_by: null, archived_at: null }),
  workspace_members: () => ({ role: 'editor' }),
  meetings: () => ({
    google_event_id: null,
    google_calendar_id: null,
    title: '',
    ends_at: null,
    attendees: [],
    location: null,
    conference_url: null,
    html_link: null,
    created_by: null,
    series_key: null,
    phase: 'prep',
    summary: null,
    follow_up: null,
    closed_at: null,
  }),
  meeting_items: () => ({
    text: '',
    assignee_id: null,
    due_date: null,
    task_id: null,
    done: false,
    source: 'manual',
    position: 0,
    created_by: null,
  }),
  docs: () => ({
    parent_id: null,
    title: '',
    icon: null,
    content: [],
    content_text: '',
    import_markdown: null,
    source: 'manual',
    meeting_id: null,
    position: 0,
    created_by: null,
    updated_by: null,
    archived_at: null,
  }),
  tasks: () => ({
    number: 0,
    description: null,
    description_text: '',
    status: 'todo',
    status_id: null,
    priority: 'none',
    assignee_id: null,
    assignee_ids: [],
    due_date: null,
    start_date: null,
    estimate_hours: null,
    custom: {},
    labels: [],
    position: 0,
    parent_id: null,
    doc_id: null,
    doc_block_id: null,
    meeting_id: null,
    created_by: null,
    completed_at: null,
  }),
  task_comments: () => ({}),
  attachments: () => ({
    account_id: null,
    workspace_id: null,
    chat_id: null,
    task_id: null,
    meeting_id: null,
    doc_id: null,
    kind: 'file',
    title: null,
    labels: [],
    storage_path: null,
    url: null,
    mime_type: null,
    size_bytes: null,
    uploaded_by: null,
  }),
  chats: () => ({ name: null, created_by: null, last_message_at: null }),
  chat_members: () => ({ role: 'member', last_read_at: null }),
  chat_messages: () => ({ user_id: null, body: '', ref_id: null, meta: {}, edited_at: null }),
  google_connections: () => ({ access_token: null, access_token_expires_at: null, scopes: [], selected_calendar_ids: ['primary'] }),
  api_tokens: () => ({ last_used_at: null }),
  plans: () => ({}),
}

const NO_ID = new Set(['profiles', 'account_members', 'workspace_members', 'google_connections', 'plans', 'chat_members'])
const NO_UPDATED = new Set(['account_members', 'workspace_members', 'api_tokens', 'plans', 'attachments', 'chat_members', 'chat_messages'])

/** Un adjunto vinculado a una tarea, reunión o doc vive en el espacio de eso; suelto, es de la cuenta. */
function placeAttachment(s: DemoStore, row: Row) {
  for (const [col, tbl] of [['task_id', 'tasks'], ['meeting_id', 'meetings'], ['doc_id', 'docs']] as const) {
    if (!row[col]) continue
    const target = (s.tables[tbl] as Row[]).find((r) => r.id === row[col])
    if (!target) throw new DbError('not_found')
    if (row.workspace_id && row.workspace_id !== target.workspace_id) throw new DbError('attachment_other_workspace')
    row.workspace_id = target.workspace_id
  }
  const ws = row.workspace_id ? s.tables.workspaces.find((w) => w.id === row.workspace_id) : undefined
  row.account_id = ws?.account_id ?? row.account_id ?? s.tables.accounts[0]?.id ?? null
}

function workspaceRoleFor(s: DemoStore, workspaceId: string, userId: string) {
  const ws = s.tables.workspaces.find((w) => w.id === workspaceId)
  if (!ws) return null
  const am = s.tables.account_members.find((m) => m.account_id === ws.account_id && m.user_id === userId)
  if (am && (am.role === 'owner' || am.role === 'admin')) return 'admin'
  return (s.tables.workspace_members.find((m) => m.workspace_id === workspaceId && m.user_id === userId)?.role as string) ?? null
}

// Emula tasks_a_sync_status: la categoría (status) sale del estado propio; si solo cambia la
// categoría, se toma el primer estado propio de esa categoría.
function syncStatus(s: DemoStore, next: Row, prev: Row | null) {
  const ws = s.tables.workspaces.find((w) => w.id === next.workspace_id)
  const list = ((ws?.task_statuses as Row[] | undefined) ?? []) as { id: string; category: string }[]
  if (!list.length) {
    next.status_id = null
    return
  }
  if (prev && next.status !== prev.status && next.status_id === prev.status_id) {
    next.status_id = list.find((x) => x.category === next.status)?.id ?? null
  }
  if (next.status_id) {
    const own = list.find((x) => x.id === next.status_id)
    if (!own) {
      if (!prev || next.status_id !== prev.status_id) throw new DbError('invalid_status')
      next.status_id = null
    } else next.status = own.category
  }
}

// Emula account_members_check_org: departamento de la cuenta, sin ciclos en "reporta a"
function checkOrg(s: DemoStore, next: Row) {
  if (next.department_id && !s.tables.departments.some((d) => d.id === next.department_id && d.account_id === next.account_id)) {
    throw new DbError('department_other_account')
  }
  if (next.reports_to) {
    if (next.reports_to === next.user_id) throw new DbError('reports_to_self')
    if (!s.tables.account_members.some((m) => m.account_id === next.account_id && m.user_id === next.reports_to)) throw new DbError('reports_to_not_member')
    let cursor = next.reports_to as string | null
    for (let i = 0; cursor && i < 64; i++) {
      if (cursor === next.user_id) throw new DbError('reports_to_cycle')
      cursor = (s.tables.account_members.find((m) => m.account_id === next.account_id && m.user_id === cursor)?.reports_to as string | null) ?? null
    }
  }
}

/** Igual que tasks_sync_assignees en la base: lista sin repetidos, assignee_id = el primero y solo se valida a quien entra. */
function syncAssignees(s: DemoStore, next: Row, prev: Row | null) {
  const prevIds = ((prev?.assignee_ids as string[] | undefined) ?? []).slice()
  let ids = ((next.assignee_ids as string[] | undefined) ?? []).slice()
  if (!prev) {
    if (!ids.length && next.assignee_id) ids = [next.assignee_id as string]
  } else if (JSON.stringify(ids) === JSON.stringify(prevIds) && next.assignee_id !== prev.assignee_id) {
    // cambió solo el responsable único: reemplaza al primero y los demás se quedan
    ids = prevIds.filter((x) => x !== prev.assignee_id)
    if (next.assignee_id) ids.unshift(next.assignee_id as string)
  }
  ids = [...new Set(ids.filter(Boolean))]
  if (ids.length > 20) throw new DbError('too_many_assignees')
  for (const id of ids) {
    const added = !prev || next.workspace_id !== prev.workspace_id || !prevIds.includes(id)
    if (added && !workspaceRoleFor(s, next.workspace_id as string, id)) throw new DbError('assignee_not_in_workspace')
  }
  next.assignee_ids = ids
  next.assignee_id = ids[0] ?? null
}

function beforeInsert(s: DemoStore, table: string, row: Row) {
  if (table === 'tasks') {
    const ws = s.tables.workspaces.find((w) => w.id === row.workspace_id)
    if (!ws) throw new DbError('forbidden')
    ws.task_seq = (ws.task_seq as number) + 1
    row.number = ws.task_seq
    row.created_by = DEMO_USER_ID
    syncStatus(s, row, null)
    syncAssignees(s, row, null)
    row.completed_at = row.status === 'done' ? now() : null
  }
  if (table === 'docs') {
    row.created_by = row.created_by ?? DEMO_USER_ID
    row.updated_by = row.updated_by ?? DEMO_USER_ID
    row.excerpt = String(row.content_text ?? '').slice(0, 240)
  }
  if (table === 'meetings') row.created_by = row.created_by ?? DEMO_USER_ID
  if (table === 'attachments') {
    row.uploaded_by = row.uploaded_by ?? DEMO_USER_ID
    placeAttachment(s, row)
  }
  if (table === 'chats') row.created_by = row.created_by ?? DEMO_USER_ID
  if (table === 'chat_messages') {
    if (row.kind !== 'system') row.user_id = row.user_id ?? DEMO_USER_ID
    const chat = s.tables.chats.find((c) => c.id === row.chat_id)
    if (!chat) throw new DbError('not_found')
    chat.last_message_at = row.created_at
    chat.updated_at = row.created_at
    // quien escribe ya leyó hasta aquí
    const me = s.tables.chat_members.find((m) => m.chat_id === row.chat_id && m.user_id === row.user_id)
    if (me) me.last_read_at = row.created_at
  }
  if (table === 'meeting_items') {
    const meeting = s.tables.meetings.find((m) => m.id === row.meeting_id)
    if (!meeting) throw new DbError('meeting_not_found')
    row.workspace_id = meeting.workspace_id
    row.created_by = row.created_by ?? DEMO_USER_ID
    if (row.assignee_id && !workspaceRoleFor(s, row.workspace_id as string, row.assignee_id as string)) {
      throw new DbError('assignee_not_in_workspace')
    }
  }
  if (table === 'task_comments') {
    const task = s.tables.tasks.find((t) => t.id === row.task_id)
    if (!task) throw new DbError('task_not_found')
    row.workspace_id = task.workspace_id
    row.user_id = DEMO_USER_ID
  }
  if (table === 'departments' && row.head_id && !s.tables.account_members.some((m) => m.account_id === row.account_id && m.user_id === row.head_id)) {
    throw new DbError('head_not_member')
  }
  if (table === 'account_members') {
    checkOrg(s, row)
    const acc = s.tables.accounts.find((a) => a.id === row.account_id)
    const plan = s.tables.plans.find((p) => p.id === acc?.plan_id)
    const count = s.tables.account_members.filter((m) => m.account_id === row.account_id).length
    if (plan?.max_members != null && count >= (plan.max_members as number)) throw new DbError('plan_limit_members')
  }
}

function beforeUpdate(s: DemoStore, table: string, row: Row, patch: Row) {
  const next = { ...row, ...patch }
  if (table === 'tasks') {
    next.number = row.number
    next.created_by = row.created_by
    syncStatus(s, next, row)
    if (next.status === 'done') next.completed_at = row.status === 'done' ? row.completed_at : now()
    else next.completed_at = null
    syncAssignees(s, next, row)
  }
  if (table === 'docs') {
    next.created_by = row.created_by
    next.updated_by = DEMO_USER_ID
    next.excerpt = String(next.content_text ?? '').slice(0, 240)
  }
  if (table === 'attachments' && ('task_id' in patch || 'meeting_id' in patch || 'doc_id' in patch || 'workspace_id' in patch)) {
    // al soltar un vínculo el espacio se mantiene salvo que se cambie a propósito
    if (!('workspace_id' in patch) && (patch.task_id || patch.meeting_id || patch.doc_id)) next.workspace_id = null
    placeAttachment(s, next)
  }
  if (table === 'meeting_items') {
    next.workspace_id = row.workspace_id
    next.created_by = row.created_by
    if (patch.assignee_id && !workspaceRoleFor(s, next.workspace_id as string, patch.assignee_id as string)) {
      throw new DbError('assignee_not_in_workspace')
    }
  }
  if (table === 'account_members') {
    if (row.role === 'owner' && next.role !== 'owner') throw new DbError('cannot_remove_owner')
    if (row.role !== 'owner' && next.role === 'owner') throw new DbError('cannot_assign_owner')
    checkOrg(s, next)
  }
  if (table === 'departments') {
    next.account_id = row.account_id
    if (next.head_id && !s.tables.account_members.some((m) => m.account_id === next.account_id && m.user_id === next.head_id)) throw new DbError('head_not_member')
  }
  if (table === 'workspaces' && 'task_statuses' in patch) {
    // emula workspaces_cleanup_statuses: tareas con un estado borrado quedan solo con su categoría
    const ids = new Set(((patch.task_statuses as Row[]) ?? []).map((x) => x.id))
    s.tables.tasks.forEach((t) => t.workspace_id === row.id && t.status_id && !ids.has(t.status_id) && (t.status_id = null))
  }
  if (!NO_UPDATED.has(table)) next.updated_at = now()
  return next
}

function afterDelete(s: DemoStore, table: string, row: Row) {
  if (table === 'departments') {
    s.tables.account_members.forEach((m) => m.department_id === row.id && (m.department_id = null))
  }
  if (table === 'tasks') {
    s.tables.tasks = s.tables.tasks.filter((t) => t.parent_id !== row.id)
    s.tables.task_comments = s.tables.task_comments.filter((c) => c.task_id !== row.id)
  }
  if (table === 'account_members') {
    s.tables.account_members.forEach((m) => m.account_id === row.account_id && m.reports_to === row.user_id && (m.reports_to = null))
    s.tables.departments.forEach((d) => d.account_id === row.account_id && d.head_id === row.user_id && (d.head_id = null))
    const wsIds = s.tables.workspaces.filter((w) => w.account_id === row.account_id).map((w) => w.id)
    s.tables.workspace_members = s.tables.workspace_members.filter((m) => !(m.user_id === row.user_id && wsIds.includes(m.workspace_id)))
  }
  if (table === 'tasks') {
    s.tables.meeting_items.forEach((i) => i.task_id === row.id && (i.task_id = null))
    s.tables.attachments = s.tables.attachments.filter((a) => a.task_id !== row.id)
  }
  if (table === 'meetings') {
    s.tables.meeting_items = s.tables.meeting_items.filter((i) => i.meeting_id !== row.id)
    s.tables.docs.forEach((d) => d.meeting_id === row.id && (d.meeting_id = null))
    s.tables.tasks.forEach((t) => t.meeting_id === row.id && (t.meeting_id = null))
  }
}

// ---------------- ejecución ----------------

export function executeQuery(q: Query): Result {
  const s = store()
  const tables = s.tables as Record<string, Row[]>
  const table = tables[q.table]
  if (!table) return { data: null, error: { message: `unknown table ${q.table}` } }

  try {
    let affected: Row[] = []

    if (q.action === 'select') {
      affected = table.filter((r) => q.filters.every((f) => matches(r, f)))
    } else if (q.action === 'insert' || q.action === 'upsert') {
      const values = Array.isArray(q.values) ? q.values : [q.values ?? {}]
      const conflict = q.onConflict?.split(',').map((c) => c.trim()) ?? (q.action === 'upsert' ? defaultConflict(q.table) : null)
      for (const v of values) {
        const existing = conflict ? table.find((r) => conflict.every((c) => String(r[c]) === String(v[c]))) : undefined
        if (existing && q.action === 'upsert') {
          Object.assign(existing, beforeUpdate(s, q.table, existing, clone(v)))
          affected.push(existing)
          continue
        }
        const row: Row = { ...DEFAULTS[q.table]?.(), ...clone(v) }
        if (!NO_ID.has(q.table) && !row.id) row.id = uuid()
        row.created_at = row.created_at ?? now()
        if (!NO_UPDATED.has(q.table)) row.updated_at = row.updated_at ?? now()
        beforeInsert(s, q.table, row)
        table.push(row)
        affected.push(row)
      }
      persist()
    } else if (q.action === 'update') {
      const patch = clone(q.values as Row)
      for (const r of table) {
        if (!q.filters.every((f) => matches(r, f))) continue
        Object.assign(r, beforeUpdate(s, q.table, r, patch))
        affected.push(r)
      }
      persist()
    } else if (q.action === 'delete') {
      const keep: Row[] = []
      for (const r of table) {
        if (q.filters.every((f) => matches(r, f))) affected.push(r)
        else keep.push(r)
      }
      for (const r of affected) {
        if (q.table === 'account_members' && r.role === 'owner') throw new DbError('cannot_remove_owner')
      }
      tables[q.table] = keep
      affected.forEach((r) => afterDelete(s, q.table, r))
      persist()
    }

    if (q.order.length) {
      affected = [...affected].sort((a, b) => {
        for (const o of q.order) {
          const c = compare(a[o.col], b[o.col])
          if (c !== 0) return o.ascending ? c : -c
        }
        return 0
      })
    }
    const total = affected.length
    if (q.limit != null) affected = affected.slice(0, q.limit)

    if (q.head) return { data: null, error: null, count: total }
    const returning = q.action === 'select' || q.columns != null
    if (!returning) return { data: null, error: null, count: q.count ? total : null }

    const rows = affected.map((r) => clone(project(r, q.columns)))
    if (q.single) {
      if (rows.length === 0) {
        return q.single === 'maybeSingle'
          ? { data: null, error: null }
          : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } }
      }
      return { data: rows[0], error: null }
    }
    return { data: rows, error: null, count: q.count ? total : null }
  } catch (e) {
    return { data: null, error: { message: e instanceof DbError ? e.code : String(e), code: 'P0001' } }
  }
}

function defaultConflict(table: string) {
  if (table === 'workspace_members') return ['workspace_id', 'user_id']
  if (table === 'chat_members') return ['chat_id', 'user_id']
  if (table === 'account_members') return ['account_id', 'user_id']
  if (table === 'google_connections' || table === 'profiles') return table === 'profiles' ? ['id'] : ['user_id']
  return ['id']
}

// ---------------- RPCs ----------------

export function executeRpc(name: string, args: Record<string, unknown>): Result {
  const s = store()
  try {
    switch (name) {
      case 'get_my_google_connection': {
        const c = s.tables.google_connections.find((x) => x.user_id === DEMO_USER_ID)
        return { data: c ? [{ google_email: c.google_email, selected_calendar_ids: c.selected_calendar_ids, connected_at: c.created_at }] : [], error: null }
      }
      case 'get_account_usage': {
        const acc = s.tables.accounts.find((a) => a.id === args.p_account)
        const plan = s.tables.plans.find((p) => p.id === acc?.plan_id)
        if (!acc || !plan) return { data: [], error: null }
        return {
          data: [
            {
              plan_id: plan.id,
              plan_name: plan.name,
              max_workspaces: plan.max_workspaces,
              max_members: plan.max_members,
              workspaces_count: s.tables.workspaces.filter((w) => w.account_id === acc.id && !w.archived_at).length,
              members_count: s.tables.account_members.filter((m) => m.account_id === acc.id).length,
            },
          ],
          error: null,
        }
      }
      // telemetría de la consola: en demo no se guarda
      case 'touch_presence':
      case 'track_events':
        return { data: null, error: null }
      case 'workspace_role_for':
        return { data: workspaceRoleFor(s, String(args.p_workspace), String(args.p_user)), error: null }
      case 'create_account': {
        if (s.tables.account_members.some((m) => m.user_id === DEMO_USER_ID)) throw new DbError('already_in_account')
        const acc = { id: uuid(), name: String(args.p_name), plan_id: 'free', owner_id: DEMO_USER_ID, created_at: now(), updated_at: now() }
        s.tables.accounts.push(acc)
        s.tables.account_members.push({ account_id: acc.id, user_id: DEMO_USER_ID, role: 'owner', created_at: now() })
        persist()
        return { data: acc, error: null }
      }
      case 'create_workspace': {
        const accountId = String(args.p_account_id)
        const acc = s.tables.accounts.find((a) => a.id === accountId)
        const plan = s.tables.plans.find((p) => p.id === acc?.plan_id)
        const count = s.tables.workspaces.filter((w) => w.account_id === accountId && !w.archived_at).length
        if (plan?.max_workspaces != null && count >= (plan.max_workspaces as number)) throw new DbError('plan_limit_workspaces')
        const base = String(args.p_slug || 'espacio')
        let slug = base
        let n = 1
        while (s.tables.workspaces.some((w) => w.slug === slug)) slug = `${base}-${++n}`
        const key = String(args.p_key ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
        const ws = {
          id: uuid(),
          account_id: accountId,
          name: String(args.p_name).trim(),
          slug,
          key: key.length >= 2 ? key : 'WS',
          icon: ((args.p_icon as string) || String(args.p_name).trim()[0] || 'V').slice(0, 2).toUpperCase(),
          color: (args.p_color as string) || 'violet',
          description: (args.p_description as string) ?? null,
          task_seq: 0,
          created_by: DEMO_USER_ID,
          created_at: now(),
          updated_at: now(),
          archived_at: null,
        }
        s.tables.workspaces.push(ws)
        s.tables.workspace_members.push({ workspace_id: ws.id, user_id: DEMO_USER_ID, role: 'admin', created_at: now() })
        persist()
        return { data: ws, error: null }
      }
    }
    return { data: null, error: { message: `unknown rpc ${name}` } }
  } catch (e) {
    return { data: null, error: { message: e instanceof DbError ? e.code : String(e), code: 'P0001' } }
  }
}

// ---------------- auth.admin ----------------

export function demoCreateUser(email: string, meta: Record<string, unknown>) {
  const s = store()
  if (s.tables.profiles.some((p) => p.email === email)) return { user: null, error: { message: 'exists', code: 'email_exists' } }
  const id = uuid()
  s.tables.profiles.push({
    ...DEFAULTS.profiles(),
    id,
    email,
    full_name: String(meta.full_name ?? email.split('@')[0]),
    must_change_password: Boolean(meta.must_change_password),
    created_at: now(),
    updated_at: now(),
  })
  persist()
  return { user: { id, email }, error: null }
}

export function demoDeleteUser(id: string) {
  const s = store()
  s.tables.profiles = s.tables.profiles.filter((p) => p.id !== id)
  persist()
}

// ---------------- archivos ----------------

export function demoSaveFile(pathKey: string, dataUrl: string) {
  store().files[pathKey] = dataUrl
  persist()
}

export function demoGetFile(pathKey: string) {
  return store().files[pathKey] ?? null
}
