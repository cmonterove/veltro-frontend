'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Logo } from '@/components/app/logo'
import { ExchangeConnectForm, type ExchangeServer } from '@/components/settings/exchange-mail'
import { MailConnected } from './mail-connected'

/** El formulario de usuario y clave en la ventanita de la burbuja; al conectar avisa y se cierra. */
export function ExchangeConnectWindow({ server }: { server: ExchangeServer | null }) {
  const t = useTranslations('bubble')
  const tx = useTranslations('settings.integrations.exchange')
  const [done, setDone] = useState(false)
  if (done) return <MailConnected ok />
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm rounded-xl bg-panel p-6 shadow-card">
        <Logo />
        {server ? (
          <>
            <h1 className="mt-6 text-md font-semibold text-fg">{t('exchangeTitle', { name: server.name })}</h1>
            <p className="mb-4 mt-1 text-sm text-fg-muted">{tx('dialogText', { name: server.name })}</p>
            <ExchangeConnectForm server={server} onDone={() => setDone(true)} onCancel={() => window.close()} />
          </>
        ) : (
          <p className="mt-6 text-sm text-fg-muted">{tx('errors.exchange_server_unknown')}</p>
        )}
      </div>
    </main>
  )
}
