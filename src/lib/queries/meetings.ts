'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { Database, MeetingItemRow, MeetingRow } from '@/lib/database.types'
import { toErrorCode } from '@/lib/errors'

export type MeetingWithNotes = MeetingRow & { notesDocId: string | null; taskCount: number }

export const meetingKeys = {
  all: ['meetings'] as const,
  one: (id: string) => ['meeting', id] as const,
  items: (meetingId: string) => ['meeting-items', meetingId] as const,
  workspaceItems: (workspaceIds: string[], kind?: string) => ['meeting-items', 'ws', workspaceIds, kind ?? 'all'] as const,
}

export function useWorkspaceMeetings(workspaceId: string, limit = 50) {
  return useQuery({
    queryKey: ['meetings', workspaceId, limit],
    queryFn: async (): Promise<MeetingWithNotes[]> => {
      const supabase = createClient()
      const { data: meetings, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('starts_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      if (!meetings.length) return []
      const ids = meetings.map((m) => m.id)
      const [{ data: docs }, { data: tasks }] = await Promise.all([
        supabase.from('docs').select('id, meeting_id').in('meeting_id', ids).eq('source', 'meeting').is('archived_at', null),
        supabase.from('tasks').select('id, meeting_id').in('meeting_id', ids),
      ])
      return (meetings as MeetingRow[]).map((m) => ({
        ...m,
        notesDocId: docs?.find((d) => d.meeting_id === m.id)?.id ?? null,
        taskCount: tasks?.filter((x) => x.meeting_id === m.id).length ?? 0,
      }))
    },
  })
}

/** Reuniones de varios espacios en un rango (Pulso, Mesa). */
export function useMeetingsInRange(workspaceIds: string[], from: Date, to: Date) {
  return useQuery({
    queryKey: ['meetings', 'range', workspaceIds, from.toISOString(), to.toISOString()],
    enabled: workspaceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from('meetings')
        .select('*')
        .in('workspace_id', workspaceIds)
        .order('starts_at', { ascending: false })
        .limit(200)
      if (error) throw error
      const f = from.getTime()
      const t = to.getTime()
      return (data as MeetingRow[]).filter((m) => {
        const s = new Date(m.starts_at).getTime()
        return s >= f && s < t
      })
    },
  })
}

export function useMeeting(id: string, initialData?: MeetingRow) {
  return useQuery({
    queryKey: meetingKeys.one(id),
    initialData,
    queryFn: async () => {
      const { data, error } = await createClient().from('meetings').select('*').eq('id', id).single()
      if (error) throw error
      return data as MeetingRow
    },
  })
}

export function useMeetingItems(meetingId: string | null, initialData?: MeetingItemRow[]) {
  return useQuery({
    queryKey: meetingId ? meetingKeys.items(meetingId) : ['meeting-items', 'none'],
    enabled: Boolean(meetingId),
    initialData,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from('meeting_items')
        .select('*')
        .eq('meeting_id', meetingId!)
        .order('position')
      if (error) throw error
      return data as MeetingItemRow[]
    },
  })
}

/** Ítems de varios espacios (decisiones recientes, acuerdos vivos). */
export function useWorkspaceItems(workspaceIds: string[], kind?: MeetingItemRow['kind']) {
  return useQuery({
    queryKey: meetingKeys.workspaceItems(workspaceIds, kind),
    enabled: workspaceIds.length > 0,
    queryFn: async () => {
      let q = createClient().from('meeting_items').select('*').in('workspace_id', workspaceIds)
      if (kind) q = q.eq('kind', kind)
      const { data, error } = await q.order('created_at', { ascending: false }).limit(300)
      if (error) throw error
      return data as MeetingItemRow[]
    },
  })
}

/** Reunión anterior de la misma serie (para arrastrar pendientes). */
export function usePreviousInSeries(meeting: Pick<MeetingRow, 'id' | 'workspace_id' | 'series_key' | 'starts_at'> | undefined) {
  return useQuery({
    queryKey: ['meeting-prev', meeting?.id],
    enabled: Boolean(meeting?.series_key),
    queryFn: async () => {
      const { data, error } = await createClient()
        .from('meetings')
        .select('*')
        .eq('workspace_id', meeting!.workspace_id)
        .eq('series_key', meeting!.series_key!)
        .order('starts_at', { ascending: false })
        .limit(20)
      if (error) throw error
      const prev = (data as MeetingRow[]).find((m) => m.starts_at < meeting!.starts_at && m.id !== meeting!.id) ?? null
      if (!prev) return null
      const { data: items } = await createClient().from('meeting_items').select('*').eq('meeting_id', prev.id).order('position')
      return { meeting: prev, items: (items ?? []) as MeetingItemRow[] }
    },
  })
}

type ItemInsert = Database['public']['Tables']['meeting_items']['Insert']
type ItemUpdate = Database['public']['Tables']['meeting_items']['Update']

function useErrorToast() {
  const t = useTranslations('errors')
  return (error: unknown) => toast.error(t(toErrorCode(error as { message?: string })))
}

export function useMeetingItemMutations(meetingId: string) {
  const qc = useQueryClient()
  const onError = useErrorToast()
  const key = meetingKeys.items(meetingId)

  const add = useMutation({
    mutationFn: async (input: Omit<ItemInsert, 'meeting_id'> & { id?: string }) => {
      const { data, error } = await createClient()
        .from('meeting_items')
        .insert({ ...input, meeting_id: meetingId })
        .select('*')
        .single()
      if (error) throw error
      return data as MeetingItemRow
    },
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
          task_id: input.task_id ?? null,
          done: input.done ?? false,
          source: input.source ?? 'manual',
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
      qc.invalidateQueries({ queryKey: ['meeting-items', 'ws'] })
    },
    onError: (error, _v, ctx) => {
      qc.setQueryData<MeetingItemRow[]>(key, (old) => old?.filter((i) => i.id !== ctx?.tempId))
      onError(error)
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ItemUpdate }) => {
      const { data, error } = await createClient().from('meeting_items').update(patch).eq('id', id).select('*').single()
      if (error) throw error
      return data as MeetingItemRow
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key })
      const snapshot = qc.getQueryData<MeetingItemRow[]>(key)
      qc.setQueryData<MeetingItemRow[]>(key, (old) => old?.map((i) => (i.id === id ? ({ ...i, ...patch } as MeetingItemRow) : i)))
      return { snapshot }
    },
    onError: (error, _v, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(key, ctx.snapshot)
      onError(error)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['meeting-items', 'ws'] }),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from('meeting_items').delete().eq('id', id)
      if (error) throw error
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
  })

  return { add, update, remove }
}

export function useUpdateMeeting() {
  const qc = useQueryClient()
  const onError = useErrorToast()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Database['public']['Tables']['meetings']['Update'] }) => {
      const { data, error } = await createClient().from('meetings').update(patch).eq('id', id).select('*').single()
      if (error) throw error
      return data as MeetingRow
    },
    onMutate: ({ id, patch }) => {
      qc.setQueryData<MeetingRow>(meetingKeys.one(id), (old) => (old ? ({ ...old, ...patch } as MeetingRow) : old))
    },
    onSuccess: (m) => {
      qc.setQueryData(meetingKeys.one(m.id), m)
      qc.invalidateQueries({ queryKey: meetingKeys.all })
    },
    onError,
  })
}
