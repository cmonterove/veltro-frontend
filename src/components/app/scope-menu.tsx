'use client'

import { useTranslations } from 'next-intl'
import { Building2, ChevronDown, Eye, Forward, Network, UserRound, Users, UsersRound } from 'lucide-react'
import { useApp, useMemberMap } from './app-context'
import { Avatar } from '@/components/ui/avatar'
import { Menu, MenuContent, MenuGroup, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ScopeOption } from '@/lib/scope'

const ICONS = { me: UserRound, delegated: Forward, following: Eye, team: Users, all: Building2, group: UsersRound, dept: Network } as const

function ScopeIcon({ option, size = 16 }: { option: ScopeOption; size?: number }) {
  const memberMap = useMemberMap()
  if (option.kind === 'person') {
    const m = memberMap.get([...option.userIds][0])
    return <Avatar name={option.label} seed={m?.id} src={m?.avatar_url} size={size} />
  }
  if (option.kind === 'group') {
    // el equipo, con su color
    return (
      <span
        className={cn('ws-' + (option.color ?? 'violet'), 'flex shrink-0 items-center justify-center rounded-[5px]')}
        style={{ width: size, height: size, background: 'var(--ws-color)', color: 'var(--ws-on)' }}
      >
        <UsersRound style={{ width: size - 6, height: size - 6 }} />
      </span>
    )
  }
  const Icon = ICONS[option.kind]
  return <Icon className="shrink-0 text-fg-muted" style={{ width: size - 2, height: size - 2 }} />
}

/**
 * De quién son las tareas que se miran (Pulso y Mis tareas). Cada opción dice su tipo y quiénes
 * entran, para que "Comercial" se lea como "Departamento Comercial: Ana, Pepito y Lucía".
 */
export function ScopeMenu({
  options,
  value,
  onChange,
  triggerClassName,
  trigger,
}: {
  options: ScopeOption[]
  value: ScopeOption
  onChange: (id: string) => void
  triggerClassName?: string
  /** lo que va en el botón (por defecto: el ícono y el nombre del alcance actual) */
  trigger?: React.ReactNode
}) {
  const t = useTranslations('scope')
  if (options.length <= 1) return null
  const groups = [
    { id: 'main', label: null, items: options.filter((o) => o.kind === 'me' || o.kind === 'delegated' || o.kind === 'following' || o.kind === 'team' || o.kind === 'all') },
    { id: 'group', label: t('groups'), items: options.filter((o) => o.kind === 'group') },
    { id: 'dept', label: t('departments'), items: options.filter((o) => o.kind === 'dept') },
    { id: 'person', label: t('people'), items: options.filter((o) => o.kind === 'person') },
  ].filter((g) => g.items.length)

  return (
    <Menu>
      <MenuTrigger
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-lg bg-hover px-2.5 text-sm font-medium text-fg transition-colors hover:bg-active data-[popup-open]:bg-active',
          triggerClassName,
        )}
      >
        {trigger ?? (
          <>
            <ScopeIcon option={value} />
            <span className="max-w-56 truncate">{value.display}</span>
            <ChevronDown className="size-3.5 text-fg-subtle" />
          </>
        )}
      </MenuTrigger>
      <MenuContent align="start" className="max-h-[70vh] w-80 overflow-y-auto">
        <MenuRadioGroup value={value.id} onValueChange={(v) => onChange(String(v))}>
          {groups.map((g, i) => (
            <MenuGroup key={g.id}>
              {i > 0 ? <MenuSeparator /> : null}
              {g.label ? <MenuLabel>{g.label}</MenuLabel> : null}
              {g.items.map((o) => (
                <MenuRadioItem key={o.id} value={o.id} closeOnClick className="h-auto items-start py-1.5">
                  <span className="mt-0.5 flex">
                    <ScopeIcon option={o} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{o.label}</span>
                    {o.hint ? <span className="truncate text-2xs text-fg-subtle">{o.hint}</span> : null}
                  </span>
                </MenuRadioItem>
              ))}
            </MenuGroup>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}

/** Caras de quienes entran en un equipo o departamento; al pasar el mouse, sus nombres. */
export function ScopePeople({ scope, max = 4 }: { scope: ScopeOption; max?: number }) {
  const { user } = useApp()
  const memberMap = useMemberMap()
  if (scope.kind === 'me' || scope.kind === 'person' || scope.kind === 'delegated' || scope.kind === 'following') return null
  const people = [...scope.userIds].filter((id) => id !== user.id).flatMap((id) => memberMap.get(id) ?? [])
  if (!people.length) return null
  return (
    <Tooltip content={scope.hint}>
      <span className="inline-flex items-center" tabIndex={0} aria-label={scope.hint}>
        <span className="flex -space-x-1.5">
          {people.slice(0, max).map((m) => (
            <Avatar key={m.id} name={m.full_name} seed={m.id} src={m.avatar_url} size={22} className="ring-2 ring-canvas" />
          ))}
        </span>
        {people.length > max ? <span className="ml-1.5 text-xs text-fg-subtle">+{people.length - max}</span> : null}
      </span>
    </Tooltip>
  )
}

const chipClass = (active: boolean) =>
  cn(
    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent-mid/40 [&_svg]:size-3.5',
    active ? 'border-transparent bg-accent text-accent-fg [&_svg]:!text-accent-fg' : 'border-line text-fg-muted hover:bg-hover hover:text-fg',
  )

/**
 * El alcance a la vista (Tareas): fichas para lo de todos los días (Mías, Delegadas, Siguiendo, Mi
 * equipo y los primeros equipos de trabajo) y un «Más» con el resto (toda la empresa, departamentos,
 * personas). Lo elegido en «Más» se ve en esa misma ficha.
 */
export function ScopeChips({ options, value, onChange }: { options: ScopeOption[]; value: ScopeOption; onChange: (id: string) => void }) {
  const t = useTranslations('scope')
  const daily = options.filter((o) => o.kind === 'me' || o.kind === 'delegated' || o.kind === 'following' || o.kind === 'team')
  const first = [...daily, ...options.filter((o) => o.kind === 'group').slice(0, 3)]
  const left = options.filter((o) => !first.includes(o))
  // si queda una sola, va como ficha (un menú de una opción no tiene sentido)
  const chips = left.length === 1 ? [...first, ...left] : first
  const rest = left.length === 1 ? [] : left
  const inRest = rest.find((o) => o.id === value.id)
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t('label')}>
      {chips.map((o) => (
        <Tooltip key={o.id} content={o.hint}>
          <button type="button" role="radio" aria-checked={o.id === value.id} onClick={() => onChange(o.id)} className={chipClass(o.id === value.id)}>
            <ScopeIcon option={o} size={14} />
            <span className="max-w-40 truncate">{o.kind === 'team' ? t('teamShort') : o.label}</span>
          </button>
        </Tooltip>
      ))}
      {rest.length ? (
        <ScopeMenu
          options={rest}
          value={inRest ?? value}
          onChange={onChange}
          triggerClassName={cn(chipClass(Boolean(inRest)), 'bg-transparent hover:bg-hover', inRest && 'bg-accent hover:bg-accent-hover')}
          trigger={
            <>
              {inRest ? <ScopeIcon option={inRest} size={14} /> : null}
              <span className="max-w-48 truncate">{inRest ? inRest.label : t('more')}</span>
              <ChevronDown className="opacity-70" />
            </>
          }
        />
      ) : null}
      <span className="ml-1">
        <ScopePeople scope={value} />
      </span>
    </div>
  )
}
