import type { Metadata } from 'next'
import { BubblePanel } from '@/components/bubble/panel'

export const metadata: Metadata = { title: 'Burbuja' }

/** El panel de la burbuja: lo abre /burbuja.js dentro de un iframe en otra plataforma (OP, CUBE…). */
export default async function BubblePage({ searchParams }: { searchParams: Promise<{ plataforma?: string }> }) {
  const { plataforma } = await searchParams
  return <BubblePanel initialPlatform={plataforma?.slice(0, 40) || 'Plataforma'} />
}
