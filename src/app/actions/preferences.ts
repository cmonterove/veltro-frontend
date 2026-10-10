'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isLocale, LOCALE_COOKIE } from '@/i18n/config'
import { ACCOUNT_COOKIE } from '@/lib/session'

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return
  ;(await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) await supabase.from('profiles').update({ locale }).eq('id', user.id)

  revalidatePath('/', 'layout')
}

export async function setCurrentAccount(accountId: string) {
  ;(await cookies()).set(ACCOUNT_COOKIE, accountId, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  revalidatePath('/', 'layout')
}
