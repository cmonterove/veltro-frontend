'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CalendarDays, Check, FileUp, ImagePlus, UserPlus, type LucideIcon } from 'lucide-react'
import { canEdit, useApp, useIsAccountAdmin } from '@/components/app/app-context'
import { GoogleConnectButton } from '@/components/calendar/connect-calendar'
import { InviteDialog } from '@/components/settings/members-settings'
import { Button, buttonVariants } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useLocalStorage } from '@/lib/hooks'
import { useWorkspaceMembersState } from '@/lib/queries/workspace-members'
import { cn } from '@/lib/utils'
import type { TaskRow } from '@/lib/database.types'
import type { WorkspaceWithRole } from '@/lib/types'

type StepKey = 'invite' | 'tasks' | 'logo' | 'calendar'
type Step = { key: StepKey; done: boolean }

const ICON: Record<StepKey, LucideIcon> = { invite: UserPlus, tasks: FileUp, logo: ImagePlus, calendar: CalendarDays }
const DAY = 86_400_000
/** Las tareas de la plantilla se crean en los segundos siguientes al espacio: las propias llegan después (aunque se importen enseguida). */
const TEMPLATE_WINDOW = 60_000

/**
 * Para arrancar un espacio nuevo: los pasos que lo ponen a andar (su gente, sus tareas, su logo y el
 * calendario), cada uno marcado según lo que de verdad ya pasó. Sin «agendar una reunión»: eso ya lo
 * ofrece «Próxima reunión», al lado. Solo en su primer mes, para quien puede hacerlos; se va solo
 * cuando está todo o cuando se oculta.
 */
export function useSpaceStarter(ws: WorkspaceWithRole, tasks: TaskRow[] | undefined, now: Date) {
  const { google, googleConfigured } = useApp()
  const canInvite = useIsAccountAdmin()
  const { members, loaded } = useWorkspaceMembersState(ws.id)
  const [hidden, setHidden] = useLocalStorage(`veltro:space-starter-hidden:${ws.id}`, false)

  if (!tasks || !loaded || hidden || !canEdit(ws)) return null
  const born = Date.parse(ws.created_at)
  if (now.getTime() - born > 30 * DAY) return null

  const steps: Step[] = []
  if (canInvite) steps.push({ key: 'invite', done: members.length > 1 })
  steps.push({ key: 'tasks', done: tasks.some((x) => Date.parse(x.created_at) - born > TEMPLATE_WINDOW) })
  if (ws.my_role === 'admin') steps.push({ key: 'logo', done: Boolean(ws.logo_updated_at) })
  if (googleConfigured) steps.push({ key: 'calendar', done: Boolean(google) })
  if (steps.every((s) => s.done)) return null
  return { steps, people: members.length, googleEmail: google?.email ?? '', hide: () => setHidden(true) }
}

export type SpaceStarterModel = NonNullable<ReturnType<typeof useSpaceStarter>>

export function SpaceStarter({ ws, model }: { ws: WorkspaceWithRole; model: SpaceStarterModel }) {
  const t = useTranslations('workspace.starter')
  const { accountRole } = useApp()
  const [inviting, setInviting] = useState(false)
  const done = model.steps.filter((s) => s.done).length
  const button = buttonVariants({ variant: 'secondary', size: 'sm' })

  const action = (key: StepKey) => {
    if (key === 'invite')
      return (
        <Button variant="secondary" size="sm" onClick={() => setInviting(true)}>
          {t('invite.cta')}
        </Button>
      )
    // en Tareas se abre el importador (Excel, CSV o Trello); desde ahí también se crean a mano
    if (key === 'tasks')
      return (
        <Link href={`/w/${ws.slug}/tasks?import=1`} className={button}>
          {t('tasks.cta')}
        </Link>
      )
    if (key === 'logo')
      return (
        <Link href={`/settings/workspaces/${ws.slug}`} className={button}>
          {t('logo.cta')}
        </Link>
      )
    return <GoogleConnectButton returnTo={`/w/${ws.slug}`} size="sm" label={t('calendar.cta')} />
  }

  const doneHint = (key: StepKey) =>
    key === 'invite' ? t('invite.done', { count: model.people }) : key === 'calendar' ? t('calendar.done', { email: model.googleEmail }) : t(`${key}.done`)

  return (
    <section
      className={cn(`ws-${ws.color}`, 'shrink-0 border-b border-line-soft px-5 py-4 sm:px-6')}
      style={{ background: 'color-mix(in oklch, var(--ws-color) 6%, var(--panel))' }}
    >
      <div className="flex items-center gap-3">
        <h2 className="text-[13px] font-semibold text-fg">{t('title')}</h2>
        {/* cada rayita es un paso: al pasar el cursor dice cuál y si ya está */}
        <span className="flex items-center">
          {model.steps.map((s) => (
            <Tooltip key={s.key} content={`${t(`${s.key}.title`)} · ${s.done ? t('stepDone') : t('stepPending')}`} side="top">
              <span className="flex cursor-default items-center px-0.5 py-1.5">
                <span className={cn('h-1.5 w-4 rounded-full transition-colors duration-300', s.done ? 'bg-success' : 'bg-fg/10')} />
              </span>
            </Tooltip>
          ))}
        </span>
        <span className="text-xs tabular-nums text-fg-muted">{t('progress', { done, total: model.steps.length })}</span>
        <button type="button" onClick={model.hide} className="ml-auto rounded-md px-1.5 py-0.5 text-xs text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid">
          {t('hide')}
        </button>
      </div>
      <ul className="mt-3 grid gap-2 xl:grid-cols-2">
        {model.steps.map((s) => {
          const Icon = ICON[s.key]
          return (
            <li
              key={s.key}
              className={cn('flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 ring-1', s.done ? 'ring-inset ring-line-soft' : 'bg-panel shadow-card ring-line-soft')}
            >
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', s.done ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent-ink')}>
                {s.done ? <Check className="size-4" strokeWidth={2.5} /> : <Icon className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-[13px] font-medium', s.done ? 'text-fg-muted' : 'text-fg')}>{t(`${s.key}.title`)}</span>
                {/* la pista entera (hasta dos líneas): cortada a la mitad no ayuda */}
                <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-fg-muted">{s.done ? doneHint(s.key) : t(`${s.key}.hint`)}</span>
              </span>
              {s.done ? null : <span className="shrink-0">{action(s.key)}</span>}
            </li>
          )
        })}
      </ul>
      {model.steps.some((s) => s.key === 'invite') ? <InviteDialog open={inviting} onOpenChange={setInviting} canPromote={accountRole === 'owner'} initialWorkspaceId={ws.id} /> : null}
    </section>
  )
}
