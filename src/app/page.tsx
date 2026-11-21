import { redirect } from 'next/navigation'
import { getUser } from '@/lib/session'

export default async function RootPage() {
  // sin sesión válida pasa por /auth/expired, que borra cookies rechazadas antes del login
  redirect((await getUser()) ? '/home' : '/auth/expired')
}
