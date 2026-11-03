'use client'

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { api } from '@/lib/api/client'
import {
  itemBody,
  meetingBody,
  toMeetingItemRow,
  toMeetingRow,
  type ApiAgendaSuggestion,
  type ApiMeetingDetail,
  type ApiMeetingInList,
  type ApiMeetingItem,
} from '@/lib/api/docs-reuniones'
import type { MeetingItemRow, MeetingRow } from '@/lib/database.types'
import { toErrorCode } from '@/lib/errors'

export type MeetingWithNotes = MeetingRow & { notesDocId: string | null; taskCount: number }

export const meetingKeys = {
  all: ['meetings'] as const,
  one: (id: string) => ['meeting', id] as const,
  // la sala completa (GET /v1/meetings/{id}); cuelga de `one` para invalidarse con ella
  detail: (id: string) => ['meeting', id, 'detail'] as const,
  record: (id: string) => ['meeting', id, 'record'] as const,
  items: (meetingId: string) => ['meeting-items', meetingId] as const,
  workspaceItems: (workspaceIds: string[], kind?: string) => ['meeting-items', 'ws', workspaceIds, kind ?? 'all'] as const,
  suggestions: (meetingId: string) => ['meeting-suggestions', meetingId] as const,
}

const DAY = 86_400_000
// la API pide rangos de 186 días como máximo
const MAX_RANGE = 180 * DAY

/**
 * La sala de la reunión en una sola llamada. La reunión, lo capturado, el acta y la serie salen de
 * acá: si se piden a la vez, viaja una sola petición.
 */
function fetchDetail(qc: QueryClient, id: string) {
  return qc.fetchQuery({ queryKey: meetingKeys.detail(id), queryFn: () => api<ApiMeetingDetail>(`/v1/meetings/${id}`), staleTime: 0 })
}

/** Reuniones de un espacio en un rango, partido en tramos que la API acepta. */
async function meetingsIn(workspaceId: string, from: Date, to: Date, limit: number) {
  const out: ApiMeetingInList[] = []
  for (let end = to.getTime(); end > from.getTime(); end -= MAX_RANGE) {
    const start = Math.max(from.getTime(), end - MAX_RANGE)
    const r = await api<{ items: ApiMeetingInList[] }>(`/v1/workspaces/${workspaceId}/meetings`, {
      query: { from: new Date(start).toISOString(), to: new Date(end).toISOString(), order: 'desc', limit },
    })
    out.push(...r.items)
    if (out.length >= limit) break
  }
  return out.slice(0, limit)
}

/** Las últimas reuniones del espacio (las próximas primero), con su acta y cuántas tareas dejaron. */
export function useWorkspaceMeetings(workspaceId: string, limit = 50) {
  return useQuery({
    queryKey: ['meetings', workspaceId, limit],
    queryFn: async (): Promise<MeetingWithNotes[]> => {
      const now = Date.now()
      const rows = await meetingsIn(workspaceId, new Date(now - 150 * DAY), new Date(now + 35 * DAY), limit)
      return rows.map((m) => ({ ...toMeetingRow(m), notesDocId: m.recordDocId, taskCount: m.stats.tasks }))
    },
  })
}

/** Reuniones de varios espacios en un rango (Pulso, Mesa). */
export function useMeetingsInRange(workspaceIds: string[], from: Date, to: Date) {
  return useQuery({
    queryKey: ['meetings', 'range', workspaceIds, from.toISOString(), to.toISOString()],
    enabled: workspaceIds.length > 0,
    queryFn: async () => {
      const lists = await Promise.all(workspaceIds.map((id) => meetingsIn(id, from, to, 500)))
      return lists
        .flat()
        .map(toMeetingRow)
        .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
        .slice(0, 500)
    },
  })
}

export function useMeeting(id: string, initialData?: MeetingRow) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: meetingKeys.one(id),
    initialData,
    queryFn: async () => toMeetingRow(await fetchDetail(qc, id)),
  })
}

export function useMeetingItems(meetingId: string | null, initialData?: MeetingItemRow[]) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: meetingId ? meetingKeys.items(meetingId) : ['meeting-items', 'none'],
    enabled: Boolean(meetingId),
    initialData,
    queryFn: async () => (await fetchDetail(qc, meetingId!)).items.map(toMeetingItemRow),
  })
}

/** El acta (doc de la reunión en la memoria del espacio), si ya existe. */
export function useMeetingRecord(meetingId: string) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: meetingKeys.record(meetingId),
    queryFn: async () => (await fetchDetail(qc, meetingId)).recordDocId,
  })
}

/** Ítems de varios espacios (decisiones recientes, acuerdos vivos). */
export function useWorkspaceItems(workspaceIds: string[], kind?: MeetingItemRow['kind']) {
  return useQuery({
    queryKey: meetingKeys.workspaceItems(workspaceIds, kind),
    enabled: workspaceIds.length > 0,
    queryFn: async () => {
      const lists = await Promise.all(
        workspaceIds.map((id) => api<{ items: ApiMeetingItem[] }>(`/v1/workspaces/${id}/meeting-items`, { query: { kind, limit: 300 } })),
      )
      return lists
        .flatMap((l) => l.items)
        .map(toMeetingItemRow)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 300)
    },
  })
}

/** Reunión anterior de la misma serie (para arrastrar pendientes). */
export function usePreviousInSeries(meeting: Pick<MeetingRow, 'id' | 'workspace_id' | 'series_key' | 'starts_at'> | undefined) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['meeting-prev', meeting?.id],
    enabled: Boolean(meeting?.series_key),
    queryFn: async () => {
      const current = await fetchDetail(qc, meeting!.id)
      if (!current.previous) return null
      const prev = await fetchDetail(qc, current.previous.id)
      return { meeting: toMeetingRow(prev), items: prev.items.map(toMeetingItemRow) }
    },
  })
}

/** Agenda sugerida por la API: pendientes de la reunión anterior y tareas que necesitan a los convocados. */
export function useAgendaSuggestions(meetingId: string, enabled = true) {
  return useQuery({
    queryKey: meetingKeys.suggestions(meetingId),
    enabled,
    queryFn: async () => (await api<{ items: ApiAgendaSuggestion[] }>(`/v1/meetings/${meetingId}/agenda/suggestions`)).items,
  })
}

/** Lo que se captura (como fila): la API pone la reunión, el espacio y el autor. */
type ItemInput = Pick<MeetingItemRow, 'kind'> & Partial<Pick<MeetingItemRow, 'text' | 'assignee_id' | 'due_date' | 'done' | 'position'>> & { id?: string }
type ItemPatch = Partial<Pick<MeetingItemRow, 'kind' | 'text' | 'assignee_id' | 'due_date' | 'done' | 'position'>>

function useErrorToast() {
  const t = useTranslations('errors')
  return (error: unknown) => toast.error(t(toErrorCode(error as { message?: string })))
}

export function useMeetingItemMutations(meetingId: string) {
  const qc = useQueryClient()
  const onError = useErrorToast()
  const key = meetingKeys.items(meetingId)
  // los acuerdos de Pulso, el resumen del espacio y la agenda sugerida también se enteran
  const settle = () => {
    qc.invalidateQueries({ queryKey: ['meeting-items', 'ws'] })
    qc.invalidateQueries({ queryKey: meetingKeys.suggestions(meetingId) })
  }

  const add = useMutation({
    mutationFn: async (input: ItemInput) =>
      toMeetingItemRow(await api<ApiMeetingItem>(`/v1/meetings/${meetingId}/items`, { method: 'POST', body: itemBody(input) })),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key })
      const tempId = input.id ?? `temp-${crypto.randomUUID()}`
      const now = new Date().toISOString()
      qc.setQueryData<MeetingItemRow[]>(key, (old) => [
        ...(old ?? []),
        {
          id: tempId,
          meeting_id: meetingId,
          workspace_id: '',
          kind: input.kind,
          text: input.text ?? '',
          assignee_id: input.assignee_id ?? null,
          due_date: input.due_date ?? null,
          task_id: null,
          done: input.done ?? false,
          source: 'manual',
          position: input.position ?? Date.now(),
          created_by: null,
          created_at: now,
          updated_at: now,
        },
      ])
      return { tempId }
    },
    onSuccess: (row, _v, ctx) => {
      qc.setQueryData<MeetingItemRow[]>(key, (old) => old?.map((i) => (i.id === ctx?.tempId ? row : i)))
      settle()
    },
    onError: (error, _v, ctx) => {
      qc.setQueryData<MeetingItemRow[]>(key, (old) => old?.filter((i) => i.id !== ctx?.tempId))
      onError(error)
    },
  })

  /** Agrega a la agenda lo que sugirió la API (con su tarea, si la tiene). */
  const addSuggestions = useMutation({
    mutationFn: async (items: ApiAgendaSuggestion[]) =>
      (await api<{ items: ApiMeetingItem[] }>(`/v1/meetings/${meetingId}/agenda/suggestions`, { method: 'POST', body: { items } })).items.map(toMeetingItemRow),
    onMutate: (items) => {
      // fuera de la lista al instante: no se agregan dos veces
      qc.setQueryData<ApiAgendaSuggestion[]>(meetingKeys.suggestions(meetingId), (old) =>
        old?.filter((s) => !items.some((i) => i.text === s.text && i.taskId === s.taskId)),
      )
    },
    onSuccess: (rows) => {
      qc.setQueryData<MeetingItemRow[]>(key, (old) => [...(old ?? []), ...rows])
      settle()
    },
    onError: (error) => {
      qc.invalidateQueries({ queryKey: meetingKeys.suggestions(meetingId) })
      onError(error)
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ItemPatch }) =>
      toMeetingItemRow(await api<ApiMeetingItem>(`/v1/meeting-items/${id}`, { method: 'PATCH', body: itemBody(patch) })),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key })
      const snapshot = qc.getQueryData<MeetingItemRow[]>(key)
      qc.setQueryData<MeetingItemRow[]>(key, (old) => old?.map((i) => (i.id === id ? ({ ...i, ...patch } as MeetingItemRow) : i)))
      return { snapshot }
    },
    onSuccess: (row) => qc.setQueryData<MeetingItemRow[]>(key, (old) => old?.map((i) => (i.id === row.id ? row : i))),
    onError: (error, _v, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(key, ctx.snapshot)
      onError(error)
    },
    onSettled: settle,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api(`/v1/meeting-items/${id}`, { method: 'DELETE' })
      return id
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      const snapshot = qc.getQueryData<MeetingItemRow[]>(key)
      qc.setQueryData<MeetingItemRow[]>(key, (old) => old?.filter((i) => i.id !== id))
      return { snapshot }
    },
    onError: (error, _v, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(key, ctx.snapshot)
      onError(error)
    },
    onSettled: settle,
  })

  return { add, addSuggestions, update, remove }
}

export function useUpdateMeeting() {
  const qc = useQueryClient()
  const onError = useErrorToast()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<MeetingRow> }) =>
      toMeetingRow(await api<ApiMeetingDetail>(`/v1/meetings/${id}`, { method: 'PATCH', body: meetingBody(patch) })),
    onMutate: ({ id, patch }) => {
      const snapshot = qc.getQueryData<MeetingRow>(meetingKeys.one(id))
      qc.setQueryData<MeetingRow>(meetingKeys.one(id), (old) => (old ? ({ ...old, ...patch } as MeetingRow) : old))
      return { snapshot }
    },
    onSuccess: (m) => {
      qc.setQueryData(meetingKeys.one(m.id), m)
      qc.invalidateQueries({ queryKey: meetingKeys.all })
    },
    onError: (error, { id }, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(meetingKeys.one(id), ctx.snapshot)
      onError(error)
    },
  })
}
