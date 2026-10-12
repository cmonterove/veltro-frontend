'use client'

// Select propio (Base UI). Regla del proyecto: nunca <select> nativo.

import { Select as S } from '@base-ui/react/select'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { itemClass, popupClass } from './menu'

export type SelectOption<V extends string = string> = {
  value: V
  label: string
  /** ícono o marca a la izquierda (también se muestra en el disparador) */
  icon?: React.ReactNode
  /** texto secundario a la derecha dentro de la lista */
  hint?: string
}

export function Select<V extends string = string>({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  id,
  className,
  popupClassName,
  'aria-label': ariaLabel,
}: {
  value: V
  onChange: (value: V) => void
  options: SelectOption<V>[]
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
  popupClassName?: string
  'aria-label'?: string
}) {
  const current = options.find((o) => o.value === value)
  return (
    <S.Root
      value={value}
      onValueChange={(v) => {
        if (v != null) onChange(v as V)
      }}
      disabled={disabled}
      items={options.map((o) => ({ value: o.value, label: o.label }))}
    >
      <S.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-line bg-canvas px-2.5 text-left text-sm text-fg outline-none transition-colors',
          'hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20 data-[popup-open]:border-accent',
          'data-[disabled]:cursor-default data-[disabled]:opacity-60 data-[disabled]:hover:border-line',
          className,
        )}
      >
        {current?.icon ? <span className="flex shrink-0 items-center [&_svg]:size-4">{current.icon}</span> : null}
        <S.Value className="min-w-0 flex-1 truncate data-[placeholder]:text-fg-subtle" placeholder={placeholder} />
        <S.Icon className="shrink-0 text-fg-subtle">
          <ChevronsUpDown className="size-3.5" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Positioner className="z-50 outline-none" sideOffset={6} alignItemWithTrigger={false}>
          <S.Popup className={cn(popupClass, 'max-h-[min(360px,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto scrollbar-thin', popupClassName)}>
            {options.map((o) => (
              <S.Item key={o.value} value={o.value} className={cn(itemClass, 'relative pr-8 data-[selected]:font-medium')}>
                {o.icon ? <span className="flex shrink-0 items-center">{o.icon}</span> : null}
                <S.ItemText className="min-w-0 flex-1 truncate">{o.label}</S.ItemText>
                {o.hint ? <span className="shrink-0 text-xs text-fg-subtle">{o.hint}</span> : null}
                <S.ItemIndicator className="absolute right-2 flex items-center">
                  <Check className="size-4 !text-accent" />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Popup>
        </S.Positioner>
      </S.Portal>
    </S.Root>
  )
}
