import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Logos de los correos que se pueden conectar, con sus colores. Los de empresa (Exchange) por el id
// del servidor de EXCHANGE_SERVERS; uno sin logo usa el ícono de edificio.

const EXCHANGE_LOGOS: Record<string, string> = {
  promoting: '/mail/promoting.png',
}

export function GmailLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="52 42 88 66" className={cn('size-5 shrink-0', className)} aria-hidden>
      <path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6" />
      <path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15" />
      <path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2" />
      <path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92" />
      <path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2" />
    </svg>
  )
}

export function ExchangeLogo({ server, className }: { server?: string | null; className?: string }) {
  const src = server ? EXCHANGE_LOGOS[server] : undefined
  if (!src) return <Building2 className={cn('size-5 shrink-0 text-fg-muted', className)} aria-hidden />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden className={cn('size-5 shrink-0 object-contain', className)} />
}

/** El logo de una cuenta conectada. Con un solo servidor de empresa (lo normal), las de Exchange son de él. */
export function MailAccountLogo({ provider, server, className }: { provider: string; server?: string | null; className?: string }) {
  return provider === 'exchange' ? <ExchangeLogo server={server} className={className} /> : <GmailLogo className={className} />
}
