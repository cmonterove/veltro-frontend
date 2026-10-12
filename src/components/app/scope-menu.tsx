'use client'

import { useTranslations } from 'next-intl'
import { Building2, ChevronDown, Network, UserRound, Users } from 'lucide-react'
import { useApp, useMemberMap } from './app-context'
import { Avatar } from '@/components/ui/avatar'
import { Menu, MenuContent, MenuGroup, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ScopeOption } from '@/lib/scope'

const ICONS = { me: UserRound, team: Users, all: Building2, dept: Network } as const

function ScopeIcon({ option, size = 16 }: { option: ScopeOption; size?: number }) {
  const memberMap = useMemberMap()
  if (option.kind === 'person') {
    const m = memberMap.get([...option.userIds][0])
    return <Avatar name={option.label} seed={m?.id} src={m?.avatar_url} size={size} />
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
}: {
  options: ScopeOption[]
  value: ScopeOption
  onChange: (id: string) => void
  triggerClassName?: string
}) {
  const t = useTranslations('scope')
  if (options.length <= 1) return null
  const groups = [
    { id: 'main', label: null, items: options.filter((o) => o.kind === 'me' || o.kind === 'team' || o.kind === 'all') },
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
        <ScopeIcon option={value} />
        <span className="max-w-56 truncate">{value.display}</span>
        <ChevronDown className="size-3.5 text-fg-subtle" />
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
  if (scope.kind === 'me' || scope.kind === 'person') return null
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
