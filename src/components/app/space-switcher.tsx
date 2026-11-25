'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Check, ChevronDown, FileText, LayoutDashboard, ListTodo, Plus, Settings2, Video } from 'lucide-react'
import { useApp, useIsAccountAdmin } from './app-context'
import { WorkspaceMark } from './marks'
import { Menu, MenuContent, MenuLinkItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Kbd } from '@/components/ui/kbd'
import { useTasks } from '@/lib/queries/tasks'
import { matchesCounter } from '@/lib/scope'
import { cn } from '@/lib/utils'
import type { WorkspaceWithRole } from '@/lib/types'

/**
 * Los espacios, a la izquierda de la barra de arriba (antes ocupaban media barra lateral). Adentro de uno,
 * solo ese: una pastilla blanca (como el buscador de la derecha) con su logo, su nombre y sus secciones; al
 * lado, «+N» con los colores de los demás abre la lista de todos. Fuera de un espacio, un solo botón
 * «Espacios» con el mismo menú: cada espacio con cómo va y, para admins, crear otro. Vive sobre el marco
 * (on-frame); la pastilla y el menú, en la hoja.
 */
export function SpaceSwitcher() {
  const t = useTranslations('nav')
  const tWs = useTranslations('workspace')
  const pathname = usePathname()
  const { workspaces } = useApp()
  const isAdmin = useIsAccountAdmin()
  const current = workspaces.find((w) => pathname === `/w/${w.slug}` || pathname.startsWith(`/w/${w.slug}/`))
  const others = workspaces.filter((w) => w.id !== current?.id)

  if (!workspaces.length && !isAdmin) return null

  return (
    <nav aria-label={t('workspaces')} data-tour="spaces" className="on-frame flex min-w-0 items-center gap-1.5">
      {current ? <CurrentSpace ws={current} pathname={pathname} summaryLabel={tWs('summary')} /> : null}

      {/* los demás: «+N» con sus colores (o «Espacios», si no estás en ninguno) abre la lista de todos */}
      {others.length || isAdmin ? (
        <Menu>
          <MenuTrigger
            aria-label={current ? t('spaces.others', { count: others.length }) : t('spaces.title')}
            title={current ? t('spaces.others', { count: others.length }) : undefined}
            className={cn(
              'group/more inline-flex h-9 shrink-0 items-center gap-2 rounded-[12px] bg-fg/[0.07] text-[13px] font-semibold tabular-nums text-fg outline-none ring-1 ring-inset ring-fg/[0.06] transition-[background-color,box-shadow] duration-150 hover:bg-fg/[0.11] focus-visible:ring-2 focus-visible:ring-accent-mid/40 data-[popup-open]:bg-fg/[0.13]',
              others.length ? 'pl-2.5 pr-2' : 'w-9 justify-center',
            )}
          >
            {others.length ? <Swatches spaces={others} /> : null}
            {current ? (others.length ? <span>+{others.length}</span> : null) : <span>{t('workspaces')}</span>}
            <ChevronDown className="size-3.5 text-fg-muted transition-transform duration-200 ease-out group-data-[popup-open]/more:rotate-180" />
          </MenuTrigger>
          <MenuContent align="start" sideOffset={8} className="w-[22rem] p-1.5">
            <div className="flex items-baseline justify-between px-2 pb-1.5 pt-1">
              <p className="text-[13px] font-semibold text-fg">{t('spaces.title')}</p>
              <span className="text-xs tabular-nums text-fg-subtle">{t('workspacesCount', { count: workspaces.length })}</span>
            </div>
            {workspaces.length === 0 ? <p className="px-2 pb-2 text-sm text-fg-muted">{t('noWorkspaces')}</p> : null}
            {workspaces.map((ws, i) => (
              <SpaceRow key={ws.id} ws={ws} index={i} current={ws.id === current?.id} />
            ))}
            {isAdmin ? (
              <>
                <MenuSeparator />
                <MenuLinkItem closeOnClick render={<Link href="/settings/workspaces/new" />}>
                  <Plus />
                  {t('newWorkspace')}
                </MenuLinkItem>
                <MenuLinkItem closeOnClick render={<Link href="/settings/workspaces" />}>
                  <Settings2 />
                  {t('spaces.manage')}
                </MenuLinkItem>
              </>
            ) : null}
          </MenuContent>
        </Menu>
      ) : null}
    </nav>
  )
}

/**
 * Los colores de los otros espacios, como fichitas en abanico (con logo o sin él, cada espacio tiene su
 * color): una pista de qué hay detrás de «+N» sin encimar logos.
 */
function Swatches({ spaces }: { spaces: WorkspaceWithRole[] }) {
  return (
    <span className="flex items-center -space-x-1.5" aria-hidden>
      {spaces.slice(0, 3).map((ws, i) => (
        <span
          key={ws.id}
          // un filo perla: el violeta de un espacio no se pierde sobre el ciruela de la barra
          className={cn(`ws-${ws.color}`, 'relative size-3.5 rounded-[5px] shadow-[0_0_0_1.5px_oklch(0.969_0.011_54.5/0.55),0_2px_4px_oklch(0.1_0.04_310/0.35)]')}
          style={{ background: 'var(--ws-color)', rotate: `${(i - 1) * 8}deg`, zIndex: 3 - i }}
        />
      ))}
    </span>
  )
}

/** El espacio donde estás: una pastilla blanca con su logo, su nombre y sus secciones (la actual marcada). */
function CurrentSpace({ ws, pathname, summaryLabel }: { ws: WorkspaceWithRole; pathname: string; summaryLabel: string }) {
  const t = useTranslations('nav')
  const base = `/w/${ws.slug}`
  const sections = [
    { href: base, label: summaryLabel, icon: LayoutDashboard },
    { href: `${base}/tasks`, label: t('tasks'), icon: ListTodo },
    { href: `${base}/docs`, label: t('docs'), icon: FileText },
    { href: `${base}/meetings`, label: t('meetings'), icon: Video },
  ]
  const isActive = (href: string) => (href === base ? pathname === base : pathname.startsWith(href))
  return (
    // on-sheet: blanca y con el texto de la hoja, aunque viva sobre el marco
    <div
      className={cn(
        `ws-${ws.color}`,
        'on-sheet flex h-10 min-w-0 shrink items-center gap-0.5 rounded-[13px] bg-panel p-1 shadow-[0_0_0_3px_color-mix(in_oklch,var(--ws-color)_28%,transparent),0_10px_24px_-16px_oklch(0.12_0.04_315/0.7)]',
      )}
    >
      <Link
        href={base}
        aria-current={pathname === base ? 'page' : undefined}
        className="flex min-w-0 shrink items-center gap-2 rounded-[9px] pl-0.5 pr-2 outline-none focus-visible:ring-2 focus-visible:ring-accent-mid/40"
      >
        <WorkspaceMark ws={ws} size={26} />
        <span className="min-w-0 truncate text-[13px] font-semibold text-fg">{ws.name}</span>
      </Link>
      <span className="mr-0.5 h-5 w-px shrink-0 bg-line" aria-hidden />
      <nav aria-label={t('spaces.sections', { name: ws.name })} className="flex shrink-0 items-center gap-0.5">
        {sections.map(({ href, label, icon: Icon }) => {
          const on = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? 'page' : undefined}
              title={label}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] px-2 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent-mid/40',
                on ? 'bg-accent-soft text-accent-ink' : 'text-fg-muted hover:bg-hover hover:text-fg',
              )}
            >
              <Icon className={cn('size-3.5 shrink-0', on ? 'text-accent-ink' : 'text-fg-subtle')} />
              {/* en pantallas medianas, la actual dice su nombre y las demás solo el ícono */}
              <span className={cn(on ? 'inline' : 'hidden xl:inline')}>{label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

/**
 * Un espacio en el menú de todos: su marca, el nombre, para qué es y cómo va (abiertas y vencidas, con las
 * tareas que ya están a mano); el actual va teñido con su color. Las cifras se piden solo con el menú abierto.
 */
function SpaceRow({ ws, index, current }: { ws: WorkspaceWithRole; index: number; current: boolean }) {
  const t = useTranslations('nav.spaces')
  const { data } = useTasks({ kind: 'workspace', workspaceId: ws.id })
  const counts = useMemo(() => {
    if (!data) return null
    const now = new Date()
    return { open: data.filter((x) => x.status !== 'done').length, overdue: data.filter((x) => matchesCounter(x, 'overdue', now)).length }
  }, [data])
  return (
    <MenuLinkItem
      closeOnClick
      render={<Link href={`/w/${ws.slug}`} />}
      className={cn(`ws-${ws.color}`, 'h-auto items-center gap-3 rounded-xl px-2 py-2 [&_svg]:size-auto')}
      style={current ? { background: 'color-mix(in oklch, var(--ws-color) 12%, var(--panel))' } : undefined}
    >
      <WorkspaceMark ws={ws} size={34} className="shadow-[0_6px_14px_-10px_oklch(0.2_0.05_310/0.6)]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-fg">{ws.name}</span>
          {current ? <Check className="!size-3.5 shrink-0 !text-accent" strokeWidth={2.5} aria-hidden /> : null}
        </span>
        <span className="block truncate text-xs text-fg-muted">{ws.description || `/w/${ws.slug}`}</span>
        {counts ? (
          <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] tabular-nums text-fg-subtle">
            <span>{t('open', { count: counts.open })}</span>
            {counts.overdue ? (
              <>
                <span aria-hidden>·</span>
                <span className="font-medium text-danger">{t('overdue', { count: counts.overdue })}</span>
              </>
            ) : null}
          </span>
        ) : null}
      </span>
      {/* G y su número: el atajo para ir a este espacio (los primeros nueve) */}
      {index < 9 ? (
        <span className="flex shrink-0 gap-0.5" aria-hidden>
          <Kbd>G</Kbd>
          <Kbd>{index + 1}</Kbd>
        </span>
      ) : null}
    </MenuLinkItem>
  )
}
