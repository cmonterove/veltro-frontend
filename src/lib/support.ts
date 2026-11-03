/**
 * Soporte y requerimientos: lo que no habla con la red. Los límites son los de la API
 * (veltro-backend, módulo soporte) y la base; se muestran en los formularios para que el error
 * aparezca antes de enviar. El destino real de un ticket lo decide la base.
 */

import type { AccountRole } from '@/lib/database.types'

export type TicketStatus = 'open' | 'in_review' | 'answered' | 'resolved'
export type TicketCategory = 'error' | 'access' | 'data' | 'calendar' | 'other'
export type TicketDestination = 'account_admins' | 'account_owner' | 'veltro'
export type RequestStatus = 'received' | 'evaluating' | 'planned' | 'done' | 'declined'
export type RequestImpact = 'blocks' | 'saves_time' | 'nice'
export type SupportRouting = Record<AccountRole, TicketDestination>

export const TICKET_CATEGORIES: TicketCategory[] = ['error', 'access', 'data', 'calendar', 'other']
export const TICKET_STEPS: TicketStatus[] = ['open', 'in_review', 'answered', 'resolved']
export const REQUEST_STEPS: RequestStatus[] = ['received', 'evaluating', 'planned', 'done']
export const REQUEST_STATUSES: RequestStatus[] = [...REQUEST_STEPS, 'declined']
export const IMPACTS: RequestImpact[] = ['blocks', 'saves_time', 'nice']
export const DESTINATIONS: TicketDestination[] = ['account_admins', 'account_owner', 'veltro']
export const ROUTING_ROLES: AccountRole[] = ['member', 'admin', 'owner']

export const LIMITS = {
  title: { min: 4, max: 120 },
  description: { min: 10, max: 4000 },
  where: 80,
  reply: 4000,
  need: { min: 10, max: 2000 },
  why: 600,
  files: 5,
  fileBytes: 20 * 1024 * 1024,
} as const

/** Tipos que admite el bucket (los mismos de la API, `TIPOS` en lib/archivos.ts), por extensión. */
const TYPE_OF_EXT: Record<string, string> = {
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
const ALLOWED = new Set(Object.values(TYPE_OF_EXT))

/** Para el `accept` del selector de archivos. */
export const FILE_ACCEPT = Object.keys(TYPE_OF_EXT).map((e) => `.${e}`).join(',')

/**
 * El tipo que se declara a la API. El navegador a veces no sabe (HEIC, Markdown) o da otro nombre
 * (CSV en Windows): manda la extensión. null si no se admite.
 */
export function supportMimeOf(file: { name: string; type: string }): string | null {
  const ext = file.name.includes('.') ? (file.name.split('.').pop() ?? '').toLowerCase() : ''
  const byExt = TYPE_OF_EXT[ext]
  if (byExt) return byExt
  return ALLOWED.has(file.type) ? file.type : null
}

/** «Ana, Diego y Marta»: une nombres con la «y» del idioma. */
export function joinNames(names: string[], and: string) {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`
}

export const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? ''

/** Destinos que el dueño puede elegir para un rol: el dueño no se escribe a sí mismo. */
export function destinationsFor(role: AccountRole): TicketDestination[] {
  return role === 'owner' ? DESTINATIONS.filter((d) => d !== 'account_owner') : DESTINATIONS
}

/** Pasos que se muestran de un requerimiento: los cuatro de siempre, o hasta donde llegó si se descartó. */
export function requestTimeline(status: RequestStatus, reachedStatuses: RequestStatus[]): { steps: RequestStatus[]; reached: number } {
  if (status !== 'declined') return { steps: REQUEST_STEPS, reached: REQUEST_STEPS.indexOf(status) }
  const last = Math.max(0, ...reachedStatuses.map((s) => REQUEST_STEPS.indexOf(s)))
  const steps: RequestStatus[] = [...REQUEST_STEPS.slice(0, last + 1), 'declined']
  return { steps, reached: steps.length - 1 }
}
