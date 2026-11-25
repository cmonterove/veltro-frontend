'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { addDays, formatRelative, subDays } from 'date-fns'
import { ArrowRight, CalendarClock, CheckCheck, Eye, FileUp, Forward, Plus, UserRoundPlus } from 'lucide-react'
import { canEdit, useApp, useIsAccountAdmin } from '@/components/app/app-context'
import { LogoMark } from '@/components/app/logo'
import { Button, buttonVariants } from '@/components/ui/button'
import { useTasks } from '@/lib/queries/tasks'
import { useMeetingsInRange } from '@/lib/queries/meetings'
import { assigneesOf } from '@/lib/assignees'
import { UNASSIGNED } from '@/lib/task-filters'
import { useDateLocale } from '@/lib/dates'
import type { ScopeOption } from '@/lib/scope'
import type { TaskRow } from '@/lib/database.types'
import { cn } from '@/lib/utils'

type Suggestion = {
  key: string
  icon: React.ReactNode
  tone: string
  title: string
  hint: string
} & ({ href: string } | { onClick: () => void })

const NO_TASKS: TaskRow[] = []

/**
 * «Todo al día»: cuando no queda nada abierto en lo que se mira. A la izquierda la calma (el check de la
 * marca, con su punta frambuesa: lo que quedó hecho), lo cerrado hace poco si lo hay y crear una tarea
 * con su tecla; a la derecha, «Mientras tanto», lo siguiente útil según los datos: tareas sin
 * responsable para tomar, la próxima reunión (lo acordado ahí llega a esta lista), lo delegado o seguido
 * e importar. Nunca una caja grande vacía.
 */
export function TasksAllClear({
  scope,
  options,
  tasks,
  onCreate,
  onScope,
}: {
  scope: ScopeOption
  options: ScopeOption[]
  /** las tareas de lo que se mira (para contar lo cerrado hace poco) */
  tasks: TaskRow[] | undefined
  onCreate: () => void
  /** mirar otro alcance; con `who`, filtrado por responsable (p. ej. sin responsable) */
  onScope: (scopeId: string, who?: string[]) => void
}) {
  const t = useTranslations('myTasks.clear')
  const tEmpty = useTranslations('myTasks.empty')
  const locale = useDateLocale()
  const pathname = usePathname()
  const { workspaces, observedWorkspaces } = useApp()
  const admin = useIsAccountAdmin()
  const isMe = scope.kind === 'me'
  const hasSpaces = workspaces.length + observedWorkspaces.length > 0
  const canImport = workspaces.some((w) => canEdit(w))
  const canSeeAll = options.some((o) => o.id === 'all')

  // lo de alrededor, solo mirando lo tuyo: sin responsable (toda la empresa), delegadas y seguidas
  const all = useTasks(isMe && canSeeAll ? { kind: 'scope', scopeId: 'all' } : null)
  const delegated = useTasks(isMe ? { kind: 'scope', scopeId: 'delegated' } : null)
  const following = useTasks(isMe ? { kind: 'scope', scopeId: 'following' } : null)
  const open = (xs: TaskRow[] | undefined) => (xs ?? NO_TASKS).filter((x) => x.status !== 'done')
  const unassigned = open(all.data).filter((x) => assigneesOf(x).length === 0).length
  const delegatedOpen = open(delegated.data).length
  const followingOpen = open(following.data).length

  // la próxima reunión de tus espacios (dos semanas hacia adelante); las fechas, fijas al montar
  const [from, to] = useMemo(() => {
    const now = new Date()
    now.setSeconds(0, 0)
    return [now, addDays(now, 14)]
  }, [])
  const meetings = useMeetingsInRange(
    workspaces.map((w) => w.id),
    from,
    to,
  )
  const next = useMemo(
    () =>
      (meetings.data ?? [])
        .filter((m) => m.phase !== 'closed' && new Date(m.starts_at) >= from)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0],
    [meetings.data, from],
  )

  // lo cerrado en el último mes (en la Lista lo de esta semana ya se vería: aquí es lo de antes)
  const closed = useMemo(() => {
    const since = subDays(new Date(), 30).toISOString()
    return (tasks ?? NO_TASKS).filter((x) => x.status === 'done' && (x.completed_at ?? '') >= since).length
  }, [tasks])

  const importTasks = () => {
    // el «⋯» de arriba abre el importador con ?import=1 (y limpia la dirección)
    const params = new URLSearchParams(window.location.search)
    params.set('import', '1')
    window.history.replaceState(null, '', `${pathname}?${params}`)
  }

  const suggestions: Suggestion[] = []
  if (isMe && unassigned > 0)
    suggestions.push({
      key: 'unassigned',
      icon: <UserRoundPlus />,
      tone: 'bg-warning-soft text-mandarina-ink',
      title: t('unassigned.title', { count: unassigned }),
      hint: t('unassigned.hint'),
      onClick: () => onScope('all', [UNASSIGNED]),
    })
  if (next)
    suggestions.push({
      key: 'meeting',
      icon: <CalendarClock />,
      tone: 'bg-accent-soft text-accent-ink',
      title: next.title,
      hint: t('meeting.hint', { when: formatRelative(new Date(next.starts_at), from, { locale }) }),
      href: `/m/${next.id}`,
    })
  if (isMe && delegatedOpen > 0)
    suggestions.push({
      key: 'delegated',
      icon: <Forward />,
      tone: 'bg-k-decision-soft text-k-decision',
      title: t('delegated.title', { count: delegatedOpen }),
      hint: t('delegated.hint'),
      onClick: () => onScope('delegated'),
    })
  if (isMe && followingOpen > 0)
    suggestions.push({
      key: 'following',
      icon: <Eye />,
      tone: 'bg-hover text-fg-muted',
      title: t('following.title', { count: followingOpen }),
      hint: t('following.hint'),
      onClick: () => onScope('following'),
    })
  if (canImport)
    suggestions.push({
      key: 'import',
      icon: <FileUp />,
      tone: 'bg-success-soft text-success',
      title: t('import.title'),
      hint: t('import.hint'),
      onClick: importTasks,
    })
  const shown = suggestions.slice(0, 3)

  const line = !hasSpaces
    ? t('line.noSpaces')
    : scope.kind === 'me'
      ? t('line.me')
      : scope.kind === 'delegated'
        ? t('line.delegated')
        : scope.kind === 'following'
          ? t('line.following')
          : t('line.other', { who: scope.display })

  return (
    // se desplaza por dentro: en Tabla, Tablero y Calendario la tarjeta no lo hace (y en pantallas bajas no entra)
    <div className="h-full overflow-y-auto scrollbar-thin">
    <div className="flex min-h-full items-center justify-center px-5 py-8 sm:px-8 short:py-4">
      <div
        className={cn(
          'grid w-full items-center justify-center gap-x-16 gap-y-8',
          shown.length ? 'md:grid-cols-[minmax(0,25rem)_minmax(0,21rem)] tall:md:grid-cols-[minmax(0,28rem)_minmax(0,23rem)]' : 'max-w-md',
        )}
      >
        {/* la calma */}
        <div className={cn('flex flex-col items-center text-center', shown.length && 'md:items-start md:text-left')}>
          <DoneMark />
          <h2 className="mt-5 text-[26px] font-semibold leading-tight tracking-[-0.025em] text-fg short:mt-3.5 short:text-[24px] tall:text-[30px]">{tEmpty('title')}</h2>
          <p className="mt-1.5 max-w-[44ch] text-sm leading-relaxed text-fg-muted tall:text-[15px]">{line}</p>
          {closed > 0 ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-done-soft px-2.5 py-1 text-xs font-medium text-done short:mt-2.5">
              <CheckCheck className="size-3.5" strokeWidth={2.25} />
              {t('closed', { count: closed })}
            </p>
          ) : null}
          {hasSpaces ? (
            <Button variant="primary" className="mt-5 short:mt-4" onClick={onCreate}>
              <Plus />
              {t('new')}
              <kbd className="ml-1 rounded-[5px] bg-accent-fg/15 px-1.5 py-px font-sans text-2xs font-semibold text-accent-fg max-sm:hidden">C</kbd>
            </Button>
          ) : admin ? (
            <Link href="/settings/workspaces/new" className={cn(buttonVariants({ variant: 'primary' }), 'mt-5 short:mt-4')}>
              <Plus />
              {t('newSpace')}
            </Link>
          ) : null}
        </div>

        {/* mientras tanto: lo siguiente útil */}
        {shown.length ? (
          <section aria-labelledby="all-clear-meanwhile" className="min-w-0 animate-in fade-in-0 duration-300">
            <h3 id="all-clear-meanwhile" className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
              {t('meanwhile')}
            </h3>
            <ul className="flex flex-col gap-0.5">
              {shown.map((s) => {
                const body = (
                  <>
                    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[18px]', s.tone)}>{s.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">{s.title}</span>
                      <span className="block truncate text-xs text-fg-muted first-letter:uppercase">{s.hint}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-fg-subtle transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-fg-muted" />
                  </>
                )
                const cls =
                  'group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-hover/60 focus-visible:ring-2 focus-visible:ring-accent-mid/40'
                return (
                  <li key={s.key}>
                    {'href' in s ? (
                      <Link href={s.href} className={cls}>
                        {body}
                      </Link>
                    ) : (
                      <button type="button" onClick={s.onClick} className={cls}>
                        {body}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
    </div>
  )
}

/** El check de la marca sobre dos halos lilas, con un par de chispas: lo que quedó hecho. */
function DoneMark() {
  return (
    <span aria-hidden className="relative flex size-[88px] shrink-0 items-center justify-center short:size-[68px] tall:size-[104px]">
      <span className="absolute inset-0 rounded-full bg-accent-soft/55" />
      <span className="absolute inset-[11px] rounded-full bg-accent-soft short:inset-[8px] tall:inset-[13px]" />
      <LogoMark className="relative size-[46px] animate-in fade-in-0 zoom-in-75 duration-500 ease-out short:size-9 tall:size-14" />
      {/* las chispas: la frambuesa de la punta y el lila del sello */}
      <span className="absolute right-[7px] top-[9px] size-[7px] rounded-full bg-[var(--logo-b)] animate-in fade-in-0 zoom-in-50 delay-200 duration-500 fill-mode-backwards" />
      <span className="absolute bottom-[12px] left-[4px] size-[5px] rounded-full bg-[var(--logo-a)] opacity-60 animate-in fade-in-0 zoom-in-50 delay-300 duration-500 fill-mode-backwards" />
      <span className="absolute left-[14px] top-[6px] size-1 rounded-full bg-[var(--logo-b)] opacity-50 animate-in fade-in-0 zoom-in-50 delay-[400ms] duration-500 fill-mode-backwards" />
    </span>
  )
}
