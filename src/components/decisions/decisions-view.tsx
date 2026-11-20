'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { addDays, format, isSameDay, isToday, isYesterday, startOfDay, subDays } from 'date-fns'
import { ArrowUpRight, CalendarRange, Copy, LayoutGrid, Search, Sparkles, X } from 'lucide-react'
import { useApp, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Avatar } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip } from '@/components/ui/tooltip'
import { FilterFacet } from '@/components/tasks/task-filters'
import { useDecisions, type Decision } from '@/lib/queries/decisions'
import { useMeetingsInRange } from '@/lib/queries/meetings'
import { useDateLocale } from '@/lib/dates'
import { useCopy } from '@/lib/clipboard'
import { cn } from '@/lib/utils'
import { CARD } from '@/components/ui/surface'
import { AI_ENABLED } from '@/lib/features'

const PERIODS = ['all', '7', '30', '90', '365'] as const
type Period = (typeof PERIODS)[number]

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

/** Las decisiones seguidas de una misma reunión van juntas, bajo el día de la reunión. */
type Group = { meeting: Decision['meeting']; workspace: Decision['workspace']; items: Decision[] }

function groupByMeeting(items: Decision[]) {
  const out: Group[] = []
  for (const d of items) {
    const last = out[out.length - 1]
    if (last && last.meeting.id === d.meeting.id) last.items.push(d)
    else out.push({ meeting: d.meeting, workspace: d.workspace, items: [d] })
  }
  return out
}

/**
 * El registro de decisiones: lo que se decidió en las reuniones de todos mis espacios, para responder
 * «¿qué decidimos de…?» sin abrir reunión por reunión. Busca en la decisión y en el título de la
 * reunión; se filtra por espacio y por período. La URL lleva la búsqueda, los espacios y la reunión.
 */
export function DecisionsView() {
  const t = useTranslations('decisions')
  const pathname = usePathname()
  const params = useSearchParams()
  const { workspaces, observedWorkspaces } = useApp()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [wsIds, setWsIds] = useState<string[]>(() => (params.get('ws') ?? '').split(',').filter(Boolean))
  const [period, setPeriod] = useState<Period>('all')
  const [meetingId, setMeetingId] = useState<string | null>(params.get('meeting'))
  const q = useDebounced(query.trim()).slice(0, 200)
  const since = useMemo(() => (period === 'all' ? undefined : format(subDays(new Date(), Number(period)), 'yyyy-MM-dd')), [period])
  const page = useDecisions({ q: q || undefined, workspaceIds: wsIds, since, meetingId: meetingId ?? undefined })
  const items = useMemo(() => page.data?.pages.flatMap((p) => p.items) ?? [], [page.data])
  const groups = useMemo(() => groupByMeeting(items), [items])
  const filtering = Boolean(q || wsIds.length || since || meetingId)

  // la URL sigue a la búsqueda (se puede compartir «lo que decidimos de X»)
  useEffect(() => {
    const next = new URLSearchParams()
    if (q) next.set('q', q)
    if (wsIds.length) next.set('ws', wsIds.join(','))
    if (meetingId) next.set('meeting', meetingId)
    const s = next.toString()
    window.history.replaceState(null, '', `${pathname}${s ? `?${s}` : ''}`)
  }, [q, wsIds, meetingId, pathname])

  // al llegar al final, la página siguiente
  const more = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = page
  useEffect(() => {
    const el = more.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && !isFetchingNextPage && fetchNextPage(), { rootMargin: '400px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length])

  const wsOptions = [...workspaces, ...observedWorkspaces].map((w) => ({ value: w.id, label: w.name, icon: <WorkspaceMark ws={w} size={16} /> }))
  const pinnedMeeting = meetingId ? items.find((d) => d.meeting.id === meetingId)?.meeting : undefined
  const askHref = `/veltro?q=${encodeURIComponent(t('askQuestion', { topic: q }))}`

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-4 pb-4 pt-4 sm:px-6">
      {/* lo primero que se hace acá es buscar: el buscador es la pieza de esta pantalla */}
      <header className="shrink-0 px-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">{t('title')}</h1>
          <span className="text-sm text-fg-muted">
            {items.length && !filtering
              ? t('countLine', { count: items.length, more: hasNextPage ? 'yes' : 'no', meetings: new Set(items.map((d) => d.meeting.id)).size })
              : t('subtitle')}
          </span>
        </div>
        {/* el buscador grande, con el brillo lila del de la barra de arriba, y al lado los filtros */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative flex min-w-[16rem] flex-1 items-center">
          <Search className="pointer-events-none absolute left-4 size-4 text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder={t('search')}
            aria-label={t('search')}
            autoFocus
            className="h-12 w-full rounded-[16px] bg-panel pl-11 pr-10 text-[15px] text-fg shadow-[0_0_0_1px_oklch(0.243_0.088_312.7/0.08),0_0_0_5px_oklch(0.773_0.115_303/0.16),0_14px_32px_-20px_oklch(0.3_0.09_312/0.45)] outline-none transition-shadow placeholder:text-fg-subtle focus:shadow-[0_0_0_1px_oklch(0.377_0.15_311.4/0.4),0_0_0_5px_oklch(0.773_0.115_303/0.32),0_14px_32px_-20px_oklch(0.3_0.09_312/0.45)]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
              aria-label={t('clearSearch')}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
          <FilterFacet
            icon={<LayoutGrid />}
            label={t('space')}
            options={wsOptions}
            value={wsIds}
            onToggle={(v, on) => setWsIds((x) => (on ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))}
            onClear={() => setWsIds([])}
          />
          <PeriodChip value={period} onChange={setPeriod} />
          {meetingId ? (
            <span className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg border border-accent-mid/40 bg-accent-soft pl-2.5 pr-1 text-sm text-accent-ink">
              <span className="truncate">{t('meeting', { title: pinnedMeeting?.title ?? '…' })}</span>
              <button
                type="button"
                onClick={() => setMeetingId(null)}
                className="inline-flex size-6 items-center justify-center rounded-md hover:bg-accent-mid/15"
                aria-label={t('clearMeeting')}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ) : null}
          {q && AI_ENABLED ? (
            <Link href={askHref} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-accent-ink hover:bg-accent-soft">
              <Sparkles className="size-4" />
              {t('ask')}
            </Link>
          ) : null}
        </div>
      </header>

      {page.isError && !page.data ? (
        <ErrorState onRetry={() => page.refetch()} />
      ) : !page.data ? (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="rounded-[24px]" />
          <Skeleton className="hidden rounded-[24px] lg:block" />
        </div>
      ) : groups.length === 0 && !filtering ? (
        <EmptyDecisions />
      ) : groups.length === 0 ? (
        <section className={cn(CARD, 'flex min-h-0 flex-1 overflow-y-auto scrollbar-thin')}>
          <Empty filtering={filtering} q={q} askHref={askHref} />
        </section>
      ) : (
        // la línea de tiempo en su tarjeta (ancha) y, al lado, de qué espacios y reuniones salió lo decidido
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className={cn(CARD, 'min-h-0 overflow-y-auto px-5 pb-2 pt-1 scrollbar-thin')}>
            {/* cada día un punto en la línea, cada reunión un bloque colgado de ella */}
            <ol className={cn('relative ml-2 border-l-2 border-line-soft pl-6 transition-opacity', page.isFetching && !page.isFetchingNextPage && 'opacity-60')}>
              {groups.map((g, i) => {
                const day = new Date(g.meeting.startsAt)
                const newDay = i === 0 || !isSameDay(day, new Date(groups[i - 1].meeting.startsAt))
                return (
                  <Fragment key={`${g.meeting.id}-${g.items[0].id}`}>
                    {newDay ? <DayLabel date={day} /> : null}
                    <MeetingDecisions group={g} q={q} onOnlyMeeting={() => setMeetingId(g.meeting.id)} pinned={meetingId === g.meeting.id} />
                  </Fragment>
                )
              })}
            </ol>
            <div ref={more} className="flex h-10 items-center justify-center">
              {isFetchingNextPage ? <Spinner className="size-4" /> : null}
            </div>
          </section>
          <Sources items={items} onSpace={(id) => setWsIds([id])} onMeeting={setMeetingId} activeSpaces={wsIds} activeMeeting={meetingId} />
        </div>
      )}
    </div>
  )
}

/**
 * De dónde salió lo decidido (en lo que se ve): cuántas decisiones por espacio y las reuniones que más
 * decidieron. Cada fila filtra: un espacio, o solo esa reunión.
 */
function Sources({
  items,
  onSpace,
  onMeeting,
  activeSpaces,
  activeMeeting,
}: {
  items: Decision[]
  onSpace: (id: string) => void
  onMeeting: (id: string) => void
  activeSpaces: string[]
  activeMeeting: string | null
}) {
  const t = useTranslations('decisions')
  const locale = useDateLocale()
  const spaces = useMemo(() => {
    const m = new Map<string, { ws: Decision['workspace']; n: number }>()
    for (const d of items) m.set(d.workspace.id, { ws: d.workspace, n: (m.get(d.workspace.id)?.n ?? 0) + 1 })
    return [...m.values()].sort((a, b) => b.n - a.n)
  }, [items])
  const meetings = useMemo(() => {
    const m = new Map<string, { meeting: Decision['meeting']; ws: Decision['workspace']; n: number }>()
    for (const d of items) m.set(d.meeting.id, { meeting: d.meeting, ws: d.workspace, n: (m.get(d.meeting.id)?.n ?? 0) + 1 })
    return [...m.values()].sort((a, b) => b.n - a.n || b.meeting.startsAt.localeCompare(a.meeting.startsAt)).slice(0, 6)
  }, [items])
  const max = Math.max(1, ...spaces.map((s) => s.n))

  return (
    <aside className={cn(CARD, 'hidden min-h-0 flex-col overflow-y-auto px-5 py-4 scrollbar-thin lg:flex')}>
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-[-0.015em] text-fg">
        <span className="size-2.5 rotate-45 rounded-[2px] bg-k-decision" aria-hidden />
        {t('side.total', { count: items.length })}
      </h2>

      <p className="mt-4 text-xs font-semibold text-fg-muted">{t('side.spaces')}</p>
      <ul className="-mx-2 mt-1 flex flex-col">
        {spaces.map(({ ws, n }) => (
          <li key={ws.id}>
            <button
              type="button"
              onClick={() => onSpace(ws.id)}
              className={cn('flex w-full flex-col gap-1.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-hover/60', activeSpaces.includes(ws.id) && 'bg-accent-soft hover:bg-accent-soft')}
            >
              <span className="flex w-full items-center gap-2 text-sm">
                <WorkspaceMark ws={ws} size={18} />
                <span className="min-w-0 flex-1 truncate font-medium text-fg">{ws.name}</span>
                <span className="text-xs font-semibold tabular-nums text-fg-muted">{n}</span>
              </span>
              <span className="h-1.5 w-full overflow-hidden rounded-full bg-fg/[0.06]">
                <span className="block h-full rounded-full bg-k-decision" style={{ width: `${(n / max) * 100}%` }} />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs font-semibold text-fg-muted">{t('side.meetings')}</p>
      <ul className="-mx-2 mt-1 flex flex-col">
        {meetings.map(({ meeting, ws, n }) => (
          <li key={meeting.id}>
            <button
              type="button"
              onClick={() => onMeeting(meeting.id)}
              className={cn('flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-hover/60', activeMeeting === meeting.id && 'bg-accent-soft hover:bg-accent-soft')}
            >
              <WorkspaceMark ws={ws} size={18} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{meeting.title}</span>
                <span className="block text-xs text-fg-subtle first-letter:uppercase">{format(new Date(meeting.startsAt), 'EEE d MMM', { locale })}</span>
              </span>
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-k-decision-soft px-1.5 text-[11px] font-semibold tabular-nums text-k-decision">{n}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function PeriodChip({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const t = useTranslations('decisions.period')
  const active = value !== 'all'
  return (
    <Menu>
      <MenuTrigger
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid/40',
          active ? 'border-accent-mid/40 bg-accent-soft text-accent-ink' : 'border-dashed border-line-strong text-fg-muted hover:bg-hover hover:text-fg',
        )}
      >
        <CalendarRange className="size-3.5" />
        {active ? t(value) : t('label')}
      </MenuTrigger>
      <MenuContent align="start" className="w-48">
        <MenuRadioGroup value={value} onValueChange={(v) => onChange(v as Period)}>
          {PERIODS.map((p) => (
            <MenuRadioItem key={p} value={p} closeOnClick>
              {t(p)}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}

function DayLabel({ date }: { date: Date }) {
  const t = useTranslations('decisions')
  const locale = useDateLocale()
  const label = isToday(date) ? t('today') : isYesterday(date) ? t('yesterday') : format(date, date.getFullYear() === new Date().getFullYear() ? 'EEEE d MMM' : 'd MMM yyyy', { locale })
  return (
    <li className="relative pb-2 pt-7 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
      <span aria-hidden className="absolute -left-[33px] top-[26px] size-3.5 rounded-full border-[3px] border-panel bg-k-decision" />
      {label}
    </li>
  )
}

function MeetingDecisions({ group, q, onOnlyMeeting, pinned }: { group: Group; q: string; onOnlyMeeting: () => void; pinned: boolean }) {
  const t = useTranslations('decisions')
  const copy = useCopy()
  const { meeting, workspace } = group
  return (
    <li className="mt-2 rounded-2xl bg-canvas/70 px-1 py-2.5 ring-1 ring-line-soft">
      <div className="flex min-w-0 items-center gap-2 px-2 text-xs text-fg-muted">
        <WorkspaceMark ws={workspace} size={16} />
        <span className="shrink-0">{workspace.name}</span>
        <span aria-hidden className="text-fg-subtle">·</span>
        {pinned ? (
          <span className="truncate font-medium text-fg">
            <Highlight text={meeting.title} q={q} />
          </span>
        ) : (
          <Tooltip content={t('onlyMeeting')}>
            <button type="button" onClick={onOnlyMeeting} className="truncate font-medium text-fg hover:underline">
              <Highlight text={meeting.title} q={q} />
            </button>
          </Tooltip>
        )}
        <span className="shrink-0 tabular-nums">{format(new Date(meeting.startsAt), 'HH:mm')}</span>
        {meeting.phase !== 'closed' ? <span className="shrink-0 rounded-md bg-highlight px-1.5 py-px text-2xs font-medium text-highlight-ink">{t('unconfirmed')}</span> : null}
        <Link href={`/m/${meeting.id}`} className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium text-accent-ink hover:bg-accent-soft">
          {t('openMeeting')}
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      <ul className="mt-1">
        {group.items.map((d) => (
          <li key={d.id} className="group/dec flex items-start gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-panel">
            <span className="mt-[7px] size-2 shrink-0 rotate-45 rounded-[1px] bg-k-decision" aria-hidden />
            <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-fg">
              <Highlight text={d.text} q={q} />
            </p>
            <Tooltip content={t('copy')}>
              <button
                type="button"
                onClick={() => copy(d.text, t('copied'))}
                aria-label={t('copy')}
                className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-subtle opacity-0 transition-opacity hover:bg-panel hover:text-fg focus-visible:opacity-100 group-hover/dec:opacity-100"
              >
                <Copy className="size-3.5" />
              </button>
            </Tooltip>
            {d.author ? (
              <Tooltip content={t('by', { name: d.author.fullName })}>
                <span className="mt-1">
                  <Avatar name={d.author.fullName} src={d.author.avatarUrl} seed={d.author.id} size={20} />
                </span>
              </Tooltip>
            ) : null}
          </li>
        ))}
      </ul>
    </li>
  )
}

/** Marca lo buscado dentro del texto (sin distinguir mayúsculas). */
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'))
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-[3px] bg-highlight px-0.5 text-highlight-ink">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  )
}

/**
 * Todavía sin decisiones: en vez de una tarjeta vacía, cómo se registra una (tres pasos, con la
 * notación de verdad) y las reuniones de estas dos semanas, que es donde se toman.
 */
function EmptyDecisions() {
  const t = useTranslations('decisions.empty')
  const tf = useTranslations('decisions.flow')
  const locale = useDateLocale()
  const { workspaces } = useApp()
  const wsMap = useWorkspaceMap()
  const ids = useMemo(() => workspaces.map((w) => w.id), [workspaces])
  const [from, to] = useMemo(() => [subDays(startOfDay(new Date()), 14), addDays(startOfDay(new Date()), 15)], [])
  const { data: meetings } = useMeetingsInRange(ids, from, to)
  const now = Date.now()
  const upcoming = (meetings ?? []).filter((m) => Date.parse(m.starts_at) >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 4)
  const recent = (meetings ?? []).filter((m) => Date.parse(m.starts_at) < now).sort((a, b) => b.starts_at.localeCompare(a.starts_at)).slice(0, 4)
  const step = 'flex size-7 shrink-0 items-center justify-center rounded-full bg-k-decision-soft text-xs font-semibold tabular-nums text-k-decision'

  const meetingRows = (list: typeof upcoming) => (
    <ul className="-mx-2 flex flex-col">
      {list.map((m) => {
        const ws = wsMap.get(m.workspace_id)
        return (
          <li key={m.id}>
            <Link href={`/m/${m.id}`} className="group flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-hover/60">
              {ws ? <WorkspaceMark ws={ws} size={20} /> : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{m.title}</span>
                <span className="block text-xs text-fg-subtle first-letter:uppercase">{format(new Date(m.starts_at), "EEE d MMM · HH:mm", { locale })}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-accent-ink opacity-70 transition-opacity group-hover:opacity-100">
                {tf('open')}
                <ArrowUpRight className="size-3.5" />
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(20rem,1fr)]">
      <section className={cn(CARD, 'flex min-h-0 flex-col overflow-y-auto px-6 pb-6 pt-5 scrollbar-thin')}>
        <h2 className="text-[20px] font-semibold leading-tight tracking-[-0.02em] text-fg">{t('title')}</h2>
        <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-fg-muted">{t('body')}</p>
        {/* los tres pasos, con la notación de verdad */}
        <ol className="mt-5 grid flex-1 gap-3 md:grid-cols-3" aria-hidden>
          <li className="flex flex-col gap-3 rounded-2xl bg-canvas/70 p-4 ring-1 ring-line-soft">
            <span className="flex items-center gap-2.5">
              <span className={step}>1</span>
              <span className="text-sm font-semibold text-fg">{tf('write')}</span>
            </span>
            <div className="flex flex-1 flex-col justify-center">
              <p className="rounded-xl bg-panel px-3 py-2.5 font-mono text-[13px] text-fg shadow-card ring-1 ring-line-soft">
                <span className="rounded bg-k-decision-soft px-1 font-semibold text-k-decision">&lt;&gt;</span> {t('example')}
              </p>
            </div>
          </li>
          <li className="flex flex-col gap-3 rounded-2xl bg-canvas/70 p-4 ring-1 ring-line-soft">
            <span className="flex items-center gap-2.5">
              <span className={step}>2</span>
              <span className="text-sm font-semibold text-fg">{tf('mark')}</span>
            </span>
            <div className="flex flex-1 flex-col justify-center">
              <p className="flex items-start gap-3 rounded-xl bg-panel px-3 py-2.5 shadow-card ring-1 ring-k-decision/25">
                <span className="mt-[7px] size-2 shrink-0 rotate-45 rounded-[1px] bg-k-decision" />
                <span className="text-[15px] text-fg">{t('example')}</span>
              </p>
            </div>
          </li>
          <li className="flex flex-col gap-3 rounded-2xl bg-canvas/70 p-4 ring-1 ring-line-soft">
            <span className="flex items-center gap-2.5">
              <span className={step}>3</span>
              <span className="text-sm font-semibold text-fg">{tf('land')}</span>
            </span>
            <div className="relative my-auto ml-1.5 border-l-2 border-line-soft pl-4">
              <span className="absolute -left-[7px] top-1 size-3 rounded-full border-2 border-canvas bg-k-decision" />
              <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{tf('today')}</p>
              <p className="mt-1.5 flex items-start gap-2.5 rounded-xl bg-panel px-3 py-2 shadow-card ring-1 ring-line-soft">
                <span className="mt-[6px] size-2 shrink-0 rotate-45 rounded-[1px] bg-k-decision" />
                <span className="text-sm text-fg">{t('example')}</span>
              </p>
            </div>
          </li>
        </ol>
      </section>

      {/* donde se toman las decisiones: las reuniones de estas dos semanas */}
      <section className={cn(CARD, 'flex min-h-0 flex-col overflow-y-auto px-5 pb-4 pt-5 scrollbar-thin')}>
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-[-0.015em] text-fg">
          <CalendarRange className="size-4 text-mandarina-ink" aria-hidden />
          {tf('meetings')}
        </h2>
        <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{tf('meetingsHint')}</p>
        {!meetings ? (
          <div className="mt-4 flex flex-col gap-2">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
        ) : upcoming.length || recent.length ? (
          <>
            {upcoming.length ? (
              <>
                <p className="mt-4 text-xs font-semibold text-fg-muted">{tf('upcoming')}</p>
                {meetingRows(upcoming)}
              </>
            ) : null}
            {recent.length ? (
              <>
                <p className="mt-4 text-xs font-semibold text-fg-muted">{tf('recent')}</p>
                {meetingRows(recent)}
              </>
            ) : null}
          </>
        ) : (
          <div className="mt-4 flex flex-col items-start gap-3">
            <p className="text-sm text-fg-muted">{tf('noMeetings')}</p>
            <Link href="/calendar" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              {t('cta')}
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}

function Empty({ filtering, q, askHref }: { filtering: boolean; q: string; askHref: string }) {
  const t = useTranslations('decisions.empty')
  // sin decisiones todavía: cómo llegan, mostrado con la notación de las reuniones
  if (!filtering) {
    return (
      <div className="m-auto grid w-full max-w-4xl items-center gap-10 px-8 py-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2.5 rounded-2xl bg-canvas/70 p-5 ring-1 ring-line-soft" aria-hidden>
          <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{t('demoNote')}</p>
          <p className="rounded-lg bg-sidebar/70 px-3 py-2 font-mono text-[13px] text-fg">
            <span className="rounded bg-k-decision-soft px-1 font-semibold text-k-decision">&lt;&gt;</span> {t('example')}
          </p>
          <span className="pl-4 text-fg-subtle">↓</span>
          <p className="flex items-start gap-3 rounded-lg px-3 py-2 ring-1 ring-k-decision/25">
            <span className="mt-[7px] size-2 shrink-0 rotate-45 rounded-[1px] bg-k-decision" />
            <span className="text-[15px] text-fg">{t('example')}</span>
          </p>
        </div>
        <div>
          <p className="text-[24px] font-semibold leading-tight tracking-[-0.025em] text-fg">{t('title')}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{t('body')}</p>
          <Link href="/calendar" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'mt-4')}>
            {t('cta')}
          </Link>
        </div>
      </div>
    )
  }
  return (
    <div className="m-auto flex flex-col items-start gap-3 px-8 py-12">
      <span className="flex size-10 items-center justify-center rounded-xl bg-k-decision-soft">
        <span className="size-3 rotate-45 rounded-[2px] bg-k-decision" aria-hidden />
      </span>
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-base font-medium text-fg">{q ? t('searchTitle', { q }) : t('filteredTitle')}</p>
        <p className="text-sm leading-relaxed text-fg-muted">{t('searchBody')}</p>
      </div>
      {q && AI_ENABLED ? (
        <Link href={askHref} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          <Sparkles />
          {t('ask')}
        </Link>
      ) : null}
    </div>
  )
}

