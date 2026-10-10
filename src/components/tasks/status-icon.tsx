import type { TaskStatus, TaskPriority } from '@/lib/database.types'
import { cn } from '@/lib/utils'

/** Iconos de estado: círculo que se llena según el avance (estilo Linear). */
export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const base = cn('size-3.5 shrink-0', className)
  switch (status) {
    case 'backlog':
      return (
        <svg viewBox="0 0 14 14" className={cn(base, 'text-st-backlog')} aria-hidden>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 2" />
        </svg>
      )
    case 'todo':
      return (
        <svg viewBox="0 0 14 14" className={cn(base, 'text-st-todo')} aria-hidden>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'in_progress':
      return (
        <svg viewBox="0 0 14 14" className={cn(base, 'text-st-progress')} aria-hidden>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 3.5A3.5 3.5 0 0 1 7 10.5Z" fill="currentColor" />
        </svg>
      )
    case 'blocked':
      return (
        <svg viewBox="0 0 14 14" className={cn(base, 'text-st-blocked')} aria-hidden>
          <circle cx="7" cy="7" r="6.25" fill="currentColor" />
          <path d="M4.5 7h5" stroke="var(--panel)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    case 'done':
      return (
        <svg viewBox="0 0 14 14" className={cn(base, 'text-st-done')} aria-hidden>
          <circle cx="7" cy="7" r="6.25" fill="currentColor" />
          <path d="m4.4 7.2 1.8 1.8 3.5-3.7" fill="none" stroke="var(--panel)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
  }
}

export function PriorityIcon({ priority, className }: { priority: TaskPriority; className?: string }) {
  const base = cn('size-3.5 shrink-0', className)
  if (priority === 'none') {
    return (
      <svg viewBox="0 0 14 14" className={cn(base, 'text-fg-subtle')} aria-hidden>
        <path d="M3 7h1.5M6.25 7h1.5M9.5 7H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (priority === 'urgent') {
    return (
      <svg viewBox="0 0 14 14" className={cn(base, 'text-pr-urgent')} aria-hidden>
        <rect x="1" y="1" width="12" height="12" rx="3" fill="currentColor" />
        <path d="M7 4v3.6" stroke="var(--panel)" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="7" cy="10" r="0.95" fill="var(--panel)" />
      </svg>
    )
  }
  const level = priority === 'high' ? 3 : priority === 'medium' ? 2 : 1
  return (
    <svg viewBox="0 0 14 14" className={cn(base, priority === 'high' ? 'text-pr-high' : 'text-fg-muted')} aria-hidden>
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={2 + i * 3.6}
          y={9 - i * 2.6}
          width="2.4"
          height={3 + i * 2.6}
          rx="0.8"
          fill="currentColor"
          opacity={i < level ? 1 : 0.25}
        />
      ))}
    </svg>
  )
}
