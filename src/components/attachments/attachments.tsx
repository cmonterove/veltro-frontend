'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { formatDistanceToNowStrict } from 'date-fns'
import { Download, ExternalLink, File, Link2, Paperclip, Plus, Trash2, UploadCloud } from 'lucide-react'
import { useMemberMap } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { openAttachment, useAttachmentMutations, useAttachments, type AttachmentParent, type AttachmentScope } from '@/lib/queries/attachments'
import { useDateLocale } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { FileKindIcon, fileTitle, safeHost, useImageUrl } from '@/components/vault/file-visual'
import type { AttachmentRow } from '@/lib/database.types'
import { useConfirm } from '@/components/ui/confirm'

export function formatBytes(n: number | null) {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** El ícono del tipo de archivo: el mismo que en la bóveda (un solo criterio en toda la app). */
export function AttachmentIcon({ a, className }: { a: Pick<AttachmentRow, 'kind' | 'mime_type' | 'name'>; className?: string }) {
  return <FileKindIcon a={a} className={className} />
}

function Thumb({ a }: { a: AttachmentRow }) {
  const src = useImageUrl(a)
  if (!src) return null
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="size-10 shrink-0 rounded-md border border-line object-cover" />
}

/** Lista de adjuntos + subida (arrastrar y soltar o elegir) + agregar link. */
export function AttachmentsSection({
  scope,
  parent,
  editable,
  title,
  className,
  dense,
  emptyHint,
  hideTitle,
}: {
  scope: AttachmentScope
  parent: AttachmentParent
  editable: boolean
  title?: string
  className?: string
  dense?: boolean
  /** dentro de una pestaña "Adjuntos" el título sobra */
  hideTitle?: boolean
  emptyHint?: string
}) {
  const t = useTranslations('attachments')
  const locale = useDateLocale()
  const memberMap = useMemberMap()
  const { data: list, isLoading } = useAttachments(scope)
  const { upload, addLink, remove } = useAttachmentMutations()
  const confirm = useConfirm()
  const tConfirm = useTranslations('confirm')
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const onFiles = (files: FileList | File[] | null) => {
    const arr = Array.from(files ?? [])
    if (arr.length) upload.mutate({ parent, files: arr })
  }

  return (
    <section
      className={cn('flex flex-col gap-2', className)}
      onDragOver={(e) => {
        if (!editable) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setDragging(false)
      }}
      onDrop={(e) => {
        if (!editable) return
        e.preventDefault()
        setDragging(false)
        onFiles(e.dataTransfer.files)
      }}
    >
      <div className="flex items-center gap-2">
        {hideTitle ? null : (
          <h3 className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-fg-subtle">
            <Paperclip className="size-3.5 shrink-0" />
            <span className="truncate">{title ?? t('title')}</span>
            {list?.length ? <span className="tabular-nums">{list.length}</span> : null}
          </h3>
        )}
        {editable ? (
          <span className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap">
            <LinkPopover onAdd={(url, name) => addLink.mutate({ parent, url, name })} pending={addLink.isPending} iconOnly={dense} />
            <Button variant="ghost" size="xs" onClick={() => inputRef.current?.click()} loading={upload.isPending}>
              {upload.isPending ? null : <Plus />}
              {t('upload')}
            </Button>
          </span>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            onFiles(e.target.files)
            // así se puede volver a elegir el mismo archivo
            e.target.value = ''
          }}
        />
      </div>

      <div className={cn('relative rounded-xl transition-colors', dragging && 'bg-highlight ring-2 ring-accent/40')}>
        {isLoading ? (
          <div className="flex h-12 items-center justify-center">
            <Spinner className="size-4 text-fg-subtle" />
          </div>
        ) : list?.length ? (
          <ul className="flex flex-col">
            {list.map((a) => {
              const who = a.uploaded_by ? memberMap.get(a.uploaded_by) : undefined
              return (
                <li key={a.id} className={cn('group/att flex items-center gap-3 rounded-lg px-2 hover:bg-hover/70', dense ? 'py-1.5' : 'py-2')}>
                  {a.mime_type?.startsWith('image/') ? <Thumb a={a} /> : (
                    <span className={cn('flex shrink-0 items-center justify-center rounded-md bg-sidebar', dense ? 'size-8' : 'size-10')}>
                      <AttachmentIcon a={a} />
                    </span>
                  )}
                  <button type="button" onClick={() => openAttachment(a)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium text-fg hover:underline">{fileTitle(a)}</span>
                    <span className="block truncate text-xs text-fg-subtle">
                      {a.kind === 'link' ? safeHost(a.url) : formatBytes(a.size_bytes)}
                      {who ? ` · ${who.full_name.split(' ')[0]}` : ''} · {formatDistanceToNowStrict(new Date(a.created_at), { addSuffix: true, locale })}
                    </span>
                  </button>
                  {who && !dense ? <Avatar name={who.full_name} seed={who.id} src={who.avatar_url} size={18} className="hidden sm:inline-flex" /> : null}
                  <span className="flex items-center opacity-0 transition-opacity group-hover/att:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => openAttachment(a, a.kind === 'link' ? 'open' : 'download')}
                      className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-active hover:text-fg"
                      aria-label={a.kind === 'link' ? t('open') : t('download')}
                    >
                      {a.kind === 'link' ? <ExternalLink className="size-3.5" /> : <Download className="size-3.5" />}
                    </button>
                    {editable ? (
                      <button
                        type="button"
                        onClick={async () => {
                          if (await confirm({ title: t('deleteConfirm', { name: fileTitle(a) }), danger: true, confirmLabel: tConfirm('delete') })) remove.mutate(a)
                        }}
                        className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-danger-soft hover:text-danger"
                        aria-label={t('remove')}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : editable ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong px-4 text-center transition-colors hover:border-accent hover:bg-highlight/50',
              dense ? 'py-3' : 'py-5',
            )}
          >
            <UploadCloud className="size-5 text-fg-subtle" />
            <span className="text-sm text-fg-muted">{emptyHint ?? t('drop')}</span>
            <span className="text-xs text-fg-subtle">{t('limit')}</span>
          </button>
        ) : (
          <p className="px-2 py-2 text-xs text-fg-subtle">{t('none')}</p>
        )}
        {dragging ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl text-sm font-medium text-accent-ink">{t('dropHere')}</div>
        ) : null}
      </div>
    </section>
  )
}

export function LinkPopover({
  onAdd,
  pending,
  iconOnly,
  className,
}: {
  onAdd: (url: string, name?: string) => void
  pending: boolean
  iconOnly?: boolean
  /** para usarlo como botón grande fuera de la lista de adjuntos */
  className?: string
}) {
  const t = useTranslations('attachments')
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const valid = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+/i.test(url.trim())
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn('inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-fg-muted hover:bg-hover hover:text-fg', className)}
        aria-label={t('addLink')}
        title={iconOnly ? t('addLink') : undefined}
      >
        <Link2 className="size-3.5" />
        {iconOnly ? null : t('addLink')}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valid) return
            onAdd(url.trim(), name)
            setUrl('')
            setName('')
            setOpen(false)
          }}
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" autoFocus className="h-8 rounded-md border border-line bg-canvas px-2.5 text-sm outline-none focus:border-accent" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('linkName')} className="h-8 rounded-md border border-line bg-canvas px-2.5 text-sm outline-none focus:border-accent" />
          <Button type="submit" variant="primary" size="sm" disabled={!valid} loading={pending}>
            {t('addLink')}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
