'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Settings, UserPlus } from 'lucide-react'
import { useApp, useIsAccountAdmin } from '@/components/app/app-context'
import { InviteDialog } from '@/components/settings/members-settings'
import { cn } from '@/lib/utils'
import { WorkspaceMark } from '@/components/app/marks'
import { Avatar } from '@/components/ui/avatar'
import { Tooltip } from '@/components/ui/tooltip'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import type { WorkspaceWithRole } from '@/lib/types'

export type SpaceSection = 'overview' | 'tasks' | 'docs' | 'meetings'

/**
 * La cabecera de cada sección del espacio, sobre el fondo de la página. Sin franja, sin pestañas y sin
 * menú: las secciones (Resumen · Tareas · Docs · Reuniones) están en la barra lateral, debajo del
 * espacio. A la izquierda el logo, el espacio (lleva al Resumen) y el título fijo de la sección; a la
 * derecha su gente y lo de esa sección.
 */
export function SpaceHeader({
  ws,
  section,
  actions,
  className,
}: {
  ws: WorkspaceWithRole
  section: SpaceSection
  /** lo propio de la sección (p. ej. «Nueva tarea»), al final de la fila */
  actions?: React.ReactNode
  className?: string
}) {
  const t = useTranslations('workspace')
  const { accountRole } = useApp()
  const canInvite = useIsAccountAdmin()
  const [inviting, setInviting] = useState(false)
  const people = useWorkspaceMembers(ws.id)
  const base = `/w/${ws.slug}`

  const title = { overview: t('summary'), tasks: t('tasks'), docs: t('docs'), meetings: t('meetings') }[section]
  const shown = people.slice(0, 4)
  const extra = people.length - shown.length

  return (
    <header className={cn('flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3', className)}>
      <div className="flex min-w-0 items-center gap-3">
        <Link href={base} aria-label={ws.name} className="shrink-0 rounded-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent-mid/50">
          <WorkspaceMark ws={ws} size={40} className="shadow-[0_8px_18px_-12px_oklch(0.3_0.09_312/0.55)]" />
        </Link>
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] leading-tight text-fg-muted">
            <Link href={base} className="shrink-0 font-medium outline-none hover:text-fg focus-visible:underline">
              {ws.name}
            </Link>
            {ws.description ? (
              <>
                <span aria-hidden className="text-fg-subtle">
                  ·
                </span>
                <span className="truncate">{ws.description}</span>
              </>
            ) : null}
          </p>
          {/* el título fijo de la sección: para cambiar de sección, la barra lateral */}
          <h1 className="mt-0.5 truncate text-[22px] font-semibold leading-tight tracking-[-0.022em] text-fg">{title}</h1>
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {/* su gente, de un vistazo */}
        {people.length ? (
          <Tooltip content={people.map((m) => m.full_name).join(', ')}>
            <span className="mr-1 hidden -space-x-1.5 md:flex">
              {shown.map((m) => (
                <Avatar key={m.id} name={m.full_name} src={m.avatar_url} seed={m.id} size={26} className="ring-2 ring-canvas" />
              ))}
              {extra > 0 ? (
                <span className="relative inline-flex size-[26px] items-center justify-center rounded-full bg-fg/[0.07] text-[10.5px] font-semibold tabular-nums text-fg-muted ring-2 ring-canvas">
                  +{extra}
                </span>
              ) : null}
            </span>
          </Tooltip>
        ) : null}
        {/* invitar a este espacio: entra como invitado (solo este espacio y su gente) */}
        {canInvite ? (
          <Tooltip content={t('invite')}>
            <button
              type="button"
              onClick={() => setInviting(true)}
              aria-label={t('invite')}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-lg text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid/40',
                actions ? 'w-8 justify-center text-fg-muted hover:bg-hover hover:text-fg' : 'bg-panel px-2.5 text-fg shadow-card hover:bg-hover',
              )}
            >
              <UserPlus className="size-4" />
              {actions ? null : t('invite')}
            </button>
          </Tooltip>
        ) : null}
        {ws.my_role === 'admin' ? (
          <Tooltip content={t('settings')}>
            <Link
              href={`/settings/workspaces/${ws.slug}`}
              aria-label={t('settings')}
              className="inline-flex size-8 items-center justify-center rounded-lg text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/40"
            >
              <Settings className="size-4" />
            </Link>
          </Tooltip>
        ) : null}
        {actions ? (
          <>
            <span className="mx-1.5 h-6 w-px bg-line" aria-hidden />
            {actions}
          </>
        ) : null}
      </div>
      {canInvite ? <InviteDialog open={inviting} onOpenChange={setInviting} canPromote={accountRole === 'owner'} initialWorkspaceId={ws.id} /> : null}
    </header>
  )
}
