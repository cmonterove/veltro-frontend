import { appUrl } from '@/lib/google/config'
import { callApi, proxyError, proxyJson } from '../_proxy'

const MAX_MARKDOWN = 200_000

/**
 * POST /api/v1/docs (compatibilidad) → POST /v1/workspaces/{ws}/docs de la API.
 * { "workspace": "<slug | id>", "title"?: "...", "markdown": "...", "parent_id"?: "...", "source"?: "claude" | "import" }
 * Si no hay título y el Markdown empieza con "# Título", ese es el título y se quita del cuerpo.
 * Responde 201 { id, url } como antes; permisos, alcance del token y validaciones son de la API.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const ref = typeof body?.workspace === 'string' ? body.workspace.trim() : ''
  const markdown = typeof body?.markdown === 'string' ? body.markdown : ''
  let title = typeof body?.title === 'string' ? body.title.trim().slice(0, 300) : ''
  const parentId = typeof body?.parent_id === 'string' ? body.parent_id : null

  if (!ref || !markdown.trim()) return proxyError(422, 'validation_error', 'workspace y markdown son obligatorios.')
  if (markdown.length > MAX_MARKDOWN) return proxyError(413, 'payload_too_large', 'El markdown pasa de 200.000 caracteres.')

  let content = markdown
  const heading = markdown.match(/^\s*#\s+(.+)\n?/)
  if (heading) {
    if (!title) title = heading[1].trim().slice(0, 300)
    content = markdown.slice(heading[0].length)
  }

  const { data, response } = await callApi<{ id: string; workspace: { slug: string } }>(request, `/v1/workspaces/${encodeURIComponent(ref)}/docs`, {
    method: 'POST',
    body: { title, markdown: content, parentId, source: body?.source === 'import' ? 'import' : 'claude' },
  })
  if (response) return response
  return proxyJson({ id: data.id, url: `${appUrl()}/w/${data.workspace.slug}/docs/${data.id}` }, 201)
}
