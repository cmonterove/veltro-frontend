import { format } from 'date-fns'

export function formatDate(date: Date | string, pattern = 'PP'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, pattern)
}
