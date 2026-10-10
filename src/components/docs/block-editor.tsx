'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useLocale } from 'next-intl'
import { useTheme } from 'next-themes'
import { COLORS_DARK_MODE_DEFAULT, COLORS_DEFAULT, type PartialBlock, type BlockNoteEditor } from '@blocknote/core'
import { en, es, fr, pt } from '@blocknote/core/locales'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/lib/database.types'
import { cn } from '@/lib/utils'
import { blocksToText } from '@/lib/blocks'

const DICTIONARIES = { en, es, fr, pt }
const FILE_SCHEME = 'veltro-file://'

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
      uploadFile: async (file: File) => {
        const supabase = createClient()
        const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80)
        const path = `${workspaceId}/${crypto.randomUUID()}-${safe}`
        const { error } = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type })
        if (error) throw error
        return `${FILE_SCHEME}${path}`
      },
      resolveFileUrl: async (url: string) => {
        if (!url.startsWith(FILE_SCHEME)) return url
        const { data } = await createClient()
          .storage.from('attachments')
          .createSignedUrl(url.slice(FILE_SCHEME.length), 60 * 60)
        return data?.signedUrl ?? url
      },
    },
    [workspaceId],
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

  return (
    <div className={cn('veltro-editor', compact && 'veltro-editor-compact', className)}>
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={resolvedTheme === 'dark' ? THEME.dark : THEME.light}
        onChange={() => {
          onChangeRef.current?.({ content: editor.document as unknown as Json, text: blocksToText(editor.document) })
        }}
      />
    </div>
  )
}
