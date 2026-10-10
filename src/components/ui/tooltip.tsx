'use client'

import { Tooltip as T } from '@base-ui/react/tooltip'
import { cn } from '@/lib/utils'
import { Kbd } from './kbd'

export function Tooltip({
  content,
  shortcut,
  side = 'bottom',
  children,
}: {
  content: React.ReactNode
  shortcut?: string[]
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: React.ReactElement<Record<string, unknown>>
}) {
  return (
    <T.Root>
      <T.Trigger render={children} />
      <T.Portal>
        <T.Positioner side={side} sideOffset={6} className="z-[60]">
          <T.Popup
            className={cn(
              'popup-motion flex items-center gap-2 rounded-md bg-fg px-2 py-1 text-xs font-medium text-canvas shadow-popover',
            )}
          >
            {content}
            {shortcut ? (
              <span className="flex gap-0.5">
                {shortcut.map((k) => (
                  <Kbd key={k} className="border-transparent bg-canvas/15 text-canvas/80">
                    {k}
                  </Kbd>
                ))}
              </span>
            ) : null}
          </T.Popup>
        </T.Positioner>
      </T.Portal>
    </T.Root>
  )
}
