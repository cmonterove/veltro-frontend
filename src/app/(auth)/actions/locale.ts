'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { locales, type Locale } from '@/i18n/routing'

export async function updateUserLocale(locale: Locale) {
  if (!locales.includes(locale)) return { error: 'Invalid locale' }

  const cookieStore = await cookies()
  cookieStore.set('veltro-locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    await supabase.from('profiles').update({ locale }).eq('id', user.id)
  }

  return { success: true }
}
