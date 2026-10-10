'use client'

import { Dialog as D } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

export function DialogContent({
  className,
  children,
  hideClose,
  ...props
}: React.ComponentProps<typeof D.Popup> & { hideClose?: boolean }) {
  return (
    <D.Portal>
      <D.Backdrop className="backdrop-motion fixed inset-0 z-50 bg-[oklch(0.2_0.01_165/0.32)] dark:bg-[oklch(0_0_0/0.55)]" />
      <D.Viewport className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[12vh]">
        <D.Popup
          className={cn(
            'popup-motion relative w-full max-w-lg rounded-xl border border-line bg-panel shadow-lift outline-none',
            className,
          )}
          {...props}
        >
          {children}
          {hideClose ? null : (
            <D.Close
              className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
              aria-label="Close"
            >
              <X className="size-4" />
            </D.Close>
          )}
        </D.Popup>
      </D.Viewport>
    </D.Portal>
  )
}

export function DialogHeader({ title, description }: { title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-5 pb-2 pt-5 pr-12">
      <D.Title className="text-md font-semibold text-fg">{title}</D.Title>
      {description ? <D.Description className="text-sm text-fg-muted">{description}</D.Description> : null}
    </div>
  )
}

export function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-5 py-3', className)} {...props} />
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex items-center justify-end gap-2 px-5 pb-5 pt-3', className)} {...props} />
}
