'use client'

import { useEffect, useState } from 'react'
import { File, FileImage, FileSpreadsheet, FileText, Link2, Presentation, type LucideIcon } from 'lucide-react'
import { attachmentPreviewUrl } from '@/lib/queries/attachments'
import type { AttachmentRow } from '@/lib/database.types'
import { cn } from '@/lib/utils'

export const FILE_KINDS = ['pdf', 'image', 'sheet', 'slides', 'doc', 'link', 'other'] as const
export type FileKind = (typeof FILE_KINDS)[number]

export const extOf = (name: string) => (name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '')

export function fileKindOf(a: Pick<AttachmentRow, 'kind' | 'mime_type' | 'name'>): FileKind {
  if (a.kind === 'link') return 'link'
  const mime = a.mime_type ?? ''
  const ext = extOf(a.name)
  if (mime.includes('pdf') || ext === 'pdf') return 'pdf'
  if (mime.startsWith('image/')) return 'image'
  if (mime.includes('sheet') || mime.includes('csv') || ['xlsx', 'xls', 'csv', 'numbers'].includes(ext)) return 'sheet'
  if (mime.includes('presentation') || ['ppt', 'pptx', 'key'].includes(ext)) return 'slides'
  if (mime.startsWith('text/') || mime.includes('word') || ['doc', 'docx', 'txt', 'md', 'rtf', 'log'].includes(ext)) return 'doc'
  return 'other'
}

/** Ícono y color de cada tipo; el color tiñe también el fondo de la vista previa. */
export const KIND_STYLE: Record<FileKind, { icon: LucideIcon; tone: string }> = {
  pdf: { icon: FileText, tone: 'text-danger' },
  image: { icon: FileImage, tone: 'text-accent' },
  sheet: { icon: FileSpreadsheet, tone: 'text-success' },
  slides: { icon: Presentation, tone: 'text-mandarina' },
  doc: { icon: FileText, tone: 'text-st-progress' },
  link: { icon: Link2, tone: 'text-accent-ink' },
  other: { icon: File, tone: 'text-fg-muted' },
}

export const fileTitle = (a: Pick<AttachmentRow, 'title' | 'name'>) => a.title?.trim() || a.name

export function FileKindIcon({ a, className }: { a: Pick<AttachmentRow, 'kind' | 'mime_type' | 'name'>; className?: string }) {
  const { icon: Icon, tone } = KIND_STYLE[fileKindOf(a)]
  return <Icon className={cn('size-4 shrink-0', tone, className)} aria-hidden />
}

/** URL para ver una imagen (en el demo es una data URL). */
export function useImageUrl(a: Pick<AttachmentRow, 'kind' | 'mime_type' | 'storage_path'> | null) {
  const [src, setSrc] = useState<{ path: string; url: string | null } | null>(null)
  const path = a && a.kind === 'file' && a.mime_type?.startsWith('image/') ? a.storage_path : null
  // depende de la ruta, no del objeto: así un refresco de la lista no vuelve a firmar ni parpadea
  useEffect(() => {
    if (!path) return
    let alive = true
    attachmentPreviewUrl({ storage_path: path } as AttachmentRow).then((url) => alive && setSrc({ path, url }))
    return () => {
      alive = false
    }
  }, [path])
  return path && src?.path === path ? src.url : null
}

export function safeHost(url: string | null) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : ''
  } catch {
    return ''
  }
}

/**
 * Vista previa de un archivo: la imagen si es una foto; si no, el ícono del tipo y la extensión sobre un
 * fondo teñido con el color del tipo, para reconocerlo de un vistazo en la grilla.
 */
export function FilePreview({ a, className, large }: { a: AttachmentRow; className?: string; large?: boolean }) {
  const kind = fileKindOf(a)
  const { icon: Icon, tone } = KIND_STYLE[kind]
  const src = useImageUrl(a)
  const label = kind === 'link' ? safeHost(a.url) : extOf(a.name).toUpperCase()
  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden', tone, '[background:color-mix(in_oklch,currentColor_8%,var(--panel))]', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <Icon className={large ? 'size-12' : 'size-8'} strokeWidth={1.5} aria-hidden />
          {label ? <span className={cn('max-w-40 truncate font-mono font-semibold tracking-wide', large ? 'text-xs' : 'text-2xs')}>{label}</span> : null}
        </div>
      )}
    </div>
  )
}
