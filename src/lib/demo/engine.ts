import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import { DEMO_USER_ID } from './config'
import type { Filter, Query, Result } from './query'
import { buildSeed, SEED_VERSION, type DemoStore } from './seed'

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
  return g.__veltroDemo
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
  account_members: () => ({ role: 'member' }),
  workspaces: () => ({ icon: '', color: 'violet', description: null, task_seq: 0, task_fields: [], created_by: null, archived_at: null }),
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
    priority: 'none',
    assignee_id: null,
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
  attachments: () => ({ task_id: null, meeting_id: null, doc_id: null, kind: 'file', storage_path: null, url: null, mime_type: null, size_bytes: null, uploaded_by: null }),
  google_connections: () => ({ access_token: null, access_token_expires_at: null, scopes: [], selected_calendar_ids: ['primary'] }),
  api_tokens: () => ({ last_used_at: null }),
  plans: () => ({}),
}

const NO_ID = new Set(['profiles', 'account_members', 'workspace_members', 'google_connections', 'plans'])
const NO_UPDATED = new Set(['account_members', 'workspace_members', 'api_tokens', 'plans', 'attachments'])

function workspaceRoleFor(s: DemoStore, workspaceId: string, userId: string) {
  const ws = s.tables.workspaces.find((w) => w.id === workspaceId)
  if (!ws) return null
  const am = s.tables.account_members.find((m) => m.account_id === ws.account_id && m.user_id === userId)
  if (am && (am.role === 'owner' || am.role === 'admin')) return 'admin'
  return (s.tables.workspace_members.find((m) => m.workspace_id === workspaceId && m.user_id === userId)?.role as string) ?? null
}

function beforeInsert(s: DemoStore, table: string, row: Row) {
  if (table === 'tasks') {
    const ws = s.tables.workspaces.find((w) => w.id === row.workspace_id)
    if (!ws) throw new DbError('forbidden')
    ws.task_seq = (ws.task_seq as number) + 1
    row.number = ws.task_seq
    row.created_by = DEMO_USER_ID
    row.completed_at = row.status === 'done' ? now() : null
    if (row.assignee_id && !workspaceRoleFor(s, row.workspace_id as string, row.assignee_id as string)) {
      throw new DbError('assignee_not_in_workspace')
    }
  }
  if (table === 'docs') {
    row.created_by = row.created_by ?? DEMO_USER_ID
    row.updated_by = row.updated_by ?? DEMO_USER_ID
    row.excerpt = String(row.content_text ?? '').slice(0, 240)
  }
  if (table === 'meetings') row.created_by = row.created_by ?? DEMO_USER_ID
  if (table === 'attachments') {
    row.uploaded_by = row.uploaded_by ?? DEMO_USER_ID
    for (const [col, tbl] of [['task_id', 'tasks'], ['meeting_id', 'meetings'], ['doc_id', 'docs']] as const) {
      if (row[col] && !(s.tables[tbl] as Row[]).some((r) => r.id === row[col] && r.workspace_id === row.workspace_id)) {
        throw new DbError('attachment_other_workspace')
      }
    }
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
  if (table === 'account_members') {
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
    if (next.status === 'done') next.completed_at = row.status === 'done' ? row.completed_at : now()
    else next.completed_at = null
    if (patch.assignee_id && !workspaceRoleFor(s, next.workspace_id as string, patch.assignee_id as string)) {
      throw new DbError('assignee_not_in_workspace')
    }
  }
  if (table === 'docs') {
    next.created_by = row.created_by
    next.updated_by = DEMO_USER_ID
    next.excerpt = String(next.content_text ?? '').slice(0, 240)
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
  }
  if (!NO_UPDATED.has(table)) next.updated_at = now()
  return next
}

function afterDelete(s: DemoStore, table: string, row: Row) {
  if (table === 'tasks') {
    s.tables.tasks = s.tables.tasks.filter((t) => t.parent_id !== row.id)
    s.tables.task_comments = s.tables.task_comments.filter((c) => c.task_id !== row.id)
  }
  if (table === 'account_members') {
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
