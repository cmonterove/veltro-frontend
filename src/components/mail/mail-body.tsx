'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Download, Ellipsis, FileArchive, FileImage, FileSpreadsheet, FileText, File as FileIcon, ImageOff } from 'lucide-react'
import { formatBytes } from '@/components/attachments/attachments'
import { attachmentUrl, type ApiMailAttachment, type ApiMailMessage } from '@/lib/api/correo'
import { cn } from '@/lib/utils'
import { linkParts, prepareEmailHtml } from './mail-utils'

/**
 * El cuerpo de un correo. El HTML va en un iframe con sandbox (sin scripts, sin formularios, sin
 * navegar la página), alto a su contenido; las imágenes de afuera quedan apagadas hasta que la
 * persona las pide, y lo citado de respuestas anteriores se pliega («···»). Un correo de solo texto
 * se pinta como texto, con sus enlaces.
 */
export function MailBody({ box, message }: { box: string; message: ApiMailMessage }) {
  const t = useTranslations('mail')
  const [images, setImages] = useState(false)
  const [showQuote, setShowQuote] = useState(false)

  // las imágenes de dentro (src="cid:…") salen de sus adjuntos
  const cid = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of message.attachments) {
      if (!a.contentId) continue
      const url = a.data ? `data:${a.mimeType};base64,${a.data.replace(/-/g, '+').replace(/_/g, '/')}` : attachmentUrl(box, message.id, a, true)
      if (url) m.set(a.contentId, url)
    }
    return m
  }, [box, message])

  const prepared = useMemo(() => (message.html ? prepareEmailHtml(message.html, { images, cid, showQuote }) : null), [message.html, images, cid, showQuote])

  const quoteToggle = (
    <button
      type="button"
      onClick={() => setShowQuote((v) => !v)}
      aria-expanded={showQuote}
      title={showQuote ? t('hideQuote') : t('showQuote')}
      aria-label={showQuote ? t('hideQuote') : t('showQuote')}
      className="mt-1 inline-flex h-5 items-center rounded-md bg-hover px-1.5 text-fg-muted outline-none transition-colors hover:bg-active hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid"
    >
      <Ellipsis className="size-4" />
    </button>
  )

  if (!prepared) return <PlainBody text={message.text ?? message.snippet} showQuote={showQuote} toggle={quoteToggle} />

  return (
    <div>
      {prepared.hasRemoteImages && !images ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-hover px-3 py-2 text-xs text-fg-muted">
          <ImageOff className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{t('imagesHidden')}</span>
          <button type="button" onClick={() => setImages(true)} className="font-medium text-accent-ink outline-none hover:underline focus-visible:underline">
            {t('showImages')}
          </button>
        </div>
      ) : null}
      {/* el correo como lo armó quien lo manda: sobre blanco, también en el tema oscuro */}
      <div className="rounded-xl bg-[#ffffff] p-3 ring-1 ring-line-soft">
        <EmailFrame doc={prepared.doc} title={message.subject} />
      </div>
      {prepared.hasQuote ? quoteToggle : null}
    </div>
  )
}

function EmailFrame({ doc, title }: { doc: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(80)

  useEffect(() => {
    const frame = ref.current
    if (!frame) return
    let observer: ResizeObserver | null = null
    const fit = () => {
      const d = frame.contentDocument
      if (d?.documentElement) setHeight(Math.max(24, Math.ceil(d.documentElement.scrollHeight)))
    }
    const ready = () => {
      fit()
      observer?.disconnect()
      const body = frame.contentDocument?.body
      if (!body) return
      observer = new ResizeObserver(fit)
      observer.observe(body)
      frame.contentDocument?.querySelectorAll('img').forEach((img) => img.addEventListener('load', fit, { once: true }))
    }
    frame.addEventListener('load', ready)
    if (frame.contentDocument?.readyState === 'complete') ready()
    return () => {
      frame.removeEventListener('load', ready)
      observer?.disconnect()
    }
  }, [doc])

  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={doc}
      // sin allow-scripts: nada del correo corre; allow-same-origin solo para que carguen sus imágenes de adentro
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="block w-full border-0 bg-[#ffffff]"
      style={{ height }}
    />
  )
}

/** Un correo de solo texto: sus líneas y enlaces; lo citado («> …») plegado como en el HTML. */
function PlainBody({ text, showQuote, toggle }: { text: string; showQuote: boolean; toggle: React.ReactNode }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  // lo citado empieza en la primera línea «> » (y su encabezado «El … escribió:», si lo tiene)
  let cut = lines.findIndex((l) => /^\s*>/.test(l))
  if (cut > 0 && /:\s*$/.test(lines[cut - 1] ?? '')) cut -= 1
  const shown = cut >= 0 && !showQuote ? lines.slice(0, cut) : lines
  return (
    <div>
      <div className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-fg">
        {shown.map((l, i) => (
          <span key={i} className={cn(/^\s*>/.test(l) && 'text-fg-muted')}>
            {linkParts(l).map((p, j) =>
              p.href ? (
                <a key={j} href={p.href} target="_blank" rel="noopener noreferrer" className="text-accent-ink underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
                  {p.text}
                </a>
              ) : (
                p.text
              ),
            )}
            {i < shown.length - 1 ? '\n' : null}
          </span>
        ))}
      </div>
      {cut >= 0 ? toggle : null}
    </div>
  )
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return FileImage
  if (mime.includes('pdf') || mime.startsWith('text/') || mime.includes('word') || mime.includes('document')) return FileText
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return FileSpreadsheet
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar')) return FileArchive
  return FileIcon
}

/** Los adjuntos de un mensaje (sin las imágenes que ya se ven dentro del correo), para bajarlos. */
export function MailAttachments({ box, message }: { box: string; message: ApiMailMessage }) {
  const t = useTranslations('mail')
  const shown = message.attachments.filter((a) => !(a.inline && a.contentId && message.html?.includes(`cid:${a.contentId}`)))
  if (!shown.length) return null
  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label={t('attachments')}>
      {shown.map((a, i) => (
        <li key={`${a.id ?? a.filename}-${i}`}>
          <AttachmentChip box={box} messageId={message.id} a={a} />
        </li>
      ))}
    </ul>
  )
}

function AttachmentChip({ box, messageId, a }: { box: string; messageId: string; a: ApiMailAttachment }) {
  const t = useTranslations('mail')
  const href = a.data ? `data:application/octet-stream;base64,${a.data.replace(/-/g, '+').replace(/_/g, '/')}` : attachmentUrl(box, messageId, a)
  const thumb = a.mimeType.startsWith('image/') && !a.data ? attachmentUrl(box, messageId, a, true) : null
  const Icon = fileIcon(a.mimeType)
  return (
    <a
      href={href ?? undefined}
      download={a.filename}
      title={t('download', { name: a.filename })}
      className="group flex max-w-64 items-center gap-2.5 rounded-xl bg-panel py-1.5 pl-1.5 pr-3 shadow-card ring-1 ring-line-soft outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent-mid"
    >
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-hover text-fg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : <Icon className="size-4" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-fg">{a.filename}</span>
        <span className="block text-2xs text-fg-subtle">{formatBytes(a.size)}</span>
      </span>
      <Download className="size-3.5 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </a>
  )
}
