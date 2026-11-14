'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Eye } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { AvatarStack } from '@/components/ui/avatar'
import { Tooltip } from '@/components/ui/tooltip'
import { api } from '@/lib/api/client'
import type { ApiTaskDetail } from '@/lib/api/tareas'
import { toErrorCode } from '@/lib/errors'
import { track } from '@/lib/telemetry'

/**
 * Seguir una tarea: quien la sigue se entera de sus comentarios, cambios de estado, de fecha y de
 * cuando se termina, aunque no sea suya. Quien la creó la sigue sin pedirlo (y puede dejarla).
 */

export type Follower = { id: string; fullName: string; avatarUrl: string | null }
export const followersKey = (taskId: string) => ['task-followers', taskId] as const

export function useTaskFollowers(taskId: string) {
  return useQuery({
    queryKey: followersKey(taskId),
    staleTime: 30_000,
    queryFn: async () => (await api<ApiTaskDetail & { followers?: Follower[] }>(`/v1/tasks/${taskId}`)).followers ?? [],
  })
}

export function useFollowTask(taskId: string) {
  const qc = useQueryClient()
  const tErr = useTranslations('errors')
  return useMutation({
    mutationFn: async (follow: boolean) =>
      api<{ following: boolean; followers: Follower[] }>(`/v1/tasks/${taskId}/follow`, { method: follow ? 'POST' : 'DELETE' }),
    onSuccess: (r) => {
      qc.setQueryData(followersKey(taskId), r.followers)
      // la vista «Siguiendo» cambia
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (e) => toast.error(tErr(toErrorCode(e as { message?: string }))),
  })
}

export function FollowButton({ taskId }: { taskId: string }) {
  const t = useTranslations('tasks.follow')
  const { user } = useApp()
  const { data: followers = [] } = useTaskFollowers(taskId)
  const follow = useFollowTask(taskId)
  const following = followers.some((f) => f.id === user.id)
  const others = followers.filter((f) => f.id !== user.id)
  const names = followers.map((f) => (f.id === user.id ? t('you') : f.fullName.split(' ')[0])).join(', ')
  return (
    <Tooltip content={followers.length ? t('who', { names }) : t('hint')}>
      <Button
        variant={following ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={following}
        loading={follow.isPending}
        onClick={() => {
          follow.mutate(!following, { onSuccess: (r) => toast.success(r.following ? t('followed') : t('unfollowed')) })
          track(following ? 'feature.task_unfollow' : 'feature.task_follow')
        }}
      >
        {follow.isPending ? null : <Eye className={following ? 'text-accent' : undefined} />}
        <span className="hidden xl:inline">{following ? t('following') : t('follow')}</span>
        {others.length ? <AvatarStack people={others.map((f) => ({ id: f.id, full_name: f.fullName, avatar_url: f.avatarUrl }))} size={18} max={3} /> : null}
      </Button>
    </Tooltip>
  )
}
