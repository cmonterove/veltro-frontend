import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace'
import { DocView } from '@/components/docs/doc-view'

type Params = Promise<{ slug: string; docId: string }>

async function loadDoc(slug: string, docId: string) {
  const { ws } = await requireWorkspace(slug)
  if (!/^[0-9a-f-]{36}$/i.test(docId)) notFound()
  const supabase = await createClient()
  const { data: doc } = await supabase.from('docs').select('*').eq('id', docId).eq('workspace_id', ws.id).maybeSingle()
  if (!doc || doc.archived_at) notFound()
  return { ws, doc }
}

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
