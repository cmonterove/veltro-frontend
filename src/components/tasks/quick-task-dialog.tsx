'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronDown, CircleUser } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/components/ui/menu'
import { useApp, useMemberMap, canEdit } from '@/components/app/app-context'
import { useCreateTask } from '@/lib/queries/tasks'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { useTaskPanel } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { parseQuickTask } from '@/lib/quick-parse'
import type { TaskPriority, TaskStatus } from '@/lib/database.types'
import { AssigneeMenu, DuePopover, PriorityMenu, StatusMenu } from './pickers'
import { PriorityIcon, StatusIcon } from './status-icon'
import { DueDate } from './due-date'
import { WorkspaceMark } from '@/components/app/marks'

export function QuickTaskDialog({
  open,
  onOpenChange,
  defaults,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  defaults?: { workspaceId?: string; dueDate?: string | null }
}) {
  const t = useTranslations('tasks')
  const tStatus = useTranslations('tasks.status')
  const tPriority = useTranslations('tasks.priority')
  const pathname = usePathname()
  const { workspaces, user } = useApp()
  const memberMap = useMemberMap()
  const editableWs = useMemo(() => workspaces.filter((w) => canEdit(w)), [workspaces])
  const create = useCreateTask()
  const panel = useTaskPanel()

  const fromPath = editableWs.find((w) => pathname.startsWith(`/w/${w.slug}`))
  const [workspaceId, setWorkspaceId] = useState<string | undefined>()
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [priority, setPriority] = useState<TaskPriority>('none')
  const [assignee, setAssignee] = useState<string | null>(user.id)
  const [due, setDue] = useState<string | null>(null)
  const [keepOpen, setKeepOpen] = useState(false)
  // Campos fijados a mano: el texto deja de mandar sobre ellos.
  const [manual, setManual] = useState<{ due?: boolean; assignee?: boolean; priority?: boolean }>({})

  useEffect(() => {
    if (!open) return
    setWorkspaceId(defaults?.workspaceId ?? fromPath?.id ?? editableWs[0]?.id)
    setDue(defaults?.dueDate ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const ws = editableWs.find((w) => w.id === workspaceId)
  const members = useWorkspaceMembers(workspaceId)
  const parsed = useMemo(() => parseQuickTask(title, members, manual), [title, members, manual])
  const effDue = parsed.due ?? due
  const effPriority = parsed.priority ?? priority
  const effAssignee = parsed.assigneeId ?? assignee
  const assigneeMember = effAssignee ? memberMap.get(effAssignee) : undefined
  const fromText = 'bg-accent-soft border-accent/40 text-accent-ink'

  const reset = () => {
    setTitle('')
    setStatus('todo')
    setPriority('none')
    setAssignee(user.id)
    setDue(null)
    setManual({})
  }

  const submit = () => {
    const finalTitle = (parsed.title || title).trim()
    if (!finalTitle || !workspaceId) return
    create.mutate(
      {
        workspace_id: workspaceId,
        title: finalTitle.slice(0, 500),
        status,
        priority: effPriority,
        assignee_id: effAssignee && members.some((m) => m.id === effAssignee) ? effAssignee : null,
        due_date: effDue,
        position: Date.now() / 1000,
      },
      {
        onSuccess: ([task]) => {
          reset()
          if (!keepOpen) {
            onOpenChange(false)
            if (task) panel.open(task.id)
          }
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" hideClose>
        {editableWs.length === 0 ? (
          <p className="p-5 text-sm text-fg-muted">{t('noEditableWorkspace')}</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <div className="flex items-center gap-2 px-4 pt-3">
              <Menu>
                <MenuTrigger className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line px-2 text-sm hover:bg-hover data-[popup-open]:bg-hover">
                  {ws ? <WorkspaceMark ws={ws} size={16} /> : null}
                  <span className="max-w-40 truncate">{ws?.name}</span>
                  <ChevronDown className="size-3.5 text-fg-subtle" />
                </MenuTrigger>
                <MenuContent>
                  <MenuRadioGroup value={workspaceId} onValueChange={(v) => setWorkspaceId(String(v))}>
                    {editableWs.map((w) => (
                      <MenuRadioItem key={w.id} value={w.id}>
                        <WorkspaceMark ws={w} size={16} />
                        {w.name}
                      </MenuRadioItem>
                    ))}
                  </MenuRadioGroup>
                </MenuContent>
              </Menu>
              <span className="text-xs text-fg-subtle">{t('newTask')}</span>
            </div>

            <div className="px-5 pb-2 pt-3">
              <AutoTextarea
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submit()
                  }
                }}
                placeholder={t('titlePlaceholder')}
                className="bg-transparent text-lg font-medium outline-none placeholder:text-fg-subtle"
                maxLength={500}
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 px-4 pb-4">
              <StatusMenu value={status} onChange={setStatus} className="h-7 border border-line px-2 text-sm">
                <StatusIcon status={status} />
                {tStatus(status)}
              </StatusMenu>
              <PriorityMenu
                value={effPriority}
                onChange={(p) => {
                  setPriority(p)
                  setManual((m) => ({ ...m, priority: true }))
                }}
                className={cn('h-7 border border-line px-2 text-sm', parsed.priority && fromText)}
              >
                <PriorityIcon priority={effPriority} />
                {tPriority(effPriority)}
              </PriorityMenu>
              <AssigneeMenu
                value={effAssignee}
                members={members}
                onChange={(a) => {
                  setAssignee(a)
                  setManual((m) => ({ ...m, assignee: true }))
                }}
                className={cn('h-7 border border-line px-2 text-sm', parsed.assigneeId && fromText)}
              >
                {assigneeMember ? (
                  <>
                    <Avatar name={assigneeMember.full_name} seed={assigneeMember.id} src={assigneeMember.avatar_url} size={16} />
                    {assigneeMember.full_name.split(' ')[0]}
                  </>
                ) : (
                  <>
                    <CircleUser className="size-3.5 text-fg-subtle" />
                    {t('unassigned')}
                  </>
                )}
              </AssigneeMenu>
              <DuePopover
                value={effDue}
                onChange={(d) => {
                  setDue(d)
                  setManual((m) => ({ ...m, due: true }))
                }}
                className={cn('h-7 border border-line px-2 text-sm', parsed.due && fromText)}
              >
                {effDue ? <DueDate due={effDue} /> : <span className="text-fg-muted">{t('dueLabel')}</span>}
              </DuePopover>
            </div>
            <p className="-mt-2 px-5 pb-3 text-xs text-fg-subtle">
              {parsed.due || parsed.assigneeId || parsed.priority ? (
                <>
                  <span className="text-accent-ink">{t('quick.understood')}</span> «{parsed.title}»
                </>
              ) : (
                t('quick.hint')
              )}
            </p>

            <div className="flex items-center gap-3 border-t border-line px-4 py-3">
              <label className="flex cursor-default items-center gap-2 text-xs text-fg-muted">
                <input type="checkbox" checked={keepOpen} onChange={(e) => setKeepOpen(e.target.checked)} className="accent-[var(--accent)]" />
                {t('createMore')}
              </label>
              <Button type="submit" variant="primary" size="sm" className={cn('ml-auto')} loading={create.isPending} disabled={!(parsed.title || title).trim()}>
                {t('create')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
