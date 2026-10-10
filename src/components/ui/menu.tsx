'use client'

import { Menu as M } from '@base-ui/react/menu'
import { Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export const popupClass =
  'popup-motion min-w-48 rounded-lg border border-line bg-panel p-1 text-sm text-fg shadow-popover outline-none'

export const itemClass =
  'flex h-8 cursor-default select-none items-center gap-2 rounded-sm px-2 text-sm text-fg outline-none data-[highlighted]:bg-hover data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-muted'

export const Menu = M.Root
export const MenuTrigger = M.Trigger
export const MenuGroup = M.Group
export const MenuRadioGroup = M.RadioGroup
export const MenuSubmenu = M.SubmenuRoot

export function MenuContent({
  className,
  children,
  align = 'start',
  side = 'bottom',
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof M.Popup> & {
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
  sideOffset?: number
}) {
  return (
    <M.Portal>
      <M.Positioner className="z-50 outline-none" align={align} side={side} sideOffset={sideOffset}>
        <M.Popup className={cn(popupClass, className)} {...props}>
          {children}
        </M.Popup>
      </M.Positioner>
    </M.Portal>
  )
}

export function MenuItem({
  className,
  danger,
  ...props
}: React.ComponentProps<typeof M.Item> & { danger?: boolean }) {
  return (
    <M.Item
      className={cn(itemClass, danger && 'text-danger [&_svg]:text-danger data-[highlighted]:bg-danger-soft', className)}
      {...props}
    />
  )
}

export function MenuLinkItem({ className, ...props }: React.ComponentProps<typeof M.LinkItem>) {
  return <M.LinkItem className={cn(itemClass, className)} {...props} />
}

export function MenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem className={cn(itemClass, 'pr-7', className)} {...props}>
      {children}
      <M.RadioItemIndicator className="absolute right-2 flex">
        <Check className="!size-3.5 !text-fg" />
      </M.RadioItemIndicator>
    </M.RadioItem>
  )
}

export function MenuCheckboxItem({ className, children, ...props }: React.ComponentProps<typeof M.CheckboxItem>) {
  return (
    <M.CheckboxItem className={cn(itemClass, 'relative pr-7', className)} {...props}>
      {children}
      <M.CheckboxItemIndicator className="absolute right-2 flex">
        <Check className="!size-3.5 !text-fg" />
      </M.CheckboxItemIndicator>
    </M.CheckboxItem>
  )
}

export function MenuSeparator({ className }: { className?: string }) {
  return <M.Separator className={cn('-mx-1 my-1 h-px bg-line', className)} />
}

/** Título de sección dentro de un menú (no requiere Menu.Group). */
export function MenuLabel({ className, ...props }: React.ComponentProps<'div'>) {
  return <div role="presentation" className={cn('select-none px-2 pb-1 pt-1.5 text-2xs font-medium text-fg-subtle', className)} {...props} />
}

export function MenuSubmenuTrigger({ className, children, ...props }: React.ComponentProps<typeof M.SubmenuTrigger>) {
  return (
    <M.SubmenuTrigger className={cn(itemClass, 'data-[popup-open]:bg-hover', className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" />
    </M.SubmenuTrigger>
  )
}

export function MenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('ml-auto pl-4 text-xs text-fg-subtle', className)} {...props} />
}
