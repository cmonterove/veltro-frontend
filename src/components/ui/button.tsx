import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Spinner } from './spinner'

export const buttonVariants = cva(
  'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background-color,color,box-shadow,opacity] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:bg-accent-hover active:opacity-90',
        secondary: 'bg-panel text-fg shadow-card hover:bg-hover active:bg-active',
        ghost: 'text-fg-muted hover:bg-hover hover:text-fg active:bg-active data-[popup-open]:bg-hover data-[popup-open]:text-fg',
        subtle: 'bg-hover text-fg hover:bg-active',
        danger: 'bg-danger text-white hover:opacity-90',
        'danger-ghost': 'text-danger hover:bg-danger-soft',
        link: 'h-auto px-0 text-accent-ink underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-6 px-1.5 text-xs [&_svg]:size-3.5',
        sm: 'h-7 px-2 text-sm [&_svg]:size-4',
        md: 'h-8 px-3 text-sm [&_svg]:size-4',
        lg: 'h-10 px-4 text-base [&_svg]:size-4',
        icon: 'size-8 [&_svg]:size-4',
        'icon-sm': 'size-7 [&_svg]:size-4',
        'icon-xs': 'size-6 rounded-sm [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { loading?: boolean }

export function Button({ className, variant, size, loading, disabled, children, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-3.5" /> : null}
      {children}
    </button>
  )
}
