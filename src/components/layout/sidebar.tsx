'use client'

import type { CompanyData, OrgData, ProfileData } from '@/lib/types/layout'
import { SidebarBoards } from './sidebar-boards'
import { SidebarFooter } from './sidebar-footer'
import { SidebarNav } from './sidebar-nav'
import { useSidebar } from './sidebar-provider'

interface SidebarProps {
  profile: ProfileData
  org: OrgData
  companies: CompanyData[]
}

export function Sidebar({ profile, org, companies }: SidebarProps) {
  const { collapsed } = useSidebar()
  const innerMinWidth = collapsed ? 0 : 220

  return (
    <aside
      style={{
        width: collapsed ? '0px' : 'var(--sidebar-width, 220px)',
        minWidth: collapsed ? '0px' : 'var(--sidebar-width, 220px)',
        height: '100%',
        background: 'var(--bg-base)',
        borderRight: '0.5px solid var(--border-default)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          overflowX: 'hidden',
          minWidth: innerMinWidth,
        }}
      >
        <SidebarNav />
        <SidebarBoards companies={companies} orgSlug={org.slug} />
      </div>
      <SidebarFooter profile={profile} />
    </aside>
  )
}
