'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from './button'
import { Dialog, DialogContent, DialogFooter, DialogHeader } from './dialog'

type ConfirmOptions = {
  title: string
  description?: string
  /** texto del botón que confirma (por defecto "Confirmar") */
  confirmLabel?: string
  /** acciones que borran o no se pueden deshacer: botón rojo */
  danger?: boolean
}

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false)

/**
 * Confirmaciones con el estilo de la app, en lugar del `confirm` del navegador:
 * `if (!(await confirm({ title, danger: true }))) return`.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('confirm')
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false)
        resolver.current = resolve
        setOptions(o)
      }),
    [],
  )
  const close = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={options !== null} onOpenChange={(o) => !o && close(false)}>
        <DialogContent className="max-w-sm" hideClose>
          {options ? (
            <>
              <DialogHeader title={options.title} description={options.description} />
              <DialogFooter>
                {/* en lo peligroso el foco queda en Cancelar: un Enter por reflejo no borra nada */}
                <Button variant="ghost" size="sm" onClick={() => close(false)} autoFocus={options.danger}>
                  {t('cancel')}
                </Button>
                <Button variant={options.danger ? 'danger' : 'primary'} size="sm" onClick={() => close(true)} autoFocus={!options.danger}>
                  {options.confirmLabel ?? t('confirm')}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

export const useConfirm = () => useContext(ConfirmContext)
