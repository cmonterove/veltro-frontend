import { callApi, proxyJson } from '../_proxy'

/**
 * GET /api/v1/workspaces (compatibilidad) → GET /v1/workspaces de la API.
 * Solo los espacios donde el token puede escribir (admin o editor), como antes.
 */
export async function GET(request: Request) {
  const { data, response } = await callApi<{ items: { id: string; name: string; slug: string; key: string; role: string }[] }>(request, '/v1/workspaces')
  if (response) return response
  return proxyJson({
    workspaces: data.items.filter((w) => w.role === 'admin' || w.role === 'editor').map(({ id, name, slug, key }) => ({ id, name, slug, key })),
  })
}
