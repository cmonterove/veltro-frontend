import { NextResponse } from 'next/server'
import { authenticateApiToken } from '@/lib/api-auth'
import { appUrl } from '@/lib/google/config'

const MAX_MARKDOWN = 200_000

/**
 * POST /api/v1/docs
 * { "workspace": "<slug | id>", "title": "...", "markdown": "...", "parent_id"?: "...", "source"?: "claude" | "import", "icon"?: "🤖" }
 * Crea un doc a partir de Markdown. El editor lo convierte a bloques al abrirlo.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiToken(request)
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { admin, userId } = auth

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const ref = typeof body?.workspace === 'string' ? body.workspace.trim() : ''
  const markdown = typeof body?.markdown === 'string' ? body.markdown : ''
  let title = typeof body?.title === 'string' ? body.title.trim().slice(0, 300) : ''
  const source = body?.source === 'import' ? 'import' : 'claude'
  const parentId = typeof body?.parent_id === 'string' ? body.parent_id : null

  if (!ref || !markdown.trim()) return NextResponse.json({ error: 'workspace and markdown are required' }, { status: 400 })
  if (markdown.length > MAX_MARKDOWN) return NextResponse.json({ error: 'markdown too large' }, { status: 413 })

  const isUuid = /^[0-9a-f-]{36}$/i.test(ref)
  const { data: ws } = await admin
    .from('workspaces')
    .select('id, slug, archived_at')
    .eq(isUuid ? 'id' : 'slug', ref)
    .maybeSingle()
  if (!ws || ws.archived_at) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })

  const { data: role } = await admin.rpc('workspace_role_for', { p_workspace: ws.id, p_user: userId })
  if (role !== 'admin' && role !== 'editor') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // Si el markdown empieza con "# Título" y no se mandó título, se usa ese
  let content = markdown
  const heading = markdown.match(/^\s*#\s+(.+)\n?/)
  if (heading) {
    if (!title) title = heading[1].trim().slice(0, 300)
    content = markdown.slice(heading[0].length)
  }

  const { data: doc, error } = await admin
    .from('docs')
    .insert({
      workspace_id: ws.id,
      parent_id: parentId,
      title,
      icon: null,
      source,
      import_markdown: content,
      content_text: markdown.slice(0, 100_000),
      created_by: userId,
      updated_by: userId,
      position: Date.now() / 1000,
    })
    .select('id')
    .single()
  if (error || !doc) return NextResponse.json({ error: 'could not create doc' }, { status: 400 })

  return NextResponse.json({ id: doc.id, url: `${appUrl()}/w/${ws.slug}/docs/${doc.id}` }, { status: 201 })
}
