'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { addMinutes, format, parseISO, setHours, setMinutes, startOfHour, addHours } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useApp, canEdit } from '@/components/app/app-context'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { calendarKeys } from '@/lib/queries/calendar'
import { openMeeting } from '@/app/actions/meetings'
import type { CalendarEvent } from '@/lib/types'
import { Select } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { MiniCalendar } from '@/components/tasks/pickers'
import { useDateLocale } from '@/lib/dates'
import { WorkspaceMark } from '@/components/app/marks'

export function NewMeetingDialog({
  open,
  onOpenChange,
  defaults,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  defaults?: { title?: string; workspaceId?: string; start?: Date; attendees?: string[] }
  /** p. ej. Pasillo: con la reunión creada manda la invitación al chat */
  onCreated?: (event: CalendarEvent) => void
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
  const [dateOpen, setDateOpen] = useState(false)
  const locale = useDateLocale()
  // horarios cada 15 minutos de 6:00 a 22:45 (y el elegido, si cae fuera)
  const timeOptions = useMemo(() => {
    const slots = Array.from({ length: (23 - 6) * 4 }, (_, i) => `${String(6 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`)
    if (start && !slots.includes(start)) slots.push(start)
    return slots.sort().map((v) => ({ value: v, label: v }))
  }, [start])

  useEffect(() => {
    if (!open) return
    const next = defaults?.start ?? addHours(startOfHour(new Date()), 1)
    setTitle(defaults?.title ?? '')
    setDate(format(next, 'yyyy-MM-dd'))
    setStart(format(next, 'HH:mm'))
    setDuration(30)
    setAttendees((defaults?.attendees ?? []).join(', '))
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
      onCreated?.(event)
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
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger
                    id="m-date"
                    className="flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-left text-sm outline-none transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent-mid/40 data-[popup-open]:border-accent-mid"
                  >
                    <CalendarDays className="size-4 shrink-0 text-fg-subtle" />
                    <span className="truncate first-letter:uppercase">{date ? format(parseISO(date), 'EEE d MMM', { locale }) : ''}</span>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2">
                    <MiniCalendar
                      selected={date ? parseISO(date) : null}
                      onSelect={(d) => {
                        setDate(format(d, 'yyyy-MM-dd'))
                        setDateOpen(false)
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </Field>
              <Field label={t('start')} htmlFor="m-start">
                <Select id="m-start" value={start} onChange={setStart} options={timeOptions} />
              </Field>
              <Field label={t('duration')} htmlFor="m-dur">
                <Select
                  id="m-dur"
                  value={String(duration)}
                  onChange={(v) => setDuration(Number(v))}
                  options={[15, 30, 45, 60, 90, 120].map((d) => ({ value: String(d), label: t('minutes', { count: d }) }))}
                />
              </Field>
            </div>
            <Field label={t('attendees')} hint={t('attendeesHint')} htmlFor="m-att">
              <Input id="m-att" value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder={t('attendeesPlaceholder')} />
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
            <label className="flex items-center gap-2.5 text-sm">
              <Switch checked={withMeet} onCheckedChange={setWithMeet} />
              {t('withMeet')}
            </label>
            {editable.length ? (
              <Field label={t('workspace')} hint={t('workspaceHint')} htmlFor="m-ws">
                <Select
                  id="m-ws"
                  value={workspaceId}
                  onChange={setWorkspaceId}
                  options={[{ value: '', label: t('noWorkspace') }, ...editable.map((w) => ({ value: w.id, label: w.name, icon: <WorkspaceMark ws={w} size={16} /> }))]}
                />
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
