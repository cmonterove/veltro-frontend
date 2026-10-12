'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { differenceInMinutes, format, formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import { Check, CheckCheck, ClipboardCopy, ExternalLink, FileText, Mail, MessageCircle, Play, Plus, Sparkles, Video } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemberMap, useWorkspaceMap, canEdit } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Avatar } from '@/components/ui/avatar'
import { Button, buttonVariants } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'
import { ShareToChatDialog, type ShareItem } from '@/components/chat/share-to-chat'
import { useMeeting, useMeetingItemMutations, useMeetingItems, usePreviousInSeries, useUpdateMeeting, meetingKeys } from '@/lib/queries/meetings'
import { useTasks, taskKeys } from '@/lib/queries/tasks'
import { docKeys } from '@/lib/queries/docs'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { useDateLocale } from '@/lib/dates'
import { suggestAgenda, summarizeMeeting } from '@/lib/assistant'
import { closeMeeting } from '@/app/actions/meetings'
import { track } from '@/lib/telemetry'
import { cn, positionBetween, taskRef } from '@/lib/utils'
import type { MeetingItemRow, MeetingPhase, MeetingRow } from '@/lib/database.types'
import { ItemRow, TaskLink } from './item-row'
import { CaptureBox } from './capture-box'
import { KindChip, KIND_STYLE } from './kinds'
import { AttachmentsSection } from '@/components/attachments/attachments'
import { useHydrated, useNow } from '@/lib/hooks'

type View = MeetingPhase


export function MeetingRoom({
  initialMeeting,
  initialItems,
  initialView,
}: {
  initialMeeting: MeetingRow
  initialItems: MeetingItemRow[]
  /** Vista con la que abre (p. ej. `?view=closed` desde "Cerrar" en Hoy). */
  initialView?: View
}) {
  const t = useTranslations('meeting')
  const locale = useDateLocale()
  const now = useNow(30_000)
  const { data: meeting = initialMeeting } = useMeeting(initialMeeting.id, initialMeeting)
  const { data: items = initialItems } = useMeetingItems(meeting.id, initialItems)
  const ws = useWorkspaceMap().get(meeting.workspace_id)
  const editable = canEdit(ws)
  const [view, setView] = useState<View>(initialView ?? meeting.phase)
  const update = useUpdateMeeting()
  const { data: previous } = usePreviousInSeries(meeting)

  // Al cambiar de fase (empezar, cerrar) la vista la sigue; al montar se respeta la vista pedida.
  const lastPhase = useRef(meeting.phase)
  useEffect(() => {
    if (lastPhase.current === meeting.phase) return
    lastPhase.current = meeting.phase
    setView(meeting.phase)
  }, [meeting.phase])

  const start = new Date(meeting.starts_at)
  const end = meeting.ends_at ? new Date(meeting.ends_at) : null
  const live = meeting.phase === 'live'
  // Lo que depende del reloj se calcula después de hidratar: el servidor y el navegador no comparten el mismo instante.
  const hydrated = useHydrated()
  const remaining = end && hydrated ? differenceInMinutes(end, now) : null
  const progress = end && hydrated ? Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime()))) : 0
  const ended = Boolean(end && hydrated && end < now && meeting.phase !== 'closed')

  const phases: { id: View; label: string; hint: string }[] = [
    { id: 'prep', label: t('phase.prep'), hint: t('phaseHint.prep', { count: items.filter((i) => i.kind === 'agenda').length }) },
    { id: 'live', label: t('phase.live'), hint: live && remaining != null && remaining > 0 ? t('phaseHint.liveRemaining', { minutes: remaining }) : t('phaseHint.live', { count: items.filter((i) => i.kind !== 'agenda').length }) },
    { id: 'closed', label: t('phase.closed'), hint: meeting.phase === 'closed' ? t('phaseHint.closedDone') : t('phaseHint.closed') },
  ]
  const phaseIndex = phases.findIndex((p) => p.id === meeting.phase)
  const [sharing, setSharing] = useState(false)
  const memberMap = useMemberMap()

  // Cerrada: se comparte el resumen (decisiones, acciones y preguntas). Antes: la invitación, para que respondan en el chat.
  const shareItem = (): ShareItem => {
    if (meeting.phase !== 'closed') {
      return {
        kind: 'meeting',
        title: meeting.title,
        meta: {
          invite: {
            title: meeting.title,
            start: meeting.starts_at,
            end: meeting.ends_at ?? meeting.starts_at,
            conferenceUrl: meeting.conference_url,
            eventId: meeting.google_event_id,
            rsvp: {},
          },
        },
      }
    }
    const line = (s: string) => `• ${s}`
    const decisions = items.filter((i) => i.kind === 'decision').map((i) => line(i.text))
    const actions = items
      .filter((i) => i.kind === 'action')
      .map((i) => line([i.text, i.assignee_id ? memberMap.get(i.assignee_id)?.full_name : null, i.due_date ? format(new Date(`${i.due_date}T12:00:00`), 'd MMM', { locale }) : null].filter(Boolean).join(' · ')))
    const questions = items.filter((i) => i.kind === 'question' && !i.done).map((i) => line(i.text))
    const text = [
      t('shareText.heading', { title: meeting.title, date: format(start, 'd MMM', { locale }) }),
      meeting.summary ?? '',
      decisions.length ? `${t('shareText.decisions')}\n${decisions.join('\n')}` : '',
      actions.length ? `${t('shareText.actions')}\n${actions.join('\n')}` : '',
      questions.length ? `${t('shareText.questions')}\n${questions.join('\n')}` : '',
      `${window.location.origin}/m/${meeting.id}`,
    ]
      .filter(Boolean)
      .join('\n\n')
    return { kind: 'text', title: meeting.title, text }
  }

  if (!ws) return null

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1240px] flex-col">
      {/* encabezado */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-3 pt-5 sm:px-6">
        <WorkspaceMark ws={ws} size={32} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-[-0.02em]">{meeting.title}</h1>
          <p className="truncate text-sm text-fg-muted first-letter:uppercase">
            {format(start, 'EEEE d MMM', { locale })} · {format(start, 'HH:mm')}
            {end ? ` - ${format(end, 'HH:mm')}` : ''} · <Link href={`/w/${ws.slug}/meetings`} className="hover:text-fg">{ws.name}</Link>
            {previous?.meeting ? (
              <>
                {' · '}
                <Link href={`/m/${previous.meeting.id}`} className="text-accent-ink hover:underline">
                  {t('follows', { date: format(new Date(previous.meeting.starts_at), 'd MMM', { locale }) })}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <span className="hidden -space-x-1.5 sm:flex">
          {meeting.attendees.slice(0, 5).map((a) => (
            <Avatar key={a.email} name={a.name || a.email} seed={a.email} size={26} className="ring-2 ring-canvas" />
          ))}
        </span>
        {live && remaining != null && remaining > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-mandarina-ink">
            <span className="size-2 rounded-full bg-mandarina" />
            {t('remaining', { minutes: remaining })}
          </span>
        ) : null}
        <Tooltip content={meeting.phase === 'closed' ? t('shareSummary') : t('shareInvite')}>
          <Button variant="ghost" size="icon-sm" onClick={() => setSharing(true)} aria-label={meeting.phase === 'closed' ? t('shareSummary') : t('shareInvite')}>
            <MessageCircle />
          </Button>
        </Tooltip>
        {meeting.conference_url && meeting.phase !== 'closed' ? (
          <a href={meeting.conference_url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
            <Video />
            {live ? t('backToMeet') : t('joinMeet')}
          </a>
        ) : null}
      </header>
      {sharing ? <ShareToChatDialog open onOpenChange={setSharing} item={shareItem()} /> : null}

      {/* barra de fases */}
      <div className="px-4 sm:px-6">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-sidebar p-1">
          {phases.map((p, i) => {
            const current = p.id === meeting.phase
            const passed = i < phaseIndex
            const selected = view === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setView(p.id)}
                // relleno = la fase en la que está la reunión; aro = la que estás mirando
                aria-pressed={selected}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'relative flex min-w-0 items-center gap-2.5 overflow-hidden rounded-lg px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid/40',
                  current ? 'bg-accent text-accent-fg' : selected ? 'bg-panel shadow-card' : 'hover:bg-hover',
                  selected && 'ring-2 ring-accent-mid/50 ring-offset-1 ring-offset-sidebar',
                )}
              >
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full text-2xs font-semibold',
                    current ? 'bg-accent-fg/20 text-accent-fg' : passed ? 'bg-accent text-accent-fg' : 'border border-line-strong text-fg-subtle',
                  )}
                >
                  {passed ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={cn('block text-sm font-semibold', !current && 'text-fg')}>{p.label}</span>
                  <span className={cn('block truncate text-xs', current ? 'text-accent-fg/80' : 'text-fg-muted')}>{p.hint}</span>
                </span>
                {current && p.id === 'live' ? (
                  <span className="absolute inset-x-3 bottom-1 h-0.5 overflow-hidden rounded-full bg-accent-fg/25">
                    <span className="block h-full origin-left bg-mandarina transition-transform duration-700 ease-out" style={{ transform: `scaleX(${progress})` }} />
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      {ended && view !== 'closed' ? (
        <div className="mx-4 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-mandarina/40 bg-warning-soft/60 px-4 py-3 sm:mx-6">
          <CheckCheck className="size-4 shrink-0 text-mandarina-ink" />
          <p className="min-w-0 flex-1 text-sm text-fg">
            <span className="font-medium">{t('ended.title', { ago: formatDistanceToNowStrict(end!, { locale }) })}</span>{' '}
            <span className="text-fg-muted">{t('ended.hint')}</span>
          </p>
          <span className="flex items-center gap-2">
            {view !== 'live' ? (
              <Button variant="secondary" size="sm" onClick={() => setView('live')}>
                {t('ended.capture')}
              </Button>
            ) : null}
            <Button variant="primary" size="sm" onClick={() => setView('closed')}>
              <Sparkles />
              {t('ended.close')}
            </Button>
          </span>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-x-10 gap-y-8 px-4 pb-24 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {view === 'prep' ? (
            <PrepView meeting={meeting} items={items} previous={previous ?? null} editable={editable} onStart={() => update.mutate({ id: meeting.id, patch: { phase: 'live' } })} />
          ) : view === 'live' ? (
            <LiveView meeting={meeting} items={items} editable={editable} onClose={() => setView('closed')} />
          ) : (
            <CloseView meeting={meeting} items={items} editable={editable} />
          )}
        </div>
        <div className="flex flex-col gap-6 lg:sticky lg:top-4 lg:self-start">
          <OutcomePanel meeting={meeting} items={items} previous={previous ?? null} onCloseClick={() => setView('closed')} />
          <div className="rounded-2xl border border-line p-4">
            <AttachmentsSection
              scope={{ kind: 'meeting', meetingId: meeting.id }}
              parent={{ workspaceId: meeting.workspace_id, meetingId: meeting.id }}
              editable={editable}
              title={t('files')}
              emptyHint={t('filesHint')}
              dense
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------- Preparar ----------------

function PrepView({
  meeting,
  items,
  previous,
  editable,
  onStart,
}: {
  meeting: MeetingRow
  items: MeetingItemRow[]
  previous: { meeting: MeetingRow; items: MeetingItemRow[] } | null
  editable: boolean
  onStart: () => void
}) {
  const t = useTranslations('meeting')
  const ws = useWorkspaceMap().get(meeting.workspace_id)!
  const members = useWorkspaceMembers(meeting.workspace_id)
  const { add, update, remove } = useMeetingItemMutations(meeting.id)
  const { data: tasks } = useTasks({ kind: 'workspace', workspaceId: meeting.workspace_id })
  const agenda = items.filter((i) => i.kind === 'agenda')
  const [draft, setDraft] = useState('')

  const attendeeIds = useMemo(() => {
    const emails = new Set(meeting.attendees.map((a) => a.email.toLowerCase()))
    return members.filter((m) => emails.has(m.email.toLowerCase())).map((m) => m.id)
  }, [meeting.attendees, members])

  const suggestions = useMemo(
    () =>
      suggestAgenda({
        tasks: tasks ?? [],
        taskRef: (task) => taskRef(ws.key, task.number),
        attendeeIds,
        previousItems: previous?.items ?? [],
        existing: agenda,
      }),
    [tasks, ws.key, attendeeIds, previous, agenda],
  )

  const addAgenda = (text: string, taskId: string | null = null, source: MeetingItemRow['source'] = 'manual') =>
    add.mutate({ kind: 'agenda', text, task_id: taskId, source, position: positionBetween(agenda.at(-1)?.position, null) })

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t('agenda')}</h2>
          {editable && meeting.phase === 'prep' ? (
            <Button variant="primary" size="sm" onClick={onStart}>
              <Play />
              {t('start')}
            </Button>
          ) : null}
        </div>
        {agenda.length ? (
          <ol className="flex flex-col gap-1">
            {agenda.map((item, i) => (
              <li key={item.id} className="group/ag flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-hover/60">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sidebar font-mono text-xs text-fg-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 text-[15px]">{item.text}</span>
                {item.source === 'assistant' ? <Sparkles className="size-3.5 text-accent" aria-label={t('fromAssistant')} /> : null}
                {item.task_id ? <TaskLink taskId={item.task_id} /> : null}
                {editable ? (
                  <button type="button" onClick={() => remove.mutate(item.id)} className="text-xs text-fg-subtle opacity-0 hover:text-danger focus-visible:opacity-100 group-hover/ag:opacity-100">
                    {t('remove')}
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-sm text-fg-muted">{t('agendaEmpty')}</p>
        )}
        {editable ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) {
                addAgenda(draft.trim())
                setDraft('')
              }
            }}
            placeholder={t('agendaAdd')}
            className="mt-2 h-10 w-full rounded-lg border border-dashed border-line-strong bg-transparent px-3 text-sm outline-none placeholder:text-fg-subtle focus:border-solid focus:border-accent"
          />
        ) : null}
      </section>

      {editable && suggestions.length ? (
        <section className="rounded-xl bg-highlight p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-highlight-ink">
            <Sparkles className="size-4" />
            {t('suggestionsTitle')}
          </h2>
          <p className="mb-3 mt-1 text-xs text-fg-muted">{t('suggestionsHint')}</p>
          <ul className="flex flex-col gap-1">
            {suggestions.map((s) => (
              <li key={`${s.reason}-${s.taskId ?? s.text}`} className="flex items-center gap-3 rounded-lg bg-panel px-3 py-2 shadow-card">
                <span className="w-20 shrink-0 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{t(`reason.${s.reason}`)}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{s.text}</span>
                <Button variant="ghost" size="xs" onClick={() => addAgenda(s.text, s.taskId, s.reason === 'carry' ? 'carry' : 'assistant')}>
                  <Plus />
                  {t('addToAgenda')}
                </Button>
              </li>
            ))}
          </ul>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => suggestions.forEach((s) => addAgenda(s.text, s.taskId, s.reason === 'carry' ? 'carry' : 'assistant'))}
          >
            {t('addAll')}
          </Button>
        </section>
      ) : null}

      {/* notas previas que se quieran dejar */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">{t('prepNotes')}</h2>
        <CaptureBox
          members={members}
          placeholder={t('prepPlaceholder')}
          onCapture={(c) => add.mutate({ ...c, position: Date.now() })}
        />
        <div className="mt-2 flex flex-col gap-1">
          {items
            .filter((i) => i.kind !== 'agenda')
            .map((i) => (
              <ItemRow key={i.id} item={i} members={members} editable={editable} onChange={(patch) => update.mutate({ id: i.id, patch })} onRemove={() => remove.mutate(i.id)} />
            ))}
        </div>
      </section>
    </div>
  )
}

// ---------------- En vivo ----------------

function LiveView({ meeting, items, editable, onClose }: { meeting: MeetingRow; items: MeetingItemRow[]; editable: boolean; onClose: () => void }) {
  const t = useTranslations('meeting')
  const members = useWorkspaceMembers(meeting.workspace_id)
  const { add, update, remove } = useMeetingItemMutations(meeting.id)
  const agenda = items.filter((i) => i.kind === 'agenda')
  const captured = items.filter((i) => i.kind !== 'agenda')

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      {agenda.length ? (
        <section className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-fg-muted">{t('agenda')}</span>
          {agenda.map((a, i) => (
            <button
              key={a.id}
              type="button"
              disabled={!editable}
              onClick={() => update.mutate({ id: a.id, patch: { done: !a.done } })}
              className={cn(
                'inline-flex h-7 max-w-72 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors',
                a.done ? 'border-transparent bg-sidebar text-fg-subtle line-through' : 'border-line bg-panel text-fg hover:border-accent',
              )}
              title={a.text}
            >
              <span className="font-mono text-fg-subtle">{i + 1}</span>
              <span className="truncate">{a.text}</span>
            </button>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-0.5">
        {captured.length === 0 ? <p className="px-2 py-6 text-sm text-fg-muted">{t('liveEmpty')}</p> : null}
        {captured.map((i) => (
          <ItemRow
            key={i.id}
            item={i}
            time={format(new Date(i.created_at), 'HH:mm')}
            members={members}
            editable={editable}
            onChange={(patch) => update.mutate({ id: i.id, patch })}
            onRemove={() => remove.mutate(i.id)}
          />
        ))}
      </section>

      {editable ? (
        <div className="sticky bottom-4 z-10">
          <CaptureBox members={members} onCapture={(c) => add.mutate({ ...c, position: Date.now() })} />
        </div>
      ) : null}

      {editable && meeting.phase === 'live' ? (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t('goToClose')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

// ---------------- Cerrar ----------------

function CloseView({ meeting, items, editable }: { meeting: MeetingRow; items: MeetingItemRow[]; editable: boolean }) {
  const t = useTranslations('meeting')
  const ta = useTranslations('assistant')
  const router = useRouter()
  const qc = useQueryClient()
  const memberMap = useMemberMap()
  const ws = useWorkspaceMap().get(meeting.workspace_id)!
  const update = useUpdateMeeting()
  const [pending, start] = useTransition()
  const closed = meeting.phase === 'closed'
  const actions = items.filter((i) => i.kind === 'action')
  const decisions = items.filter((i) => i.kind === 'decision')
  const questions = items.filter((i) => i.kind === 'question')
  const toCreate = actions.filter((a) => !a.task_id).length
  const orphan = actions.filter((a) => !a.assignee_id).length
  const [summary, setSummary] = useState(meeting.summary ?? '')
  useEffect(() => setSummary(meeting.summary ?? ''), [meeting.summary])

  const preview = summarizeMeeting({
    meeting,
    items,
    nameOf: (id) => (id ? (memberMap.get(id)?.full_name ?? null) : null),
    t: (k, v) => ta(k, v),
  })

  const doClose = () =>
    start(async () => {
      const res = await closeMeeting(meeting.id)
      if (!res.ok) {
        toast.error(t('closeError'))
        return
      }
      toast.success(t('closedToast', { count: res.tasksCreated }))
      track('feature.close_with_veltro', { workspaceId: meeting.workspace_id })
      qc.invalidateQueries({ queryKey: meetingKeys.one(meeting.id) })
      qc.invalidateQueries({ queryKey: ['meeting-items'] })
      qc.invalidateQueries({ queryKey: taskKeys.all })
      qc.invalidateQueries({ queryKey: docKeys.all })
      qc.invalidateQueries({ queryKey: meetingKeys.all })
      router.refresh()
    })

  if (!closed) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <section className="rounded-xl border border-line p-5">
          <h2 className="text-base font-semibold">{t('closeTitle')}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t('closeIntro')}</p>
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            <li className="flex items-center gap-2">
              <FileText className="size-4 text-fg-subtle" />
              {t('closeStepSummary')}
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-4 text-fg-subtle" />
              {t('closeStepTasks', { count: toCreate })}
            </li>
            <li className="flex items-center gap-2">
              <Mail className="size-4 text-fg-subtle" />
              {t('closeStepEmail')}
            </li>
            <li className="flex items-center gap-2">
              <Sparkles className="size-4 text-fg-subtle" />
              {t('closeStepMemory', { count: decisions.length })}
            </li>
          </ul>
          {orphan ? <p className="mt-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-fg">{t('orphanWarning', { count: orphan })}</p> : null}
          <div className="mt-4 rounded-lg bg-sidebar p-3 text-sm text-fg-muted">
            <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{t('summaryPreview')}</span>
            {preview}
          </div>
          {editable ? (
            <Button variant="primary" className="mt-5" onClick={doClose} loading={pending}>
              <Sparkles />
              {t('closeWithAssistant')}
            </Button>
          ) : null}
        </section>
      </div>
    )
  }

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <section>
        <h2 className="mb-2 text-sm font-semibold">{t('summary')}</h2>
        <Textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onBlur={() => summary !== meeting.summary && update.mutate({ id: meeting.id, patch: { summary } })}
          readOnly={!editable}
          className="min-h-28 text-[15px] leading-relaxed"
        />
      </section>

      {decisions.length ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">{t('decisionsTitle')}</h2>
          <ul className="flex flex-col gap-1.5">
            {decisions.map((d) => (
              <li key={d.id} className={cn('flex items-start gap-2 rounded-lg px-3 py-2 text-[15px]', KIND_STYLE.decision.row)}>
                <KindChip kind="decision" className="mt-0.5" />
                {d.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {actions.length ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">{t('tasksTitle')}</h2>
          <ul className="flex flex-col gap-1.5">
            {actions.map((a) => {
              const who = a.assignee_id ? memberMap.get(a.assignee_id) : undefined
              return (
                <li key={a.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                  {a.task_id ? <TaskLink taskId={a.task_id} /> : null}
                  <span className="min-w-0 flex-1 truncate text-sm">{a.text}</span>
                  {who ? <Avatar name={who.full_name} seed={who.id} src={who.avatar_url} size={20} /> : <span className="text-xs text-mandarina-ink">{t('noOwner')}</span>}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {questions.length ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">{t('questionsTitle')}</h2>
          <ul className="flex flex-col gap-1.5">
            {questions.map((q) => (
              <li key={q.id} className={cn('flex items-start gap-2 rounded-lg px-3 py-2 text-[15px]', KIND_STYLE.question.row)}>
                <KindChip kind="question" className="mt-0.5" />
                {q.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {meeting.follow_up ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('followUp')}</h2>
            <div className="flex gap-1.5">
              <Button
                variant="ghost"
                size="xs"
                onClick={async () => {
                  await navigator.clipboard.writeText(meeting.follow_up ?? '')
                  toast.success(t('copied'))
                }}
              >
                <ClipboardCopy />
                {t('copy')}
              </Button>
              <a
                href={`mailto:${meeting.attendees.filter((a) => !a.self).map((a) => a.email).join(',')}?subject=${encodeURIComponent(meeting.title)}&body=${encodeURIComponent(meeting.follow_up)}`}
                className={buttonVariants({ variant: 'secondary', size: 'xs' })}
              >
                <Mail />
                {t('sendEmail')}
              </a>
            </div>
          </div>
          <pre className="whitespace-pre-wrap rounded-xl border border-line bg-sidebar p-4 font-sans text-sm leading-relaxed text-fg">{meeting.follow_up}</pre>
        </section>
      ) : null}

      <RecordLink meetingId={meeting.id} slug={ws.slug} />
    </div>
  )
}

function RecordLink({ meetingId, slug }: { meetingId: string; slug: string }) {
  const t = useTranslations('meeting')
  const [docId, setDocId] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    import('@/lib/supabase/client').then(async ({ createClient }) => {
      const { data } = await createClient().from('docs').select('id').eq('meeting_id', meetingId).eq('source', 'meeting').is('archived_at', null).limit(1).maybeSingle()
      if (alive) setDocId(data?.id ?? null)
    })
    return () => {
      alive = false
    }
  }, [meetingId])
  if (!docId) return null
  return (
    <Link href={`/w/${slug}/docs/${docId}`} className="inline-flex items-center gap-2 text-sm text-accent-ink hover:underline">
      <FileText className="size-4" />
      {t('openRecord')}
      <ExternalLink className="size-3.5" />
    </Link>
  )
}

// ---------------- Salida ----------------

function OutcomePanel({
  meeting,
  items,
  previous,
  onCloseClick,
}: {
  meeting: MeetingRow
  items: MeetingItemRow[]
  previous: { meeting: MeetingRow; items: MeetingItemRow[] } | null
  onCloseClick: () => void
}) {
  const t = useTranslations('meeting')
  const memberMap = useMemberMap()
  const actions = items.filter((i) => i.kind === 'action')
  const decisions = items.filter((i) => i.kind === 'decision')
  const questions = items.filter((i) => i.kind === 'question')
  const carry = (previous?.items ?? []).filter((i) => (i.kind === 'action' && i.task_id) || (i.kind === 'question' && !i.done))

  return (
    <aside className="flex flex-col gap-6">
      <div className="rounded-2xl border border-line bg-panel p-4 shadow-card">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t('outcome')}</h2>
          <span className="flex gap-1">
            <Count kind="action" n={actions.length} />
            <Count kind="decision" n={decisions.length} />
            <Count kind="question" n={questions.length} />
          </span>
        </div>
        <p className="mb-4 text-xs text-fg-muted">{t('outcomeHint')}</p>

        <OutcomeGroup title={t('actionsTitle')} empty={t('noneYet')}>
          {actions.map((a) => {
            const who = a.assignee_id ? memberMap.get(a.assignee_id) : undefined
            return (
              <li key={a.id} className="flex flex-col gap-1 py-1.5">
                <span className="text-sm leading-snug">{a.text}</span>
                <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                  {who ? (
                    <>
                      <Avatar name={who.full_name} seed={who.id} src={who.avatar_url} size={14} />
                      {who.full_name.split(' ')[0]}
                    </>
                  ) : (
                    <span className="text-mandarina-ink">{t('noOwner')}</span>
                  )}
                  {a.task_id ? <TaskLink taskId={a.task_id} className="ml-auto h-5" /> : <span className="ml-auto text-2xs text-fg-subtle">{t('willBecomeTask')}</span>}
                </span>
              </li>
            )
          })}
        </OutcomeGroup>

        <OutcomeGroup title={t('decisionsTitle')} empty={t('noneYet')}>
          {decisions.map((d) => (
            <li key={d.id} className="py-1.5 text-sm leading-snug">
              {d.text}
            </li>
          ))}
        </OutcomeGroup>

        <OutcomeGroup title={t('questionsTitle')} empty={t('noneYet')}>
          {questions.map((q) => (
            <li key={q.id} className="py-1.5 text-sm leading-snug">
              {q.text}
            </li>
          ))}
        </OutcomeGroup>

        {meeting.phase !== 'closed' ? (
          <Button variant="primary" className="mt-3 w-full" onClick={onCloseClick}>
            <Sparkles />
            {t('closeWithAssistant')}
          </Button>
        ) : null}
      </div>

      {carry.length ? (
        <div className="rounded-2xl border border-line p-4">
          <h2 className="text-sm font-semibold">{t('fromPrevious')}</h2>
          <p className="mb-2 text-xs text-fg-muted">
            <Link href={`/m/${previous!.meeting.id}`} className="hover:text-fg">
              {previous!.meeting.title}
            </Link>
          </p>
          <ul className="flex flex-col gap-1.5">
            {carry.map((i) => (
              <li key={i.id} className="flex items-center gap-2 text-sm">
                {i.task_id ? <TaskLink taskId={i.task_id} className="h-5" /> : <KindChip kind={i.kind} />}
                <span className="min-w-0 truncate">{i.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  )
}

function Count({ kind, n }: { kind: 'action' | 'decision' | 'question'; n: number }) {
  return <span className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-2xs font-semibold tabular-nums', KIND_STYLE[kind].chip)}>{n}</span>
}

function OutcomeGroup({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="border-t border-line-soft py-2">
      <h3 className="text-xs font-semibold text-fg-muted">{title}</h3>
      {children.length ? <ul className="divide-y divide-line-soft">{children}</ul> : <p className="py-1.5 text-xs text-fg-subtle">{empty}</p>}
    </div>
  )
}
