import { Bot, FileDown, FileText, Mic } from 'lucide-react'
import type { DocSource } from '@/lib/database.types'
import { cn } from '@/lib/utils'

/** Monograma del espacio: una o dos letras sobre una baldosa del color del espacio. */
export function monogramOf(ws: { icon?: string | null; name: string }) {
  const icon = ws.icon?.trim() ?? ''
  if (icon && /^[\p{L}\p{N}]{1,2}$/u.test(icon)) return icon.toUpperCase()
  return (ws.name.trim()[0] ?? 'V').toUpperCase()
}

export function WorkspaceMark({
  ws,
  size = 16,
  className,
}: {
  ws: { icon?: string | null; name: string; color: string }
  size?: number
  className?: string
}) {
  const text = monogramOf(ws)
  return (
    <span
      aria-hidden
      className={cn(`ws-${ws.color}`, 'inline-flex shrink-0 select-none items-center justify-center font-semibold leading-none', className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.31),
        background: 'var(--ws-color)',
        color: 'var(--ws-on)',
        fontSize: Math.max(8, Math.round(size * (text.length > 1 ? 0.42 : 0.56))),
        letterSpacing: text.length > 1 ? '-0.02em' : undefined,
      }}
    >
      {text}
    </span>
  )
}

const DOC_ICONS = { manual: FileText, meeting: Mic, claude: Bot, import: FileDown }

/** Ícono de doc según su origen (sin emojis). */
export function DocMark({ source, className }: { source: DocSource; className?: string }) {
  const Icon = DOC_ICONS[source] ?? FileText
  return (
    <Icon
      aria-hidden
      className={cn(
        'size-4 shrink-0',
        source === 'meeting' ? 'text-mandarina' : source === 'claude' ? 'text-accent' : 'text-fg-subtle',
        className,
      )}
    />
  )
}
