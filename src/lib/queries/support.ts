'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApp } from '@/components/app/app-context'
import { api, uploadSigned } from '@/lib/api/client'
import { DEMO } from '@/lib/demo/config'
import type { AccountRole } from '@/lib/database.types'
import type { RequestImpact, RequestStatus, SupportRouting, TicketCategory, TicketDestination, TicketStatus } from '@/lib/support'

/**
 * Soporte por la API (veltro-backend, módulo soporte): tickets, requerimientos, archivos, destino
 * por rol y pendientes. Sin tiempo real: los pendientes y lo abierto se refrescan cada poco.
 * En el demo no hay API: las consultas no corren.
 */

export type SupportPerson = { id: string; fullName: string; avatarUrl: string | null }
export type SupportPersonWithRole = SupportPerson & { role: AccountRole | null }
export type SupportWorkspace = { id: string; name: string; slug: string; color: string; icon: string }

export type TicketSummary = {
  id: string
  accountId: string
  workspaceId: string | null
  code: string
  title: string
  category: TicketCategory
  urgent: boolean
  whereText: string | null
  status: TicketStatus
  destination: TicketDestination
  createdBy: string
  creator: SupportPersonWithRole | null
  createdAt: string
  updatedAt: string
  lastMessageAt: string
  resolvedAt: string | null
  filesCount: number
  mine: boolean
  forMe: boolean
  lastReadAt: string | null
  unread: boolean
  unreadCount: number
  messagesCount: number
  lastMessage: { authorKind: 'member' | 'veltro'; authorId: string | null; body: string; createdAt: string } | null
}

export type TicketMessage = {
  id: string
  authorKind: 'member' | 'veltro' | 'system'
  author: SupportPerson | null
  mine: boolean
  body: string
  createdAt: string
}

export type TicketFile = {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
  /** null: se adjuntó al abrir el ticket */
  messageId: string | null
  uploadedBy: string | null
  createdAt: string
}

export type TicketFileUrl = Pick<TicketFile, 'id' | 'name' | 'mimeType' | 'sizeBytes' | 'messageId'> & { inline: boolean; url: string; downloadUrl: string }

export type TicketDetail = TicketSummary & {
  workspace: SupportWorkspace | null
  files: TicketFile[]
  recipients: SupportPersonWithRole[] | null
  messages: TicketMessage[]
  reachedAt: Partial<Record<TicketStatus, string>> & { open: string }
  allowedStatuses: ('open' | 'in_review' | 'resolved')[]
  canReply: boolean
}

export type RequestSummary = {
  id: string
  accountId: string
  workspaceId: string | null
  code: string
  title: string
  need: string
  why: string | null
  impact: RequestImpact
  status: RequestStatus
  createdBy: string
  creator: SupportPerson | null
  createdAt: string
  updatedAt: string
  mine: boolean
  supportersCount: number
  supportedByMe: boolean
  lastReadAt: string | null
  unread: boolean
  lastUpdate: { status: RequestStatus; body: string; createdAt: string } | null
}

export type RequestDetail = RequestSummary & {
  workspace: SupportWorkspace | null
  updates: { id: string; status: RequestStatus; body: string; authorKind: 'veltro' | 'member'; author: SupportPerson | null; createdAt: string }[]
  supporters: (SupportPerson & { supportedAt: string })[]
}

export type PendingItem = {
  kind: 'reply' | 'incoming' | 'request'
  at: string
  unread: boolean
  ticket: TicketSummary | null
  request: RequestSummary | null
}

export type SupportPending = {
  count: number
  counts: { replies: number; incoming: number; incomingUnread: number; requests: number }
  items: PendingItem[]
}

export type MyDestination = { role: AccountRole; destination: TicketDestination; recipients: SupportPersonWithRole[] | null; onlyYou: boolean }

type Page<T> = { items: T[]; nextCursor: string | null }
export type TicketBox = 'mine' | 'incoming'

export const supportKeys = {
  all: ['support'] as const,
  tickets: (accountId: string, box: TicketBox) => ['support', 'tickets', accountId, box] as const,
  ticket: (id: string) => ['support', 'ticket', id] as const,
  files: (id: string) => ['support', 'ticket-files', id] as const,
  requests: (accountId: string) => ['support', 'requests', accountId] as const,
  request: (id: string) => ['support', 'request', id] as const,
  pending: (accountId: string) => ['support', 'pending', accountId] as const,
  routing: (accountId: string) => ['support', 'routing', accountId] as const,
  destination: (accountId: string) => ['support', 'destination', accountId] as const,
}

const PAGE = 50

export function useTickets(box: TicketBox, enabled = true) {
  const { account } = useApp()
  return useInfiniteQuery({
    queryKey: supportKeys.tickets(account.id, box),
    enabled: enabled && !DEMO,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api<Page<TicketSummary>>(`/v1/accounts/${account.id}/support/tickets`, { query: { box, limit: PAGE, cursor: pageParam } }),
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 30_000,
  })
}

export function useRequests(enabled = true) {
  const { account } = useApp()
  return useInfiniteQuery({
    queryKey: supportKeys.requests(account.id),
    enabled: enabled && !DEMO,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api<Page<RequestSummary>>(`/v1/accounts/${account.id}/support/requests`, { query: { limit: PAGE, cursor: pageParam } }),
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 60_000,
  })
}

/** Un ticket abierto en pantalla se refresca seguido: la otra persona puede estar respondiendo. */
export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: supportKeys.ticket(id ?? ''),
    enabled: Boolean(id) && !DEMO,
    queryFn: () => api<TicketDetail>(`/v1/support/tickets/${id}`),
    refetchInterval: 15_000,
    retry: (n, e) => n < 1 && !(e instanceof Error && /^not_found|http_404/.test(e.message)),
  })
}

/** URLs firmadas de los archivos (valen 15 min): se piden de nuevo antes de que venzan. */
export function useTicketFileUrls(id: string, filesCount: number) {
  return useQuery({
    queryKey: [...supportKeys.files(id), filesCount],
    enabled: filesCount > 0 && !DEMO,
    queryFn: () => api<{ items: TicketFileUrl[]; expiresIn: number }>(`/v1/support/tickets/${id}/files`),
    staleTime: 10 * 60_000,
    refetchInterval: 12 * 60_000,
    select: (d) => new Map(d.items.map((f) => [f.id, f])),
  })
}

export function useRequest(id: string | undefined) {
  return useQuery({
    queryKey: supportKeys.request(id ?? ''),
    enabled: Boolean(id) && !DEMO,
    queryFn: () => api<RequestDetail>(`/v1/support/requests/${id}`),
    refetchInterval: 60_000,
    retry: (n, e) => n < 1 && !(e instanceof Error && /^not_found|http_404/.test(e.message)),
  })
}

/** Lo que espera por mí: la insignia de la barra y la franja de Pulso. */
export function useSupportPending() {
  const { account } = useApp()
  return useQuery({
    queryKey: supportKeys.pending(account.id),
    enabled: !DEMO,
    queryFn: () => api<SupportPending>(`/v1/accounts/${account.id}/support/pending`, { query: { limit: 20 } }),
    refetchInterval: 45_000,
    retry: false,
  })
}

export function useSupportRouting() {
  const { account } = useApp()
  return useQuery({
    queryKey: supportKeys.routing(account.id),
    enabled: !DEMO,
    queryFn: () => api<{ routing: SupportRouting; canEdit: boolean }>(`/v1/accounts/${account.id}/support/routing`),
    staleTime: 5 * 60_000,
  })
}

/** A quién le llegaría un ticket mío (el aviso antes de enviar). */
export function useMyDestination(enabled = true) {
  const { account } = useApp()
  return useQuery({
    queryKey: supportKeys.destination(account.id),
    enabled: enabled && !DEMO,
    queryFn: () => api<MyDestination>(`/v1/accounts/${account.id}/support/tickets/destination`),
    staleTime: 5 * 60_000,
  })
}

/** Después de escribir algo, todo lo de soporte puede haber cambiado (listas, pendientes, insignia). */
function useRefreshSupport() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: supportKeys.all })
}

/** Sube un archivo a la URL firmada y devuelve el uploadToken que va en `files`. */
export async function uploadSupportFile(accountId: string, file: File, mimeType: string) {
  const signed = await api<{ path: string; uploadUrl: string; method: 'PUT'; headers: Record<string, string>; expiresIn: number; uploadToken: string }>(
    `/v1/accounts/${accountId}/support/files/upload-url`,
    { method: 'POST', body: { name: file.name, mimeType, sizeBytes: file.size } },
  )
  // el tipo declarado tiene que coincidir con el del PUT (la URL firmada lo exige)
  await uploadSigned({ ...signed, headers: { ...signed.headers, 'content-type': mimeType } }, file)
  return signed.uploadToken
}

export type NewTicket = {
  title: string
  description: string
  category: TicketCategory
  urgent: boolean
  workspaceId: string | null
  whereText: string | null
  files: { uploadToken: string; name: string }[]
}

export function useCreateTicket() {
  const { account } = useApp()
  const qc = useQueryClient()
  const refresh = useRefreshSupport()
  return useMutation({
    mutationFn: (body: NewTicket) => api<TicketDetail>(`/v1/accounts/${account.id}/support/tickets`, { method: 'POST', body }),
    onSuccess: (t) => {
      qc.setQueryData(supportKeys.ticket(t.id), t)
      void refresh()
    },
  })
}

export function useReplyTicket(id: string) {
  const qc = useQueryClient()
  const refresh = useRefreshSupport()
  return useMutation({
    mutationFn: (body: { body: string; files: { uploadToken: string; name: string }[] }) =>
      api<TicketDetail>(`/v1/support/tickets/${id}/messages`, { method: 'POST', body }),
    onSuccess: (t) => {
      qc.setQueryData(supportKeys.ticket(id), t)
      void refresh()
    },
  })
}

export function useSetTicketStatus(id: string) {
  const qc = useQueryClient()
  const refresh = useRefreshSupport()
  return useMutation({
    mutationFn: (status: 'open' | 'in_review' | 'resolved') => api<TicketDetail>(`/v1/support/tickets/${id}/status`, { method: 'POST', body: { status } }),
    onSuccess: (t) => {
      qc.setQueryData(supportKeys.ticket(id), t)
      void refresh()
    },
  })
}

export function useMarkTicketRead() {
  const qc = useQueryClient()
  const { account } = useApp()
  return useMutation({
    mutationFn: (id: string) => api<{ lastReadAt: string }>(`/v1/support/tickets/${id}/read`, { method: 'POST' }),
    onSuccess: (r, id) => {
      qc.setQueryData<TicketDetail>(supportKeys.ticket(id), (t) => (t ? { ...t, lastReadAt: r.lastReadAt, unread: false, unreadCount: 0 } : t))
      void qc.invalidateQueries({ queryKey: supportKeys.pending(account.id) })
      void qc.invalidateQueries({ queryKey: ['support', 'tickets', account.id] })
    },
  })
}

export type NewRequest = { title: string; need: string; why: string | null; impact: RequestImpact; workspaceId: string | null }

export function useCreateRequest() {
  const { account } = useApp()
  const qc = useQueryClient()
  const refresh = useRefreshSupport()
  return useMutation({
    mutationFn: (body: NewRequest) => api<RequestDetail>(`/v1/accounts/${account.id}/support/requests`, { method: 'POST', body }),
    onSuccess: (r) => {
      qc.setQueryData(supportKeys.request(r.id), r)
      void refresh()
    },
  })
}

export function useToggleSupport(id: string) {
  const qc = useQueryClient()
  const { account } = useApp()
  return useMutation({
    mutationFn: (on: boolean) => api<{ supportedByMe: boolean; supportersCount: number }>(`/v1/support/requests/${id}/support`, { method: on ? 'PUT' : 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: supportKeys.request(id) })
      void qc.invalidateQueries({ queryKey: supportKeys.requests(account.id) })
    },
  })
}

export function useMarkRequestRead() {
  const qc = useQueryClient()
  const { account } = useApp()
  return useMutation({
    mutationFn: (id: string) => api<{ lastReadAt: string }>(`/v1/support/requests/${id}/read`, { method: 'POST' }),
    onSuccess: (r, id) => {
      qc.setQueryData<RequestDetail>(supportKeys.request(id), (x) => (x ? { ...x, lastReadAt: r.lastReadAt, unread: false } : x))
      void qc.invalidateQueries({ queryKey: supportKeys.pending(account.id) })
      void qc.invalidateQueries({ queryKey: supportKeys.requests(account.id) })
    },
  })
}

export function useSetSupportRouting() {
  const { account } = useApp()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (routing: SupportRouting) =>
      api<{ routing: SupportRouting; canEdit: boolean }>(`/v1/accounts/${account.id}/support/routing`, { method: 'PUT', body: routing }),
    onSuccess: (r) => {
      qc.setQueryData(supportKeys.routing(account.id), r)
      void qc.invalidateQueries({ queryKey: supportKeys.destination(account.id) })
    },
  })
}
