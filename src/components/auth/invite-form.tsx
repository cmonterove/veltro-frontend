'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslations } from 'next-intl'

export function InviteForm({ token }: { token: string }) {
  const t = useTranslations('auth.invite')

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle', { orgName: '—' })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input type="hidden" name="token" value={token} aria-hidden />
        <form className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">{t('fullNameLabel')}</Label>
            <Input id="fullName" name="fullName" placeholder={t('fullNamePlaceholder')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('passwordLabel')}</Label>
            <Input id="password" name="password" type="password" placeholder={t('passwordPlaceholder')} />
          </div>
          <Button type="submit" className="w-full">
            {t('submitButton')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
