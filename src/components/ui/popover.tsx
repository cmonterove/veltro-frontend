'use client'

import { Popover as P } from '@base-ui/react/popover'
import { cn } from '@/lib/utils'

export const Popover = P.Root
export const PopoverTrigger = P.Trigger
export const PopoverClose = P.Close

export function PopoverContent({
  className,
  children,
  align = 'start',
  side = 'bottom',
  sideOffset = 6,
  initialFocus,
  ...props
}: React.ComponentProps<typeof P.Popup> & {
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
  sideOffset?: number
}) {
  return (
    <P.Portal>
      <P.Positioner className="z-50 outline-none" align={align} side={side} sideOffset={sideOffset}>
        <P.Popup
          initialFocus={initialFocus}
          className={cn(
            'popup-motion rounded-lg border border-line bg-panel text-sm text-fg shadow-popover outline-none',
            className,
          )}
          {...props}
        >
          {children}
        </P.Popup>
      </P.Positioner>
    </P.Portal>
  )
}
