'use client'

import { Switch as S } from '@base-ui/react/switch'
import { Checkbox as C } from '@base-ui/react/checkbox'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Interruptor para opciones de sí o no (en lugar de la casilla nativa). */
export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-line-strong p-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid/40 data-[checked]:bg-accent data-[disabled]:cursor-default data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <S.Thumb className="size-4 rounded-full bg-panel shadow-card transition-transform duration-200 ease-out data-[checked]:translate-x-4" />
    </S.Root>
  )
}

/** Casilla para marcar varias cosas de una lista. */
export function Checkbox({ className, ...props }: React.ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        'flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-line-strong bg-panel outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid/40 data-[checked]:border-accent data-[checked]:bg-accent data-[disabled]:cursor-default data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <C.Indicator className="flex text-accent-fg">
        <Check className="size-3" strokeWidth={3} />
      </C.Indicator>
    </C.Root>
  )
}
