'use client'

import { useState } from 'react'
import { Bot, FileDown, FileText, Mic } from 'lucide-react'
import type { DocSource } from '@/lib/database.types'
import { cn } from '@/lib/utils'

/**
 * La imagen del logo de una cuenta o un espacio, por el puente de la API (lleva la sesión). La URL
 * cambia con cada logo nuevo (?v=…), así el navegador puede guardarla para siempre.
 */
export function logoUrl(kind: 'account' | 'workspace', id: string, version: string) {
  return `/api/veltro/v1/${kind === 'account' ? 'accounts' : 'workspaces'}/${id}/logo?v=${encodeURIComponent(version)}`
}

/**
 * Un logo en su baldosa. La imagen ya viene cuadrada y con su aire (se prepara al subirla), así que va
 * de borde a borde; el fondo es claro también en modo oscuro: un logo oscuro y transparente no se pierde.
 */
function LogoTile({ src, size, radius, className, onError }: { src: string; size: number; radius: number; className?: string; onError: () => void }) {
  return (
    <span
      aria-hidden
      className={cn('logo-tile inline-flex shrink-0 select-none items-center justify-center overflow-hidden', className)}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false} onError={onError} className="size-full object-contain" />
    </span>
  )
}

/**
 * El logo de la cuenta si tiene; si no (o no carga), lo que se pase como `fallback` (su inicial con
 * el estilo de cada lugar).
 */
export function AccountLogo({
  account,
  size,
  className,
  fallback,
}: {
  account: { id: string; logo_updated_at?: string | null }
  size: number
  className?: string
  fallback: React.ReactNode
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const v = account.logo_updated_at
  if (!v || failed === v) return <>{fallback}</>
  return <LogoTile src={logoUrl('account', account.id, v)} size={size} radius={Math.round(size * 0.3)} className={className} onError={() => setFailed(v)} />
}

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
  ws: { id?: string; icon?: string | null; name: string; color: string; logo_updated_at?: string | null }
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const text = monogramOf(ws)
  // con logo, el logo (si no carga, el monograma de siempre)
  const v = ws.logo_updated_at
  if (ws.id && v && failed !== v) {
    return <LogoTile src={logoUrl('workspace', ws.id, v)} size={size} radius={Math.round(size * 0.31)} className={className} onError={() => setFailed(v)} />
  }
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
