import { redirect } from 'next/navigation'

/** Integraciones vive ahora dentro de Preferencias; se conserva ?google=… para el aviso de la conexión. */
export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === 'string') params.set(k, v)
  const qs = params.toString()
  redirect(`/settings/preferences${qs ? `?${qs}` : ''}#integrations`)
}
