import { InviteForm } from '@/components/auth/invite-form'
import { LocaleSwitcher } from '@/components/shared/locale-switcher'

type Props = { params: { token: string } }

export default function InvitePage({ params }: Props) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex justify-end p-4">
        <LocaleSwitcher />
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <InviteForm token={params.token} />
      </div>
    </div>
  )
}
