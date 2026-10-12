'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { MessageSquare, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChatList } from './chat-list'
import { PeopleDialog } from './new-chat-dialog'

/** Pasillo: la lista de conversaciones queda fija y a la derecha va el chat abierto. En el celular, una u otro. */
export function PasilloShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const activeId = pathname.startsWith('/chat/') ? pathname.slice('/chat/'.length).split('/')[0] : undefined
  return (
    <div className="flex h-full min-h-0">
      <aside className={cn('min-h-0 w-full shrink-0 border-line lg:flex lg:w-[340px] lg:border-r', activeId ? 'hidden' : 'flex')}>
        <div className="flex min-h-0 w-full flex-col">
          <ChatList activeId={activeId} />
        </div>
      </aside>
      <main className={cn('min-h-0 min-w-0 flex-1', activeId ? 'flex' : 'hidden lg:flex')}>{children}</main>
    </div>
  )
}

/** Sin chat abierto: una invitación a empezar. */
export function PasilloWelcome() {
  const t = useTranslations('pasillo')
  const [dialog, setDialog] = useState<'direct' | 'group' | null>(null)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
        <MessageSquare className="size-7" />
      </span>
      <div>
        <p className="text-base font-semibold text-fg">{t('welcomeTitle')}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">{t('welcomeBody')}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setDialog('direct')}>
          <MessageSquare />
          {t('newDirect')}
        </Button>
        <Button size="sm" variant="primary" onClick={() => setDialog('group')}>
          <Users />
          {t('newGroup')}
        </Button>
      </div>
      <PeopleDialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)} mode={dialog ?? 'direct'} />
    </div>
  )
}
