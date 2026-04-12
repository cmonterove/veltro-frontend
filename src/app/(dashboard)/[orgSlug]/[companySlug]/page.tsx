import { redirect } from 'next/navigation'

interface Props {
  params: { orgSlug: string; companySlug: string }
}

export default async function CompanyPage({ params }: Props) {
  const { orgSlug, companySlug } = params
  redirect(`/${orgSlug}/${companySlug}/boards`)
}
