import type { DemoStore } from './seed'

// ============================================================
// Soporte y requerimientos en el modo demo.
// Emula los triggers de supabase/migrations/20261103090000_v2_support.sql: el código correlativo,
// el destino según el rol de quien crea el ticket (accounts.support_routing), los cambios de
// estado al responder, los mensajes de sistema y el apoyo inicial de quien pide un requerimiento.
// ============================================================

type Row = Record<string, unknown>

export const SUPPORT_TABLES = [
  'support_tickets',
  'support_ticket_messages',
  'support_ticket_reads',
  'feature_requests',
  'feature_request_updates',
  'feature_request_supporters',
  'feature_request_reads',
] as const

export const DEFAULT_ROUTING = { member: 'account_admins', admin: 'veltro', owner: 'veltro' } as const

const DESTINATIONS = ['account_admins', 'account_owner', 'veltro']

export class SupportError extends Error {
  constructor(public code: string) {
    super(code)
  }
}

const now = () => new Date().toISOString()
const uuid = () => crypto.randomUUID()

export const SUPPORT_DEFAULTS: Record<string, () => Row> = {
  support_tickets: () => ({ workspace_id: null, category: 'other', urgent: false, where_text: null, screenshots: [], status: 'open', resolved_at: null }),
  support_ticket_messages: () => ({ author_id: null, author_kind: 'member' }),
  support_ticket_reads: () => ({}),
  feature_requests: () => ({ workspace_id: null, why: null, impact: 'nice', status: 'received' }),
  feature_request_updates: () => ({ body: '', author_kind: 'veltro', author_id: null }),
  feature_request_supporters: () => ({}),
  feature_request_reads: () => ({}),
}

/** Tablas sin id propio (clave compuesta) y sin updated_at. */
export const SUPPORT_NO_ID = ['support_ticket_reads', 'feature_request_supporters', 'feature_request_reads']
export const SUPPORT_NO_UPDATED = ['support_ticket_messages', 'support_ticket_reads', 'feature_request_updates', 'feature_request_supporters', 'feature_request_reads']

export const SUPPORT_CONFLICT: Record<string, string[]> = {
  support_ticket_reads: ['ticket_id', 'user_id'],
  feature_request_supporters: ['request_id', 'user_id'],
  feature_request_reads: ['request_id', 'user_id'],
}

/** Garantiza las tablas y las columnas nuevas de la cuenta en datos ya guardados. */
export function ensureSupport(s: DemoStore) {
  const t = s.tables as unknown as Record<string, Row[]>
  for (const name of SUPPORT_TABLES) t[name] ??= []
  for (const a of s.tables.accounts) {
    a.support_routing ??= { ...DEFAULT_ROUTING }
    a.ticket_seq ??= 0
    a.request_seq ??= 0
  }
}

function roleOf(s: DemoStore, accountId: unknown, userId: unknown) {
  return (s.tables.account_members.find((m) => m.account_id === accountId && m.user_id === userId)?.role as string | undefined) ?? null
}

function upsertRead(s: DemoStore, table: 'support_ticket_reads' | 'feature_request_reads', key: 'ticket_id' | 'request_id', id: unknown, userId: unknown, at: string) {
  const rows = (s.tables as unknown as Record<string, Row[]>)[table]
  const mine = rows.find((r) => r[key] === id && r.user_id === userId)
  if (mine) mine.last_read_at = at
  else rows.push({ [key]: id, user_id: userId, last_read_at: at, created_at: at })
}

/** Cambia el estado de un ticket como lo hace la base: deja un mensaje de sistema y marca resolved_at. */
function setTicketStatus(s: DemoStore, ticket: Row, status: string, authorId: unknown, at = now()) {
  if (ticket.status === status) return
  ticket.status = status
  ticket.resolved_at = status === 'resolved' ? at : null
  ticket.updated_at = at
  ticket.last_message_at = at
  ;(s.tables as unknown as Record<string, Row[]>).support_ticket_messages.push({ id: uuid(), ticket_id: ticket.id, author_id: authorId ?? null, author_kind: 'system', body: status, created_at: at })
}

/** Igual que los triggers BEFORE/AFTER INSERT de la migración. `actor` = persona por defecto del demo. */
export function supportBeforeInsert(s: DemoStore, table: string, row: Row, actor: string) {
  ensureSupport(s)
  const t = s.tables as unknown as Record<string, Row[]>
  if (table === 'support_tickets') {
    row.created_by = row.created_by ?? actor
    row.account_id = row.account_id ?? s.tables.account_members.find((m) => m.user_id === row.created_by)?.account_id
    const account = s.tables.accounts.find((a) => a.id === row.account_id)
    const role = roleOf(s, row.account_id, row.created_by)
    if (!account || !role) throw new SupportError('not_account_member')
    if (String(row.title ?? '').trim().length < 4) throw new SupportError('title_too_short')
    account.ticket_seq = Number(account.ticket_seq ?? 0) + 1
    row.code = `VT-${String(account.ticket_seq).padStart(4, '0')}`
    // el destino lo decide la base según el rol de quien lo crea, no el cliente
    const routing = ((account.support_routing as Record<string, string> | undefined) ?? DEFAULT_ROUTING) as Record<string, string>
    row.destination = routing[role] ?? 'veltro'
    row.status = 'open'
    row.resolved_at = null
    row.last_message_at = row.created_at
    if (!Array.isArray(row.screenshots)) row.screenshots = []
    if ((row.screenshots as unknown[]).length > 3) throw new SupportError('too_many_screenshots')
  }
  if (table === 'support_ticket_messages') {
    const ticket = t.support_tickets.find((x) => x.id === row.ticket_id)
    if (!ticket) throw new SupportError('not_found')
    if (row.author_kind !== 'veltro' && row.author_kind !== 'system') {
      row.author_kind = 'member'
      row.author_id = row.author_id ?? actor
    }
    if (!String(row.body ?? '').trim()) throw new SupportError('empty_message')
    if (row.author_kind === 'system') return
    ticket.last_message_at = row.created_at
    ticket.updated_at = row.created_at
    // responde quien lo recibe (o Veltro) → respondido; vuelve a escribir quien lo creó → en revisión
    if (ticket.status !== 'resolved') {
      const fromCreator = row.author_kind === 'member' && row.author_id === ticket.created_by
      // el aviso de estado va justo después del mensaje que lo provocó
      const after = new Date(Date.parse(String(row.created_at)) + 1).toISOString()
      if (!fromCreator) setTicketStatus(s, ticket, 'answered', row.author_id, after)
      else if (ticket.status === 'answered') setTicketStatus(s, ticket, 'in_review', row.author_id, after)
    }
    if (row.author_id) upsertRead(s, 'support_ticket_reads', 'ticket_id', row.ticket_id, row.author_id, String(row.created_at))
  }
  if (table === 'feature_requests') {
    row.created_by = row.created_by ?? actor
    row.account_id = row.account_id ?? s.tables.account_members.find((m) => m.user_id === row.created_by)?.account_id
    const account = s.tables.accounts.find((a) => a.id === row.account_id)
    if (!account || !roleOf(s, row.account_id, row.created_by)) throw new SupportError('not_account_member')
    account.request_seq = Number(account.request_seq ?? 0) + 1
    row.code = `RQ-${String(account.request_seq).padStart(3, '0')}`
    row.status = 'received'
    // quien lo pide ya lo apoya, y queda la primera actualización
    t.feature_request_supporters.push({ request_id: row.id, user_id: row.created_by, created_at: row.created_at })
    t.feature_request_updates.push({ id: uuid(), request_id: row.id, status: 'received', body: '', author_kind: 'veltro', author_id: null, created_at: row.created_at })
    upsertRead(s, 'feature_request_reads', 'request_id', row.id, row.created_by, String(row.created_at))
  }
  if (table === 'feature_request_updates') {
    const request = t.feature_requests.find((x) => x.id === row.request_id)
    if (!request) throw new SupportError('not_found')
    request.status = row.status
    request.updated_at = row.created_at
  }
  if (table === 'feature_request_supporters') {
    row.user_id = row.user_id ?? actor
    if (!t.feature_requests.some((x) => x.id === row.request_id)) throw new SupportError('not_found')
  }
}

/** Igual que el trigger BEFORE UPDATE: lo fijo no cambia y el cambio de estado deja rastro. */
export function supportBeforeUpdate(s: DemoStore, table: string, row: Row, next: Row, actor: string) {
  if (table === 'support_tickets') {
    const wanted = next.status
    for (const k of ['id', 'account_id', 'code', 'destination', 'created_by', 'created_at', 'status', 'last_message_at', 'resolved_at']) next[k] = row[k]
    next.updated_at = now()
    if (wanted !== row.status) {
      if (!['open', 'in_review', 'answered', 'resolved'].includes(String(wanted))) throw new SupportError('invalid_status')
      setTicketStatus(s, next, String(wanted), actor)
    }
  }
  if (table === 'feature_requests') {
    // el estado solo cambia con una actualización (feature_request_updates)
    for (const k of ['id', 'account_id', 'code', 'created_by', 'created_at', 'status']) next[k] = row[k]
  }
  if (table === 'accounts' && 'support_routing' in next) {
    const r = next.support_routing as Record<string, string> | null
    const ok = r && ['member', 'admin', 'owner'].every((k) => DESTINATIONS.includes(r[k])) && r.owner !== 'account_owner'
    if (!ok) throw new SupportError('invalid_support_routing')
  }
}

/** Al borrar un ticket o un requerimiento se va todo lo suyo. */
export function supportAfterDelete(s: DemoStore, table: string, row: Row) {
  const t = s.tables as unknown as Record<string, Row[]>
  if (table === 'support_tickets') {
    t.support_ticket_messages = t.support_ticket_messages.filter((m) => m.ticket_id !== row.id)
    t.support_ticket_reads = t.support_ticket_reads.filter((m) => m.ticket_id !== row.id)
  }
  if (table === 'feature_requests') {
    for (const k of ['feature_request_updates', 'feature_request_supporters', 'feature_request_reads']) t[k] = t[k].filter((m) => m.request_id !== row.id)
  }
}

/**
 * Ejemplos de soporte (los mismos de la app móvil): un ticket de Cesar respondido por Veltro, uno
 * urgente de Pepito que les llega a los admins, uno resuelto, y tres requerimientos en distintos pasos.
 * Busca personas y espacios por correo y clave, así sirve para un demo nuevo y para datos guardados.
 */
export function seedSupport(s: DemoStore, anchor: Date) {
  ensureSupport(s)
  const t = s.tables as unknown as Record<string, Row[]>
  if (t.support_tickets.length || t.feature_requests.length) return
  const person = (name: string) => s.tables.profiles.find((p) => p.email === `${name}@veltro.demo`)?.id as string | undefined
  const [cesar, ana, pepito, diego] = ['cesar', 'ana', 'pepito', 'diego'].map(person)
  const account = s.tables.accounts[0]
  if (!cesar || !ana || !pepito || !diego || !account) return
  const ws = (key: string) => s.tables.workspaces.find((w) => w.key === key)?.id ?? null
  const ago = (minutes: number) => new Date(anchor.getTime() - minutes * 60_000).toISOString()
  const msg = (ticket_id: string, author_id: string | null, author_kind: string, body: string, minutes: number) =>
    t.support_ticket_messages.push({ id: uuid(), ticket_id, author_id, author_kind, body, created_at: ago(minutes) })

  const ticket = (o: { by: string; title: string; category: string; urgent?: boolean; ws?: string; where?: string; destination: string; status: string; created: number; updated: number; seen: number }) => {
    account.ticket_seq = Number(account.ticket_seq ?? 0) + 1
    const id = uuid()
    t.support_tickets.push({
      id,
      account_id: account.id,
      workspace_id: o.ws ? ws(o.ws) : null,
      code: `VT-${String(account.ticket_seq).padStart(4, '0')}`,
      title: o.title,
      category: o.category,
      urgent: !!o.urgent,
      where_text: o.where ?? null,
      screenshots: [],
      status: o.status,
      destination: o.destination,
      created_by: o.by,
      created_at: ago(o.created),
      updated_at: ago(o.updated),
      last_message_at: ago(o.updated),
      resolved_at: o.status === 'resolved' ? ago(o.updated) : null,
    })
    t.support_ticket_reads.push({ ticket_id: id, user_id: o.by, last_read_at: ago(o.seen), created_at: ago(o.created) })
    return id
  }

  const resolved = ticket({ by: cesar, title: 'Lucía no ve el espacio de Trade Marketing', category: 'access', ws: 'TM', destination: 'veltro', status: 'resolved', created: 6 * 1440, updated: 5 * 1440, seen: 5 * 1440 })
  msg(resolved, cesar, 'member', 'Agregué a Lucía como editora pero no le aparece el espacio.', 6 * 1440)
  msg(resolved, null, 'veltro', 'La invitación estaba pendiente de aceptar. Se la reenviamos y ya entró.', 5 * 1440 + 60)
  msg(resolved, null, 'system', 'resolved', 5 * 1440)

  const excel = ticket({ by: cesar, title: 'La exportación a Excel se corta en 5.000 filas', category: 'error', ws: 'TV', where: 'Tareas, vista de tabla', destination: 'veltro', status: 'answered', created: 1560, updated: 35, seen: 1560 })
  msg(excel, cesar, 'member', 'Al exportar el tablero de Tech Ve a Excel solo salen las primeras 5.000 filas y el archivo no avisa nada.', 1560)
  msg(excel, null, 'veltro', 'Recibido. Lo estamos revisando con el equipo de producto.', 1200)
  msg(excel, null, 'system', 'answered', 1200)
  msg(excel, null, 'veltro', 'Es un límite del exportador. Mientras sale la corrección, filtra por estado y exporta por partes. Te avisamos aquí cuando esté resuelto.', 35)

  const meet = ticket({ by: pepito, title: 'No me llegan las invitaciones de Meet', category: 'calendar', urgent: true, ws: 'PRO', where: 'Calendario', destination: 'account_admins', status: 'open', created: 90, updated: 90, seen: 90 })
  msg(meet, pepito, 'member', 'Desde ayer las reuniones del Daily me aparecen en Veltro pero no me llega la invitación al correo.', 90)

  const request = (o: { by: string; title: string; need: string; why?: string; impact: string; ws?: string; steps: [string, string, number][]; supporters: string[]; created: number; seen: number }) => {
    account.request_seq = Number(account.request_seq ?? 0) + 1
    const id = uuid()
    const last = o.steps[o.steps.length - 1]
    t.feature_requests.push({
      id,
      account_id: account.id,
      workspace_id: o.ws ? ws(o.ws) : null,
      code: `RQ-${String(account.request_seq).padStart(3, '0')}`,
      title: o.title,
      need: o.need,
      why: o.why ?? null,
      impact: o.impact,
      status: last[0],
      created_by: o.by,
      created_at: ago(o.created),
      updated_at: ago(last[2]),
    })
    for (const [status, body, minutes] of o.steps) t.feature_request_updates.push({ id: uuid(), request_id: id, status, body, author_kind: 'veltro', author_id: null, created_at: ago(minutes) })
    for (const u of o.supporters) t.feature_request_supporters.push({ request_id: id, user_id: u, created_at: ago(o.created) })
    t.feature_request_reads.push({ request_id: id, user_id: o.by, last_read_at: ago(o.seen), created_at: ago(o.created) })
  }

  request({
    by: ana,
    title: 'Plantillas para reuniones recurrentes',
    need: 'Que el Daily arranque siempre con la misma agenda.',
    impact: 'nice',
    ws: 'PRO',
    created: 30 * 1440,
    seen: 12 * 1440,
    supporters: [ana, cesar, pepito],
    steps: [
      ['received', '', 30 * 1440],
      ['planned', 'Planificado.', 20 * 1440],
      ['done', 'Listo: los pendientes del ciclo anterior se arrastran solos a la agenda.', 12 * 1440],
    ],
  })
  request({
    by: cesar,
    title: 'Exportar tareas a Excel desde el teléfono',
    need: 'Poder mandar la lista de tareas de un espacio en Excel desde la app, sin abrir la computadora.',
    why: 'Los lunes reporto a la gerencia desde la calle.',
    impact: 'saves_time',
    ws: 'PRO',
    created: 9 * 1440,
    seen: 3 * 1440,
    supporters: [cesar, ana],
    steps: [
      ['received', '', 9 * 1440],
      ['evaluating', 'Lo estamos evaluando junto con la exportación de la web.', 4 * 1440],
      ['planned', 'Planificado para el próximo ciclo.', 1560],
    ],
  })
  request({
    by: cesar,
    title: 'Aviso con la agenda antes de cada reunión',
    need: 'Que 10 minutos antes de una reunión me llegue un aviso con la agenda que preparó Veltro.',
    impact: 'saves_time',
    created: 3 * 1440,
    seen: 2 * 1440,
    supporters: [cesar, diego],
    steps: [
      ['received', '', 3 * 1440],
      ['evaluating', 'En evaluación: depende de las notificaciones de la app.', 2 * 1440],
    ],
  })
}
