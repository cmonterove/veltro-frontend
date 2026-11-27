'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Eye, EyeOff } from 'lucide-react'
import { ExchangeLogo } from '@/components/mail/provider-logos'
import { api, ApiError } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogHeader } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { mailKeys } from '@/lib/queries/mail'

// Correo de empresa con Exchange propio (p. ej. Promoting): se conecta con el usuario y la clave del correo
// (no hay «Continuar con…»). La API los prueba contra el servidor antes de guardarlos (cifrados) y toma la
// dirección que da el servidor, que no siempre es el usuario con el que se entra.

export type ExchangeServer = { id: string; name: string }
type MailAccount = { id: string; provider: 'google' | 'microsoft' | 'exchange'; email: string; isDefault: boolean }
type MailAccounts = { providers: { exchange?: ExchangeServer[] }; items: MailAccount[] }

export const mailAccountsKey = ['mail-accounts'] as const

export function useMailAccounts() {
  return useQuery({ queryKey: mailAccountsKey, queryFn: () => api<MailAccounts>('/v1/me/mail-accounts'), staleTime: 30_000 })
}

/** El formulario: usuario y clave. `onDone` recibe la dirección que quedó conectada. */
export function ExchangeConnectForm({ server, onDone, onCancel }: { server: ExchangeServer; onDone: (email: string) => void; onCancel?: () => void }) {
  const t = useTranslations('settings.integrations.exchange')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    setBusy(true)
    setError(null)
    try {
      const r = await api<MailAccount>('/v1/me/mail-accounts/exchange', { method: 'POST', body: { server: server.id, username: username.trim(), password } })
      setPassword('')
      onDone(r.email)
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'generic'
      setError(t.has(`errors.${code}`) ? t(`errors.${code}`) : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <Field label={t('username')} hint={t('usernameHint')} htmlFor="exchange-user">
        <Input
          id="exchange-user"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t('usernamePlaceholder')}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={busy}
          autoFocus
        />
      </Field>
      <Field label={t('password')} htmlFor="exchange-pass" error={error}>
        <div className="relative">
          <Input
            id="exchange-pass"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            aria-invalid={error ? true : undefined}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? t('hide') : t('show')}
            className="absolute right-1.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      <p className="text-xs leading-snug text-fg-muted">{t('privacy', { name: server.name })}</p>
      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {t('cancel')}
          </Button>
        ) : null}
        <Button type="submit" variant="primary" loading={busy} disabled={!username.trim() || !password}>
          {busy ? t('checking') : t('connect')}
        </Button>
      </div>
    </form>
  )
}

/** En Integraciones: un renglón por cada correo de empresa habilitado (conectado o por conectar). */
export function ExchangeBlocks({ head }: { head: (p: { mark: React.ReactNode; name: string; sub: React.ReactNode; action?: React.ReactNode }) => React.ReactNode }) {
  const t = useTranslations('settings.integrations.exchange')
  const qc = useQueryClient()
  const accounts = useMailAccounts()
  const [open, setOpen] = useState<ExchangeServer | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const servers = accounts.data?.providers.exchange ?? []
  if (!servers.length) return null

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: mailAccountsKey })
    void qc.invalidateQueries({ queryKey: mailKeys.boxes })
  }
  const remove = async (id: string) => {
    setRemoving(id)
    try {
      await api(`/v1/me/mail-accounts/${id}`, { method: 'DELETE' })
      refresh()
      toast.success(t('disconnected'))
    } catch {
      toast.error(t('errors.generic'))
    } finally {
      setRemoving(null)
    }
  }
  // de qué servidor es cada cuenta no viene en la lista: con un solo servidor (lo normal), todas son de él
  const mine = (accounts.data?.items ?? []).filter((a) => a.provider === 'exchange')

  return (
    <>
      {servers.map((s) => {
        const acc = servers.length === 1 ? mine[0] : undefined
        return (
          <div key={s.id} className="border-t border-line-soft pb-3 pt-3">
            {head({
              mark: <ExchangeLogo server={s.id} />,
              name: t('title', { name: s.name }),
              sub: accounts.isLoading ? (
                <Skeleton className="h-3.5 w-48" />
              ) : acc ? (
                <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                  <span className="min-w-0 truncate">{acc.email}</span>
                  <span aria-hidden className="text-fg-subtle">·</span>
                  <span className="inline-flex items-center gap-1 font-medium text-success">
                    <Check className="size-3" strokeWidth={3} />
                    {t('connected')}
                  </span>
                </span>
              ) : (
                t('hint')
              ),
              action: acc ? (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setOpen(s)}>
                    {t('update')}
                  </Button>
                  <Button variant="ghost" size="sm" loading={removing === acc.id} onClick={() => remove(acc.id)}>
                    {t('disconnect')}
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setOpen(s)}>
                  {t('connect')}
                </Button>
              ),
            })}
          </div>
        )
      })}
      <Dialog open={Boolean(open)} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-md">
          {open ? (
            <>
              <DialogHeader title={t('title', { name: open.name })} description={t('dialogText', { name: open.name })} />
              <DialogBody className="pb-5">
                <ExchangeConnectForm
                  server={open}
                  onCancel={() => setOpen(null)}
                  onDone={(email) => {
                    setOpen(null)
                    refresh()
                    toast.success(t('done', { email }))
                  }}
                />
              </DialogBody>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
