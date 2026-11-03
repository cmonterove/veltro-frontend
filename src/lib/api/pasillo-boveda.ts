/**
 * Pasillo (chats) y Bóveda (adjuntos) en la API: formas de las respuestas (camelCase) y su paso a
 * las filas que usan las pantallas (snake_case, `database.types.ts`). Aparte de `types.ts` y
 * `adapters.ts` para no pisarse con los demás frentes.
 */

import type { AttachmentRow, ChatKind, ChatMemberRow, ChatMessageKind, ChatMessageRow, ChatRow, MeetingInvite } from '@/lib/database.types'
import { api } from './client'
import type { Query } from './shared'

// ---------- respuestas ----------

/** Una página de una lista con cursor. */
export type Page<T> = { items: T[]; nextCursor: string | null }

export type ApiChatMessage = {
  id: string
  chatId: string
  userId: string | null
  kind: ChatMessageKind
  body: string
  refId: string | null
  meta: ChatMessageRow['meta']
  createdAt: string
  editedAt: string | null
  author: { id: string; fullName: string; avatarUrl: string | null } | null
}

export type ApiChatMember = {
  userId: string
  role: 'owner' | 'member'
  lastReadAt: string | null
  joinedAt: string
  fullName: string | null
  avatarUrl: string | null
}

export type ApiChat = {
  id: string
  accountId: string
  kind: ChatKind
  name: string | null
  createdBy: string | null
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
  lastReadAt: string | null
  unread: number
  members: ApiChatMember[]
  last: ApiChatMessage | null
}

export type ApiAttachment = {
  id: string
  accountId: string
  workspaceId: string | null
  chatId: string | null
  taskId: string | null
  meetingId: string | null
  docId: string | null
  kind: 'file' | 'link'
  name: string
  title: string | null
  labels: string[]
  url: string | null
  mimeType: string | null
  sizeBytes: number | null
  uploadedBy: string | null
  createdAt: string
}

type Facet = { value: string; count: number }[]
export type ApiVaultSummary = {
  total: { count: number; bytes: number }
  matching: { count: number; bytes: number }
  facets: {
    category: Facet
    workspace: Facet
    linkedTo: Facet
    label: Facet
    uploadedBy: { value: string; count: number; fullName: string | null; avatarUrl: string | null }[]
  }
}

/** Lo que devuelven las rutas `upload-url`: además de la URL firmada, el sello para registrar el archivo. */
export type ApiSignedUpload = { path: string; uploadUrl: string; method: 'PUT'; headers: Record<string, string>; expiresIn: number; uploadToken: string }

// ---------- a las filas de la web ----------

/** Miembro de un chat con su nombre (sirve si la persona ya no está en la cuenta). */
export type ChatMember = ChatMemberRow & { full_name: string | null; avatar_url: string | null }

export type ChatSummary = ChatRow & {
  members: ChatMember[]
  last: ChatMessageRow | null
  /** mensajes de otras personas después de la última lectura */
  unread: number
}

export function toChatMessage(m: ApiChatMessage): ChatMessageRow {
  return {
    id: m.id,
    chat_id: m.chatId,
    user_id: m.userId,
    kind: m.kind,
    body: m.body,
    ref_id: m.refId,
    meta: m.meta ?? {},
    created_at: m.createdAt,
    edited_at: m.editedAt,
  }
}

export function toChatSummary(c: ApiChat): ChatSummary {
  return {
    id: c.id,
    account_id: c.accountId,
    kind: c.kind,
    name: c.name,
    created_by: c.createdBy,
    last_message_at: c.lastMessageAt,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    members: c.members.map((m) => ({
      chat_id: c.id,
      user_id: m.userId,
      role: m.role,
      last_read_at: m.lastReadAt,
      created_at: m.joinedAt,
      full_name: m.fullName,
      avatar_url: m.avatarUrl,
    })),
    last: c.last ? toChatMessage(c.last) : null,
    unread: c.unread,
  }
}

export function toAttachment(a: ApiAttachment): AttachmentRow {
  return {
    id: a.id,
    account_id: a.accountId,
    workspace_id: a.workspaceId,
    chat_id: a.chatId,
    task_id: a.taskId,
    meeting_id: a.meetingId,
    doc_id: a.docId,
    kind: a.kind,
    name: a.name,
    title: a.title,
    labels: a.labels ?? [],
    // la API no expone la ruta: los archivos se abren con /attachments/{id}/download
    storage_path: null,
    url: a.url,
    mime_type: a.mimeType,
    size_bytes: a.sizeBytes,
    uploaded_by: a.uploadedBy,
    created_at: a.createdAt,
  }
}

// ---------- de la web a la API ----------

/** Lo que se escribe en un chat. La cita la arma el servidor con `replyToId`; los avisos de sistema también son suyos. */
export type OutgoingMessage = {
  kind?: Exclude<ChatMessageKind, 'system'>
  body?: string
  refId?: string | null
  meta?: ChatMessageRow['meta']
  replyToId?: string | null
}

export function toMessageBody(m: OutgoingMessage, withReply = true) {
  const body = (m.body ?? '').slice(0, 4000)
  const reply = withReply && m.replyToId ? { replyToId: m.replyToId } : {}
  const kind = m.kind ?? 'text'
  if (kind === 'text') return { kind, body, ...reply }
  if (kind === 'meeting') {
    const i = m.meta?.invite as MeetingInvite | undefined
    return {
      kind,
      body,
      invite: { title: i?.title ?? '', start: i?.start ?? '', end: i?.end ?? '', conferenceUrl: i?.conferenceUrl ?? null, eventId: i?.eventId ?? null },
      ...reply,
    }
  }
  return { kind, refId: m.refId ?? '', body, ...reply }
}

/** Cambios de un adjunto, de las columnas de la web a los campos de la API. */
export type AttachmentPatch = Partial<Pick<AttachmentRow, 'title' | 'labels' | 'workspace_id' | 'task_id' | 'meeting_id' | 'doc_id' | 'name'>>

export function toAttachmentPatch(p: AttachmentPatch) {
  const out: Record<string, unknown> = {}
  if (p.name !== undefined) out.name = p.name
  if (p.title !== undefined) out.title = p.title ?? ''
  if (p.labels !== undefined) out.labels = p.labels
  if (p.workspace_id !== undefined) out.workspaceId = p.workspace_id
  if (p.task_id !== undefined) out.taskId = p.task_id
  if (p.meeting_id !== undefined) out.meetingId = p.meeting_id
  if (p.doc_id !== undefined) out.docId = p.doc_id
  return out
}

// ---------- listas con cursor ----------

/** Sigue el cursor hasta juntar `max` filas (las listas que la web muestra enteras). */
export async function fetchAll<T>(path: string, query: Query = {}, { pageSize = 200, max = 1000 } = {}): Promise<T[]> {
  const out: T[] = []
  let cursor: string | null = null
  do {
    const page: Page<T> = await api<Page<T>>(path, { query: { ...query, limit: pageSize, cursor } })
    out.push(...page.items)
    cursor = page.nextCursor
  } while (cursor && out.length < max)
  return out
}

// ---------- tipos de archivo ----------

/**
 * Tipos que acepta la API (igual que `TIPOS` en veltro-backend/src/lib/archivos.ts). Fuera a
 * propósito SVG, HTML y ejecutables. Por extensión, para cuando el navegador no da el tipo.
 */
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', avif: 'image/avif',
  pdf: 'application/pdf',
  txt: 'text/plain', csv: 'text/csv', md: 'text/markdown',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  zip: 'application/zip',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', weba: 'audio/webm', ogg: 'audio/ogg',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
}
const ALLOWED = new Set(Object.values(MIME_BY_EXT))
// nombres que dan algunos navegadores para tipos que la API conoce con otro
const ALIASES: Record<string, string> = { 'image/jpg': 'image/jpeg', 'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav', 'audio/mp3': 'audio/mpeg', 'audio/x-m4a': 'audio/mp4', 'text/rtf': 'application/rtf', 'application/x-zip-compressed': 'application/zip' }

/** El tipo con que se sube un archivo, o null si la API no lo admite. */
export function uploadMimeOf(file: Pick<File, 'name' | 'type'>): string | null {
  const type = ALIASES[file.type] ?? file.type
  if (ALLOWED.has(type)) return type
  const ext = file.name.includes('.') ? (file.name.split('.').pop() ?? '').toLowerCase() : ''
  return MIME_BY_EXT[ext] ?? null
}

/** Se ven en el navegador (el resto siempre se descarga). */
const INLINE = /^(image\/(jpeg|png|webp|gif|avif)|application\/pdf|audio\/(mpeg|mp4|wav|webm|ogg)|video\/(mp4|webm|quicktime))$/
export const isInlineType = (mime: string | null | undefined) => Boolean(mime && INLINE.test(mime))
