import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { api } from '@/lib/api/server'
import { ApiError } from '@/lib/api/shared'
import { toDocRow, type ApiDoc } from '@/lib/api/docs-reuniones'
import { requireWorkspace } from '@/lib/workspace'
import { DocView } from '@/components/docs/doc-view'

type Params = Promise<{ slug: string; docId: string }>

// una sola llamada por petición (la usan generateMetadata y la página)
const loadDoc = cache(async (slug: string, docId: string) => {
  const { ws } = await requireWorkspace(slug)
  if (!/^[0-9a-f-]{36}$/i.test(docId)) notFound()
  const doc = await api<ApiDoc>(`/v1/docs/${docId}`).catch((e) => {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) return null
    throw e
  })
  if (!doc || doc.workspaceId !== ws.id || doc.archivedAt) notFound()
  return { ws, doc: toDocRow(doc) }
})

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, docId } = await params
  const { doc } = await loadDoc(slug, docId)
  return { title: doc.title || undefined }
}

export default async function DocPage({ params }: { params: Params }) {
  const { slug, docId } = await params
  const { ws, doc } = await loadDoc(slug, docId)
  return <DocView initialDoc={doc} workspace={ws} />
}
