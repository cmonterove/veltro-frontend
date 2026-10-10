import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { WeekView } from '@/components/calendar/week-view'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('calendar') }
}

export default function CalendarPage() {
  return (
    <div className="h-full">
      <WeekView />
    </div>
  )
}
