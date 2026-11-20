'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { createAccount } from '@/app/actions/settings'
import { setCurrentAccount } from '@/app/actions/preferences'
import type { ErrorCode } from '@/lib/errors'

/**
 * Otra cuenta (una empresa, un cliente): su nombre y su primer espacio. Al crearla queda elegida y se
 * abre ese espacio; las demás cuentas siguen en el selector.
 */
export function NewAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('nav.newAccount')
  const te = useTranslations('errors')
  const router = useRouter()
  const [accountName, setAccountName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [error, setError] = useState<ErrorCode | null>(null)
  const [pending, start] = useTransition()

  const close = (o: boolean) => {
    onOpenChange(o)
    if (!o) {
      setAccountName('')
      setWorkspaceName('')
      setError(null)
    }
  }

  const submit = () =>
    start(async () => {
      setError(null)
      const res = await createAccount({ accountName, workspaceName, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      if (!res.ok) {
        setError(res.error)
        return
      }
      await setCurrentAccount(res.accountId)
      close(false)
      router.push(`/w/${res.slug}`)
      router.refresh()
    })

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <DialogHeader title={t('title')} description={t('description')} />
          <DialogBody className="flex flex-col gap-4">
            <Field label={t('accountName')} htmlFor="na-account">
              <Input id="na-account" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder={t('accountPlaceholder')} maxLength={80} required autoFocus />
            </Field>
            <Field label={t('workspaceName')} htmlFor="na-workspace" hint={t('workspaceHint')}>
              <Input id="na-workspace" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder={t('workspacePlaceholder')} maxLength={80} required />
            </Field>
            {error ? (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-fg">
                {te(error)}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => close(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={pending} disabled={!accountName.trim() || !workspaceName.trim()}>
              <Building2 />
              {t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
