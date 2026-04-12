export interface OrgData {
  id: string
  name: string
  slug: string
  logo_url: string | null
}

export interface CompanyData {
  id: string
  name: string
  slug: string
  logo_url: string | null
  role: string
}

export interface ProfileData {
  id: string
  full_name: string
  avatar_url: string | null
  role: string
  locale: string
}
