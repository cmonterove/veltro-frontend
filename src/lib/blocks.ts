// Utilidades puras sobre bloques de BlockNote (sin importar el editor).

/** Forma mínima de un bloque para recorrer el documento sin depender del schema. */
export type LooseInline = { type: string; text?: string; content?: LooseInline[] | string }
export type LooseBlock = {
  id?: string
  type?: string
  props?: Record<string, unknown>
  content?: LooseInline[] | string | { type: string; rows?: { cells: (LooseInline[] | { content?: LooseInline[] })[] }[] }
  children?: LooseBlock[]
}

export function inlineText(content: LooseInline[] | string | undefined): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  return content.map((c) => (c.type === 'text' ? (c.text ?? '') : inlineText(c.content))).join('')
}

/** Texto plano de un documento (para búsqueda y vista previa). */
export function blocksToText(blocks: readonly unknown[]): string {
  const out: string[] = []
  const walk = (list: LooseBlock[]) => {
    for (const b of list) {
      if (Array.isArray(b.content) || typeof b.content === 'string') {
        const line = inlineText(b.content)
        if (line.trim()) out.push(line)
      } else if (b.content?.type === 'tableContent') {
        for (const row of b.content.rows ?? []) {
          out.push(row.cells.map((cell) => inlineText(Array.isArray(cell) ? cell : cell.content)).join(' | '))
        }
      }
      if (b.children?.length) walk(b.children)
    }
  }
  walk(blocks as LooseBlock[])
  return out.join('\n').slice(0, 100_000)
}
