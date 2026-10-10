'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronRight, Plus } from 'lucide-react'
import { useWorkspaceDocs, useCreateDoc } from '@/lib/queries/docs'
import { useLocalStorage } from '@/lib/hooks'
import { canEdit } from '@/components/app/app-context'
import { cn, positionBetween } from '@/lib/utils'
import type { DocSummary, WorkspaceWithRole } from '@/lib/types'
import { DocMark } from '@/components/app/marks'

const MAX_TOP = 12

export function buildDocTree(docs: DocSummary[]) {
  const children = new Map<string | null, DocSummary[]>()
  for (const d of docs) {
    const key = d.parent_id
    if (!children.has(key)) children.set(key, [])
    children.get(key)!.push(d)
  }
  for (const list of children.values()) list.sort((a, b) => a.position - b.position)
  return children
}

export function useNewDoc(workspace: Pick<WorkspaceWithRole, 'id' | 'slug'>) {
  const router = useRouter()
  const create = useCreateDoc()
  return {
    pending: create.isPending,
    create: (opts?: { parentId?: string | null; after?: number | null; title?: string; icon?: string; import_markdown?: string; source?: 'manual' | 'claude' | 'import' }) =>
      create.mutate(
        {
          workspace_id: workspace.id,
          parent_id: opts?.parentId ?? null,
          position: positionBetween(opts?.after ?? Date.now() / 1000, null),
          title: opts?.title ?? '',
          icon: opts?.icon ?? null,
          import_markdown: opts?.import_markdown ?? null,
          source: opts?.source ?? 'manual',
        },
        { onSuccess: (doc) => router.push(`/w/${workspace.slug}/docs/${doc.id}`) },
      ),
  }
}

export function DocTree({ workspace, pathname }: { workspace: WorkspaceWithRole; pathname: string }) {
  const t = useTranslations('nav')
  const { data: docs } = useWorkspaceDocs(workspace.id)
  const tree = useMemo(() => buildDocTree(docs ?? []), [docs])
  const top = tree.get(null) ?? []
  const editable = canEdit(workspace)
  const newDoc = useNewDoc(workspace)

  return (
    <div className="flex flex-col gap-px">
      {top.slice(0, MAX_TOP).map((d) => (
        <DocNode key={d.id} doc={d} tree={tree} depth={0} workspace={workspace} pathname={pathname} editable={editable} />
      ))}
      {top.length > MAX_TOP ? (
        <Link href={`/w/${workspace.slug}/docs`} className="flex h-[26px] items-center px-2 text-xs text-fg-subtle hover:text-fg">
          {t('moreDocs', { count: top.length - MAX_TOP })}
        </Link>
      ) : null}
      {editable ? (
        <button
          type="button"
          onClick={() => newDoc.create({ after: top.at(-1)?.position })}
          disabled={newDoc.pending}
          className="flex h-[26px] items-center gap-2 rounded-md px-2 text-sm text-fg-subtle hover:bg-hover hover:text-fg"
        >
          <Plus className="size-3.5" />
          {t('newDoc')}
        </button>
      ) : null}
    </div>
  )
}

function DocNode({
  doc,
  tree,
  depth,
  workspace,
  pathname,
  editable,
}: {
  doc: DocSummary
  tree: Map<string | null, DocSummary[]>
  depth: number
  workspace: WorkspaceWithRole
  pathname: string
  editable: boolean
}) {
  const t = useTranslations('nav')
  const tDocs = useTranslations('docs')
  const kids = tree.get(doc.id) ?? []
  const href = `/w/${workspace.slug}/docs/${doc.id}`
  const active = pathname === href
  const [open, setOpen] = useLocalStorage<boolean>(`veltro:doc-open:${doc.id}`, false)
  const newDoc = useNewDoc(workspace)

  return (
    <>
      <div
        className={cn(
          'group/doc flex h-[26px] items-center gap-1 rounded-md pr-1 text-sm text-fg-muted hover:bg-hover hover:text-fg',
          active && 'bg-active font-medium text-fg',
        )}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            'inline-flex size-4 shrink-0 items-center justify-center rounded-xs text-fg-subtle hover:bg-active',
            kids.length === 0 && 'invisible',
          )}
          aria-label={open ? t('collapse') : t('expand')}
          tabIndex={kids.length === 0 ? -1 : 0}
        >
          <ChevronRight className={cn('size-3 transition-transform duration-150', open && 'rotate-90')} />
        </button>
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-1.5">
          <DocMark source={doc.source} className="size-3.5" />
          <span className="truncate">{doc.title || tDocs('untitled')}</span>
        </Link>
        {editable ? (
          <button
            type="button"
            onClick={() => {
              setOpen(true)
              newDoc.create({ parentId: doc.id, after: kids.at(-1)?.position })
            }}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-xs text-fg-subtle opacity-0 hover:bg-active hover:text-fg group-hover/doc:opacity-100 focus-visible:opacity-100"
            aria-label={t('addSubpage')}
          >
            <Plus className="size-3" />
          </button>
        ) : null}
      </div>
      {open
        ? kids.map((k) => (
            <DocNode key={k.id} doc={k} tree={tree} depth={depth + 1} workspace={workspace} pathname={pathname} editable={editable} />
          ))
        : null}
    </>
  )
}
