'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { CalendarDays, CircleUser, X } from 'lucide-react'
import { canEdit, useApp } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { AvatarStack } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select } from '@/components/ui/select'
import { AssigneesMenu, MiniCalendar } from '@/components/tasks/pickers'
import { api } from '@/lib/api/client'
import type { ApiTaskDetail } from '@/lib/api/tareas'
import { useDateLocale } from '@/lib/dates'
import { toErrorCode } from '@/lib/errors'
import { useLocalStorage } from '@/lib/hooks'
import { requestKeys, useRequestMutations, type DeptRequestDetail } from '@/lib/queries/requests'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { track } from '@/lib/telemetry'
import { cn } from '@/lib/utils'
import { DeptMark } from './request-bits'

/**
 * Convertir la solicitud en una tarea de un espacio (el control interno del departamento): con
 * responsables y fecha. La solicitud pasa a «en curso» y quien la pidió ve su avance.
 */
export function RequestTaskDialog({ request: r, open, onOpenChange }: { request: DeptRequestDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('requests.toTask')
  const tErr = useTranslations('errors')
  const qc = useQueryClient()
  const locale = useDateLocale()
  const { workspaces, account } = useApp()
  const editable = useMemo(() => workspaces.filter((w) => canEdit(w)), [workspaces])
  const [lastWs, setLastWs] = useLocalStorage<string>('veltro:request-task-ws', '')
  const [ws, setWs] = useState('')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [assignees, setAssignees] = useState<string[]>([])
  const [due, setDue] = useState<string | null>(null)
  const [dateOpen, setDateOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const members = useWorkspaceMembers(ws || null)
  const people = assignees.flatMap((id) => members.find((m) => m.id === id) ?? [])

  useEffect(() => {
    if (!open) return
    setWs(editable.some((w) => w.id === lastWs) ? lastWs : (editable[0]?.id ?? ''))
    setTitle(r.title)
    setNotes(r.body ? `${r.code} · ${r.requester.fullName}\n\n${r.body}` : `${r.code} · ${r.requester.fullName}`)
    setAssignees(r.assignee ? [r.assignee.id] : [])
    setDue(r.dueDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // quien no tiene acceso al espacio elegido no puede ser responsable allí
  useEffect(() => {
    if (members.length) setAssignees((a) => a.filter((id) => members.some((m) => m.id === id)))
  }, [members])

  const submit = async () => {
    if (!ws || !title.trim() || pending) return
    setPending(true)
    try {
      const task = await api<ApiTaskDetail>(`/v1/workspaces/${ws}/tasks`, {
        method: 'POST',
        body: { title: title.trim(), descriptionText: notes.trim(), assigneeIds: assignees, dueDate: due, priority: r.urgent ? 'high' : 'none', requestId: r.id },
      })
      setLastWs(ws)
      qc.invalidateQueries({ queryKey: requestKeys.one(r.id) })
      qc.invalidateQueries({ queryKey: ['requests', account.id] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast.success(t('created', { ref: task.ref }))
      track('feature.request_to_task')
      onOpenChange(false)
    } catch (e) {
      toast.error(tErr(toErrorCode(e as { message?: string })))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <DialogHeader title={t('title', { code: r.code })} description={t('description', { name: r.requester.fullName.split(' ')[0] })} />
          {editable.length === 0 ? (
            <DialogBody>
              <p className="rounded-lg bg-sidebar px-3 py-3 text-sm text-fg-muted">{t('noWorkspaces')}</p>
            </DialogBody>
          ) : (
            <DialogBody className="flex flex-col gap-4">
              <Field label={t('workspace')} htmlFor="rt-ws">
                <Select id="rt-ws" value={ws} onChange={setWs} options={editable.map((w) => ({ value: w.id, label: w.name, icon: <WorkspaceMark ws={w} size={16} /> }))} />
              </Field>
              <Field label={t('taskTitle')} htmlFor="rt-title">
                <Input id="rt-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} autoFocus />
              </Field>
              <Field label={t('notes')} htmlFor="rt-notes" hint={t('notesHint')}>
                <Textarea id="rt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={8000} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('assignees')}>
                  <AssigneesMenu value={assignees} members={members} onChange={setAssignees} className="h-9 w-full justify-start rounded-lg border border-line bg-panel px-2.5 text-sm hover:border-line-strong">
                    {people.length ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <AvatarStack people={people} size={20} max={3} />
                        <span className="truncate">{people.map((p) => p.full_name.split(' ')[0]).join(', ')}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-fg-subtle">
                        <CircleUser className="size-4" />
                        {t('nobody')}
                      </span>
                    )}
                  </AssigneesMenu>
                </Field>
                <Field label={t('due')}>
                  <div className="flex items-center gap-1">
                    <Popover open={dateOpen} onOpenChange={setDateOpen}>
                      <PopoverTrigger className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-left text-sm outline-none hover:border-line-strong data-[popup-open]:border-accent-mid">
                        <CalendarDays className="size-4 shrink-0 text-fg-subtle" />
                        <span className={cn('truncate first-letter:uppercase', !due && 'text-fg-subtle')}>{due ? format(parseISO(due), 'EEE d MMM', { locale }) : t('noDue')}</span>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2">
                        <MiniCalendar
                          selected={due ? parseISO(due) : null}
                          onSelect={(d) => {
                            setDue(format(d, 'yyyy-MM-dd'))
                            setDateOpen(false)
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    {due ? (
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setDue(null)} aria-label={t('clearDue')}>
                        <X />
                      </Button>
                    ) : null}
                  </div>
                </Field>
              </div>
              <p className="text-xs leading-relaxed text-fg-subtle">{t('hint')}</p>
            </DialogBody>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={!ws || !title.trim()} loading={pending}>
              {t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Derivar a otro departamento, con una nota para quien la recibe. */
export function ForwardDialog({
  request: r,
  open,
  onOpenChange,
  onForwarded,
}: {
  request: DeptRequestDetail
  open: boolean
  onOpenChange: (o: boolean) => void
  onForwarded: (visible: boolean) => void
}) {
  const t = useTranslations('requests.forward')
  const { departments } = useApp()
  const { forward } = useRequestMutations()
  const others = departments.filter((d) => d.id !== r.department?.id)
  const [dept, setDept] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) {
      setDept('')
      setNote('')
    }
  }, [open])

  const target = departments.find((d) => d.id === dept)
  const submit = () => {
    if (!dept) return
    forward.mutate(
      { id: r.id, departmentId: dept, note: note.trim() || undefined },
      {
        onSuccess: (res) => {
          toast.success(t('done', { department: target?.name ?? '' }))
          onOpenChange(false)
          onForwarded(res.visible)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <DialogHeader title={t('title', { code: r.code })} description={t('description')} />
          <DialogBody className="flex flex-col gap-4">
            <Field label={t('to')} htmlFor="fw-dept">
              <Select
                id="fw-dept"
                value={dept}
                onChange={setDept}
                placeholder={t('pick')}
                options={others.map((d) => ({ value: d.id, label: d.name, icon: <DeptMark name={d.name} size={18} /> }))}
              />
            </Field>
            <Field label={t('note')} htmlFor="fw-note" hint={t('noteHint')}>
              <Textarea id="fw-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={!dept} loading={forward.isPending}>
              {t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
