'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { track } from '@/lib/telemetry'

export function ImportMarkdownDialog({
  open,
  onOpenChange,
  onImport,
  allowReplace = true,
  footerStart,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onImport: (markdown: string, mode: 'append' | 'replace') => void
  allowReplace?: boolean
  footerStart?: React.ReactNode
}) {
  const t = useTranslations('docs.import')
  const [value, setValue] = useState('')

  const submit = (mode: 'append' | 'replace') => {
    track('feature.markdown_import', { props: { mode } })
    if (!value.trim()) return
    onImport(value, mode)
    setValue('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader title={t('title')} description={t('description')} />
        <DialogBody>
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('placeholder')}
            className="min-h-72 font-mono text-sm"
            autoFocus
          />
        </DialogBody>
        <DialogFooter>
          {footerStart ? <div className="mr-auto">{footerStart}</div> : null}
          {allowReplace ? (
            <Button variant="ghost" onClick={() => submit('replace')} disabled={!value.trim()}>
              {t('replace')}
            </Button>
          ) : null}
          <Button variant="primary" onClick={() => submit('append')} disabled={!value.trim()}>
            {allowReplace ? t('append') : t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
