import { create } from 'zustand'

type OrganizationState = {
  orgSlug: string | null
  setOrgSlug: (slug: string | null) => void
}

export const useOrganizationStore = create<OrganizationState>((set) => ({
  orgSlug: null,
  setOrgSlug: (slug) => set({ orgSlug: slug }),
}))
