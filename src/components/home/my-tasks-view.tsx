'use client'

import { useTranslations } from 'next-intl'
import { CircleCheck } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useTasks } from '@/lib/queries/tasks'
import { TaskGroupList } from '@/components/tasks/task-list'
import { useMyTaskGroups } from '@/components/tasks/my-task-groups'

export function MyTasksView() {
  const t = useTranslations('myTasks')
  const { user, workspaces } = useApp()
  const { data: tasks, isLoading } = useTasks({ kind: 'assignee', userId: user.id, workspaceIds: workspaces.map((w) => w.id) })
  const groups = useMyTaskGroups(tasks, { includeLater: true, includeDone: true })
  const open = (tasks ?? []).filter((x) => x.status !== 'done').length

  return (
    <div className="flex min-h-full flex-col">
      <div className="shrink-0 border-b border-line px-4 pb-4 pt-6 sm:px-6">
        <h1 className="text-lg font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-fg-muted">{t('subtitle', { count: open })}</p>
      </div>
      {isLoading ? (
        <div className="flex flex-col gap-2 p-6">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : (
        <TaskGroupList
          groups={groups}
          showWorkspace
          hideEmpty
          emptyState={
            <div className="px-6">
              <EmptyState icon={<CircleCheck />} title={t('empty.title')} description={t('empty.description')} />
            </div>
          }
        />
      )}
    </div>
  )
}
