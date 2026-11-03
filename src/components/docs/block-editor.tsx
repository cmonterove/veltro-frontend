'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { COLORS_DARK_MODE_DEFAULT, COLORS_DEFAULT, type PartialBlock, type BlockNoteEditor } from '@blocknote/core'
import { en, es, fr, pt } from '@blocknote/core/locales'
import { BlockNoteContext, useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import { api, uploadSigned, type SignedUpload } from '@/lib/api/client'
import type { Json } from '@/lib/database.types'
import { toErrorCode } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { blocksToText } from '@/lib/blocks'

const DICTIONARIES = { en, es, fr, pt }
// En el contenido queda `veltro-file://{ruta}`: la ruta del archivo en la carpeta del espacio.
const FILE_SCHEME = 'veltro-file://'
// {espacio}/{uuid}.{ext} (subidas por la API) o {espacio}/{uuid}-{nombre} (las de antes)
const FILE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{2,5}|-[A-Za-z0-9._-]{0,80})$/

// URLs firmadas de los archivos del editor: las de un doc se piden juntas (llegan casi a la vez)
// y se recuerdan mientras valen.
type Signed = { url: string; until: number }
const signedUrls = new Map<string, Signed>()
let waiting: { path: string; resolve: (url: string | null) => void }[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function signedUrl(path: string): Promise<string | null> {
  const hit = signedUrls.get(path)
  if (hit && hit.until > Date.now()) return Promise.resolve(hit.url)
  if (!FILE_PATH.test(path)) return Promise.resolve(null)
  return new Promise((resolve) => {
    waiting.push({ path, resolve })
    flushTimer ??= setTimeout(flushSigned, 30)
  })
}

async function flushSigned() {
  const batch = waiting
  waiting = []
  flushTimer = null
  // por espacio (el primer tramo de la ruta), de a 50
  const byWorkspace = new Map<string, Set<string>>()
  for (const { path } of batch) {
    const ws = path.split('/')[0]
    byWorkspace.set(ws, (byWorkspace.get(ws) ?? new Set()).add(path))
  }
  await Promise.all(
    [...byWorkspace].flatMap(([ws, set]) => {
      const paths = [...set]
      const chunks = Array.from({ length: Math.ceil(paths.length / 50) }, (_, i) => paths.slice(i * 50, i * 50 + 50))
      return chunks.map(async (chunk) => {
        try {
          const res = await api<{ items: { path: string; url: string; expiresIn: number }[] }>(`/v1/workspaces/${ws}/editor-files`, { query: { path: chunk } })
          for (const x of res.items) signedUrls.set(x.path, { url: x.url, until: Date.now() + (x.expiresIn - 60) * 1000 })
        } catch {
          // sin firma (sin acceso o sin red): queda la URL original
        }
      })
    }),
  )
  for (const w of batch) w.resolve(signedUrls.get(w.path)?.url ?? null)
}

const base = {
  colors: {
    editor: { text: 'var(--fg)', background: 'transparent' },
    menu: { text: 'var(--fg)', background: 'var(--panel)' },
    tooltip: { text: 'var(--canvas)', background: 'var(--fg)' },
    hovered: { text: 'var(--fg)', background: 'var(--hover)' },
    selected: { text: 'var(--accent-fg)', background: 'var(--accent)' },
    disabled: { text: 'var(--fg-subtle)', background: 'var(--hover)' },
    shadow: 'oklch(0.2 0.01 165 / 0.14)',
    border: 'var(--line)',
    sideMenu: 'var(--fg-subtle)',
  },
  borderRadius: 6,
  fontFamily: 'var(--font-sans)',
}

const THEME = {
  light: { ...base, colors: { ...base.colors, highlights: COLORS_DEFAULT } },
  dark: { ...base, colors: { ...base.colors, shadow: 'oklch(0 0 0 / 0.5)', highlights: COLORS_DARK_MODE_DEFAULT } },
}

export type EditorChange = { content: Json; text: string }

export function BlockEditor({
  workspaceId,
  docId,
  initialContent,
  importMarkdown,
  editable = true,
  onChange,
  onReady,
  onImported,
  placeholder,
  className,
  compact,
}: {
  workspaceId: string
  /** el doc que se edita: lo que se sube queda vinculado a él (en la Bóveda y en sus archivos) */
  docId?: string
  initialContent: Json | null
  importMarkdown?: string | null
  editable?: boolean
  onChange?: (change: EditorChange) => void
  onReady?: (editor: BlockNoteEditor) => void
  /** se llamó tras convertir import_markdown: el padre debe guardar y limpiar el campo */
  onImported?: (change: EditorChange) => void
  placeholder?: string
  className?: string
  compact?: boolean
}) {
  const locale = useLocale() as keyof typeof DICTIONARIES
  const tErrors = useTranslations('errors')
  const qc = useQueryClient()
  const { resolvedTheme } = useTheme()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const initial = useMemo(() => {
    const blocks = Array.isArray(initialContent) ? (initialContent as unknown as PartialBlock[]) : []
    return blocks.length ? blocks : undefined
    // solo en el montaje
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dictionary = useMemo(() => {
    const dict = DICTIONARIES[locale] ?? es
    return placeholder ? { ...dict, placeholders: { ...dict.placeholders, emptyDocument: placeholder, default: dict.placeholders.default } } : dict
  }, [locale, placeholder])

  const editor = useCreateBlockNote(
    {
      initialContent: initial,
      dictionary,
      trailingBlock: true,
      // Como adjunto del espacio (y del doc): URL firmada, subida directa y registro en la API.
      uploadFile: async (file: File) => {
        try {
          const name = (file.name || 'archivo').slice(-200)
          const signed = await api<SignedUpload & { uploadToken: string }>(`/v1/workspaces/${workspaceId}/attachments/upload-url`, {
            method: 'POST',
            body: { name, mimeType: file.type, sizeBytes: file.size },
          })
          await uploadSigned(signed, file)
          await api(`/v1/workspaces/${workspaceId}/attachments`, {
            method: 'POST',
            body: { kind: 'file', uploadToken: signed.uploadToken, name, ...(docId ? { docId } : {}) },
          })
          qc.invalidateQueries({ queryKey: ['attachments'] })
          return `${FILE_SCHEME}${signed.path}`
        } catch (e) {
          toast.error(tErrors(toErrorCode(e as { message?: string })))
          throw e
        }
      },
      resolveFileUrl: async (url: string) => {
        if (!url.startsWith(FILE_SCHEME)) return url
        return (await signedUrl(url.slice(FILE_SCHEME.length))) ?? url
      },
    },
    [workspaceId, docId],
  )

  // Markdown pendiente (docs creados vía API/Claude o el doc de bienvenida)
  const imported = useRef(false)
  useEffect(() => {
    if (!importMarkdown || imported.current) return
    imported.current = true
    const blocks = editor.tryParseMarkdownToBlocks(importMarkdown)
    const existing = editor.document
    const isEmpty = existing.length <= 1 && blocksToText(existing).trim() === ''
    if (isEmpty) editor.replaceBlocks(existing, blocks)
    else editor.insertBlocks(blocks, existing[existing.length - 1], 'after')
    onImported?.({ content: editor.document as unknown as Json, text: blocksToText(editor.document) })
  }, [editor, importMarkdown, onImported])

  useEffect(() => {
    onReady?.(editor)
  }, [editor, onReady])

  const scheme = resolvedTheme === 'dark' ? 'dark' : 'light'
  return (
    <div className={cn('veltro-editor', compact && 'veltro-editor-compact', className)}>
      {/* el modo lo decide la web, no el sistema: si no, con el sistema oscuro BlockNote le pone la
          clase `dark` a su raíz y el texto toma los colores del tema oscuro sobre fondo claro */}
      <BlockNoteContext.Provider value={{ colorSchemePreference: scheme }}>
        <BlockNoteView
          editor={editor}
          editable={editable}
          theme={THEME[scheme]}
          onChange={() => {
            onChangeRef.current?.({ content: editor.document as unknown as Json, text: blocksToText(editor.document) })
          }}
        />
      </BlockNoteContext.Provider>
    </div>
  )
}
