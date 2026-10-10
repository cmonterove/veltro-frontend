'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { addMinutes, format, setHours, setMinutes, startOfHour, addHours } from 'date-fns'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useApp, canEdit } from '@/components/app/app-context'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, inputClass } from '@/components/ui/input'
import { calendarKeys } from '@/lib/queries/calendar'
import { openMeeting } from '@/app/actions/meetings'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/lib/types'

export function NewMeetingDialog({
  open,
  onOpenChange,
  defaults,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  defaults?: { title?: string; workspaceId?: string; start?: Date }
}) {
  const t = useTranslations('calendar.meetingDialog')
  const router = useRouter()
  const qc = useQueryClient()
  const { workspaces, members, profile } = useApp()
  const editable = workspaces.filter((w) => canEdit(w))
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [duration, setDuration] = useState(30)
  const [attendees, setAttendees] = useState('')
  const [withMeet, setWithMeet] = useState(true)
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    const next = defaults?.start ?? addHours(startOfHour(new Date()), 1)
    setTitle(defaults?.title ?? '')
    setDate(format(next, 'yyyy-MM-dd'))
    setStart(format(next, 'HH:mm'))
    setDuration(30)
    setAttendees('')
    setWithMeet(true)
    setWorkspaceId(defaults?.workspaceId ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const emails = attendees
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter((x) => /.+@.+\..+/.test(x))

  const submit = async () => {
    if (!title.trim() || !date || !start) return
    const [h, m] = start.split(':').map(Number)
    const startAt = setMinutes(setHours(new Date(`${date}T00:00:00`), h), m)
    const endAt = addMinutes(startAt, duration)
    setPending(true)
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          start: startAt.toISOString(),
          end: endAt.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || profile.timezone,
          attendees: emails,
          withMeet,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const event = json.event as CalendarEvent
      qc.invalidateQueries({ queryKey: calendarKeys.all })
      toast.success(t('created'))
      onOpenChange(false)
      if (workspaceId) {
        const res = await openMeeting({ event, workspaceId })
        if (res.ok) router.push(`/m/${res.meetingId}`)
      }
    } catch {
      toast.error(t('error'))
    } finally {
      setPending(false)
    }
  }

  const suggestions = members.filter((m) => m.id !== profile.id && !emails.includes(m.email)).slice(0, 6)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={t('title')} />
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <DialogBody className="flex flex-col gap-4">
            <Field label={t('name')} htmlFor="m-title">
              <Input id="m-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus maxLength={300} />
            </Field>
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <Field label={t('date')} htmlFor="m-date">
                <Input id="m-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </Field>
              <Field label={t('start')} htmlFor="m-start">
                <Input id="m-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
              </Field>
              <Field label={t('duration')} htmlFor="m-dur">
                <select id="m-dur" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={cn(inputClass, 'w-full')}>
                  {[15, 30, 45, 60, 90, 120].map((d) => (
                    <option key={d} value={d}>
                      {t('minutes', { count: d })}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={t('attendees')} hint={t('attendeesHint')} htmlFor="m-att">
              <Input id="m-att" value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="ana@empresa.com, pedro@empresa.com" />
            </Field>
            {suggestions.length ? (
              <div className="-mt-2 flex flex-wrap gap-1">
                {suggestions.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setAttendees((a) => (a.trim() ? `${a.trim()}, ${m.email}` : m.email))}
                    className="h-6 rounded-full border border-line px-2 text-xs text-fg-muted hover:bg-hover hover:text-fg"
                  >
                    + {m.full_name}
                  </button>
                ))}
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={withMeet} onChange={(e) => setWithMeet(e.target.checked)} className="accent-[var(--accent)]" />
              {t('withMeet')}
            </label>
            {editable.length ? (
              <Field label={t('workspace')} hint={t('workspaceHint')} htmlFor="m-ws">
                <select id="m-ws" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className={inputClass}>
                  <option value="">{t('noWorkspace')}</option>
                  {editable.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={pending} disabled={!title.trim()}>
              {t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
