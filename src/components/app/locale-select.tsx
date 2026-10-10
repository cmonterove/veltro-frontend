'use client'

import { useLocale } from 'next-intl'
import { useTransition } from 'react'
import { Languages } from 'lucide-react'
import { setLocale } from '@/app/actions/preferences'
import { localeNames, locales } from '@/i18n/config'
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/components/ui/menu'
import { Button } from '@/components/ui/button'

export function LocaleSelect() {
  const locale = useLocale()
  const [pending, start] = useTransition()

  return (
    <Menu>
      <MenuTrigger render={<Button variant="ghost" size="sm" loading={pending} />}>
        <Languages />
        {localeNames[locale as keyof typeof localeNames]}
      </MenuTrigger>
      <MenuContent align="end" className="min-w-40">
        <MenuRadioGroup value={locale} onValueChange={(v) => start(() => setLocale(String(v)))}>
          {locales.map((l) => (
            <MenuRadioItem key={l} value={l}>
              {localeNames[l]}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}
