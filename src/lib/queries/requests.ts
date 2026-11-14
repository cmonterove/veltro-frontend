'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useApp } from '@/components/app/app-context'
import { api } from '@/lib/api/client'
import type { Page } from '@/lib/api/pasillo-boveda'
import { toErrorCode } from '@/lib/errors'

/**
 * Solicitudes entre departamentos (GET/POST /v1/accounts/{id}/requests, /v1/requests/{id}): Ventas
 * le pide algo a Tecnología; Tecnología la atiende y quien la pidió ve en qué va.
 */

export const REQUEST_STATUSES = ['new', 'in_review', 'in_progress', 'delivered', 'resolved', 'declined'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]
export const REQUEST_KINDS = ['request', 'problem', 'question', 'access', 'data'] as const
export type RequestKind = (typeof REQUEST_KINDS)[number]
/** El camino de una solicitud que sale bien (rechazada queda aparte). */
export const REQUEST_STEPS: RequestStatus[] = ['new', 'in_review', 'in_progress', 'delivered', 'resolved']
export const isClosed = (s: RequestStatus) => s === 'resolved' || s === 'declined'

type Person = { id: string; fullName: string; avatarUrl: string | null }

export type DeptRequest = {
  id: string
  code: string
  title: string
  body: string
  kind: RequestKind
  urgent: boolean
  dueDate: string | null
  status: RequestStatus
  department: { id: string; name: string } | null
  requester: Person & { title: string | null; department: { id: string; name: string } | null }
  assignee: Person | null
  tasks: { total: number; done: number }
  unread: boolean
  myRole: 'department' | 'requester'
  createdAt: string
  updatedAt: string
  lastActivityAt: string
  resolvedAt: string | null
}

export type RequestEvent = {
  id: string
  kind: 'message' | 'status' | 'assigned' | 'forwarded' | 'task_created' | 'tasks_done'
  body: string
  data: Record<string, unknown>
  author: Person | null
  createdAt: string
}

export type RequestTask = {
  id: string
  ref: string
  title: string
  status: 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done'
  assigneeIds: string[]
  dueDate: string | null
  completedAt: string | null
  workspace: { id: string; name: string; color: string }
  canOpen: boolean
}

export type DeptRequestDetail = DeptRequest & { events: RequestEvent[]; taskList: RequestTask[] }

export type RequestBox = 'mine' | 'inbox'
export type RequestFilters = { state?: 'open' | 'closed' | 'all'; departmentId?: string; q?: string }

export type RequestSummary = {
  myDepartments: string[]
  handlesAll: boolean
  counts: { mineUnread: number; inboxNew: number; inboxUnread: number; inboxOpen: number }
}

export const requestKeys = {
  all: ['requests'] as const,
  list: (accountId: string, box: RequestBox, f: RequestFilters) => ['requests', accountId, 'list', box, f] as const,
  summary: (accountId: string) => ['requests', accountId, 'summary'] as const,
  one: (id: string) => ['request', id] as const,
}

export function useRequests(box: RequestBox, filters: RequestFilters) {
  const { account } = useApp()
  return useInfiniteQuery({
    queryKey: requestKeys.list(account.id, box, filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<Page<DeptRequest>>(`/v1/accounts/${account.id}/requests`, {
        query: { box, state: filters.state ?? 'all', departmentId: filters.departmentId, q: filters.q?.trim() || undefined, limit: 50, cursor: pageParam },
      }),
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: (prev) => prev,
  })
}

export function useRequestSummary() {
  const { account } = useApp()
  return useQuery({
    queryKey: requestKeys.summary(account.id),
    staleTime: 30_000,
    refetchInterval: 120_000,
    queryFn: () => api<RequestSummary>(`/v1/accounts/${account.id}/requests/summary`),
  })
}

export function useRequest(id: string | undefined) {
  return useQuery({
    queryKey: requestKeys.one(id ?? 'none'),
    enabled: Boolean(id),
    queryFn: () => api<DeptRequestDetail>(`/v1/requests/${id}`),
  })
}

export type NewRequest = { departmentId: string; title: string; body: string; kind: RequestKind; urgent: boolean; dueDate: string | null }
export type RequestPatch = Partial<{ status: RequestStatus; assigneeId: string | null; title: string; body: string; kind: RequestKind; urgent: boolean; dueDate: string | null }>

export function useRequestMutations() {
  const qc = useQueryClient()
  const { account } = useApp()
  const tErr = useTranslations('errors')
  const onError = (e: unknown) => toast.error(tErr(toErrorCode(e as { message?: string })))
  const settle = (d: DeptRequestDetail) => {
    qc.setQueryData(requestKeys.one(d.id), d)
    qc.invalidateQueries({ queryKey: ['requests', account.id] })
  }
  return {
    create: useMutation({
      mutationFn: (b: NewRequest) => api<DeptRequestDetail>(`/v1/accounts/${account.id}/requests`, { method: 'POST', body: b }),
      onSuccess: settle,
      onError,
    }),
    patch: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: RequestPatch }) => api<DeptRequestDetail>(`/v1/requests/${id}`, { method: 'PATCH', body: patch }),
      onSuccess: settle,
      onError,
    }),
    message: useMutation({
      mutationFn: ({ id, body }: { id: string; body: string }) => api<DeptRequestDetail>(`/v1/requests/${id}/messages`, { method: 'POST', body: { body } }),
      onSuccess: settle,
      onError,
    }),
    forward: useMutation({
      mutationFn: ({ id, departmentId, note }: { id: string; departmentId: string; note?: string }) =>
        api<{ visible: boolean }>(`/v1/requests/${id}/forward`, { method: 'POST', body: { departmentId, note } }),
      onSuccess: (_r, v) => {
        qc.invalidateQueries({ queryKey: requestKeys.one(v.id) })
        qc.invalidateQueries({ queryKey: ['requests', account.id] })
      },
      onError,
    }),
    read: useMutation({
      mutationFn: (id: string) => api<{ ok: true }>(`/v1/requests/${id}/read`, { method: 'POST' }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['requests', account.id] }),
    }),
  }
}
