import { redirect } from 'next/navigation'
import { getUser } from '@/lib/session'

export default async function RootPage() {
  redirect((await getUser()) ? '/home' : '/login')
}
