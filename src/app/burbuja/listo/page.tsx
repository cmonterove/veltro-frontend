import type { Metadata } from 'next'
import { MailConnected } from '@/components/bubble/mail-connected'

export const metadata: Metadata = { title: 'Gmail' }

/** A dónde vuelve la ventanita que abrió la burbuja para conectar Gmail: avisa y se cierra (la burbuja lo ve sola). */
export default async function BubbleMailDone({ searchParams }: { searchParams: Promise<{ mail?: string }> }) {
  const { mail } = await searchParams
  return <MailConnected ok={!mail || mail === 'connected'} />
}
