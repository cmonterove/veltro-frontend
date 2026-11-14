'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { format, isSameDay, isToday, isYesterday, subDays } from 'date-fns'
import { ArrowUpRight, CalendarRange, Copy, LayoutGrid, Search, Sparkles, X } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
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
import { useDateLocale } from '@/lib/dates'
import { useCopy } from '@/lib/clipboard'
import { cn } from '@/lib/utils'

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
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line px-4 pb-4 pt-6 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="text-lg font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-fg-muted">{t('subtitle')}</p>

          <div className="relative mt-4 flex items-center">
            <Search className="pointer-events-none absolute left-3.5 size-4 text-fg-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              placeholder={t('search')}
              aria-label={t('search')}
              autoFocus
              className="h-11 w-full rounded-xl border border-line bg-panel pl-10 pr-10 text-[15px] outline-none transition-[border-color,box-shadow] placeholder:text-fg-subtle hover:border-line-strong focus:border-accent-mid focus:shadow-[0_0_0_3px_color-mix(in_oklch,var(--accent-mid)_14%,transparent)]"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 inline-flex size-6 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
                aria-label={t('clearSearch')}
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
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
            {q ? (
              <Link
                href={askHref}
                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-accent-ink hover:bg-accent-soft"
              >
                <Sparkles className="size-4" />
                {t('ask')}
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-2 sm:px-6">
          {page.isError && !page.data ? (
            <ErrorState onRetry={() => page.refetch()} className="mt-10" />
          ) : !page.data ? (
            <div className="flex flex-col gap-6 pt-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-5 w-1/2" />
                </div>
              ))}
            </div>
          ) : groups.length === 0 ? (
            <Empty filtering={filtering} q={q} askHref={askHref} />
          ) : (
            <ol className={cn('transition-opacity', page.isFetching && !page.isFetchingNextPage && 'opacity-60')}>
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
          )}
          <div ref={more} className="flex h-10 items-center justify-center">
            {isFetchingNextPage ? <Spinner className="size-4" /> : null}
          </div>
        </div>
      </div>
    </div>
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
  return <li className="sticky top-0 z-[1] -mx-1 bg-canvas/95 px-1 pb-1.5 pt-6 text-2xs font-semibold uppercase tracking-wide text-fg-subtle backdrop-blur-[2px]">{label}</li>
}

function MeetingDecisions({ group, q, onOnlyMeeting, pinned }: { group: Group; q: string; onOnlyMeeting: () => void; pinned: boolean }) {
  const t = useTranslations('decisions')
  const copy = useCopy()
  const { meeting, workspace } = group
  return (
    <li className="mt-1.5 rounded-xl py-2">
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
          <li key={d.id} className="group/dec flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-hover">
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

function Empty({ filtering, q, askHref }: { filtering: boolean; q: string; askHref: string }) {
  const t = useTranslations('decisions.empty')
  return (
    <div className="flex flex-col items-start gap-3 py-12">
      <span className="flex size-10 items-center justify-center rounded-xl bg-k-decision-soft">
        <span className="size-3 rotate-45 rounded-[2px] bg-k-decision" aria-hidden />
      </span>
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-base font-medium text-fg">{filtering ? (q ? t('searchTitle', { q }) : t('filteredTitle')) : t('title')}</p>
        <p className="text-sm leading-relaxed text-fg-muted">{filtering ? t('searchBody') : t('body')}</p>
      </div>
      {q ? (
        <Link href={askHref} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          <Sparkles />
          {t('ask')}
        </Link>
      ) : !filtering ? (
        <Link href="/calendar" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          {t('cta')}
        </Link>
      ) : null}
    </div>
  )
}

