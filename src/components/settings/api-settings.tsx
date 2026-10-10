'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import { Copy, KeyRound, Plus } from 'lucide-react'
import { useApp, canEdit } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createApiToken, revokeApiToken } from '@/app/actions/settings'
import { useDateLocale } from '@/lib/dates'
import { SettingsSection } from './section'

type Token = { id: string; name: string; token_prefix: string; last_used_at: string | null; created_at: string }

function CodeBlock({ code }: { code: string }) {
  const t = useTranslations('settings.api')
  return (
    <div className="group/code relative">
      <pre className="overflow-x-auto rounded-lg border border-line bg-sidebar p-3 pr-12 font-mono text-xs leading-relaxed text-fg scrollbar-thin">{code}</pre>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(code)
          toast.success(t('copied'))
        }}
        className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
        aria-label={t('copy')}
      >
        <Copy className="size-3.5" />
      </button>
    </div>
  )
}

export function ApiSettings({ tokens, baseUrl }: { tokens: Token[]; baseUrl: string }) {
  const t = useTranslations('settings.api')
  const locale = useDateLocale()
  const router = useRouter()
  const { workspaces } = useApp()
  const [name, setName] = useState('Claude Code')
  const [created, setCreated] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const slug = workspaces.find((w) => canEdit(w))?.slug ?? 'mi-espacio'

  const curl = `curl -X POST ${baseUrl}/api/v1/docs \\
  -H "Authorization: Bearer $VELTRO_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"workspace": "${slug}", "markdown": "# Sesión: refactor del login\\n\\n## Qué hicimos\\n- ..."}'`

  const claudeMd = `## Documentación en Veltro
${t('claudeMdIntro')}
- POST ${baseUrl}/api/v1/docs
- Header: Authorization: Bearer $VELTRO_TOKEN
- Body JSON: { "workspace": "${slug}", "markdown": "# <título>\\n\\n<contenido>" }
- GET ${baseUrl}/api/v1/workspaces ${t('claudeMdList')}`

  return (
    <div>
      <SettingsSection title={t('title')} description={t('description')}>
        <div className="flex max-w-xl flex-col gap-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              start(async () => {
                const res = await createApiToken(name)
                if (res.ok) {
                  setCreated(res.token)
                  router.refresh()
                } else toast.error(t('error'))
              })
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')} maxLength={80} />
            <Button type="submit" variant="primary" loading={pending}>
              <Plus />
              {t('create')}
            </Button>
          </form>

          {created ? (
            <div className="flex flex-col gap-2 rounded-xl border border-accent-mid/40 bg-accent-soft p-4">
              <p className="text-sm font-medium text-accent-ink">{t('createdTitle')}</p>
              <CodeBlock code={created} />
              <p className="text-xs text-fg-muted">{t('createdHint')}</p>
            </div>
          ) : null}

          {tokens.length ? (
            <ul className="flex flex-col divide-y divide-line border-y border-line">
              {tokens.map((tok) => (
                <li key={tok.id} className="flex items-center gap-3 py-2.5">
                  <KeyRound className="size-4 text-fg-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">{tok.name}</p>
                    <p className="font-mono text-xs text-fg-subtle">
                      {tok.token_prefix}… ·{' '}
                      {tok.last_used_at
                        ? t('lastUsed', { when: formatDistanceToNowStrict(new Date(tok.last_used_at), { addSuffix: true, locale }) })
                        : t('neverUsed')}
                    </p>
                  </div>
                  <Button
                    variant="danger-ghost"
                    size="sm"
                    onClick={() =>
                      start(async () => {
                        await revokeApiToken(tok.id)
                        toast.success(t('revoked'))
                        router.refresh()
                      })
                    }
                  >
                    {t('revoke')}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection title={t('howTitle')} description={t('howDescription')}>
        <div className="flex max-w-2xl flex-col gap-4">
          <p className="text-sm text-fg-muted">{t('step1')}</p>
          <CodeBlock code={`export VELTRO_TOKEN="vlt_…"`} />
          <p className="text-sm text-fg-muted">{t('step2')}</p>
          <CodeBlock code={claudeMd} />
          <p className="text-sm text-fg-muted">{t('step3')}</p>
          <CodeBlock code={curl} />
        </div>
      </SettingsSection>
    </div>
  )
}
