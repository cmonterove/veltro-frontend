'use client'

import { useTranslations } from 'next-intl'
import { Dialog, DialogBody, DialogContent, DialogHeader } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'

type Shortcut = { keys: string[]; label: string; then?: boolean }

/** Atajos de teclado de Veltro (se abre con `?`). */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('shortcuts')

  const groups: { title: string; items: Shortcut[] }[] = [
    {
      title: t('general'),
      items: [
        { keys: ['⌘', 'K'], label: t('palette') },
        { keys: ['C'], label: t('newTask') },
        { keys: ['['], label: t('toggleSidebar') },
        { keys: ['?'], label: t('help') },
      ],
    },
    {
      title: t('navigate'),
      items: [
        { keys: ['G', 'H'], label: t('goToday'), then: true },
        { keys: ['G', 'V'], label: t('goVeltro'), then: true },
        { keys: ['G', 'M'], label: t('goMesa'), then: true },
        { keys: ['G', 'C'], label: t('goCalendar'), then: true },
        { keys: ['G', 'T'], label: t('goMyTasks'), then: true },
        { keys: ['G', 'B'], label: t('goVault'), then: true },
        { keys: ['G', 'P'], label: t('goPasillo'), then: true },
        { keys: ['G', '1-9'], label: t('goWorkspace'), then: true },
      ],
    },
    {
      title: t('capture'),
      items: [
        { keys: ['->'], label: t('action') },
        { keys: ['<>'], label: t('decision') },
        { keys: ['??'], label: t('question') },
        { keys: ['@'], label: t('assign') },
      ],
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader title={t('title')} description={t('subtitle')} />
        <DialogBody className="grid grid-cols-1 gap-x-8 gap-y-5 pb-6 sm:grid-cols-2">
          {groups.map((g) => (
            <section key={g.title} className={g.title === t('capture') ? 'sm:col-span-2' : undefined}>
              <h3 className="mb-2 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{g.title}</h3>
              <ul className={g.title === t('capture') ? 'grid grid-cols-1 gap-x-8 sm:grid-cols-2' : undefined}>
                {g.items.map((s) => (
                  <li key={s.label} className="flex h-8 items-center justify-between gap-3 text-sm">
                    <span className="truncate text-fg">{s.label}</span>
                    <span className="flex shrink-0 items-center gap-1 text-2xs text-fg-subtle">
                      {s.keys.map((k, i) => (
                        <span key={k} className="flex items-center gap-1">
                          {i > 0 && s.then ? t('then') : null}
                          <Kbd>{k}</Kbd>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
