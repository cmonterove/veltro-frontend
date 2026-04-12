'use client'

import { createClient } from '@/lib/supabase/client'
import type { CompanyData } from '@/lib/types/layout'
import { useTranslations } from 'next-intl'
import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

interface Board {
  id: string
  name: string
  color: string
  company_id: string
}

interface Props {
  companies: CompanyData[]
  orgSlug: string
}

export function SidebarBoards({ companies, orgSlug }: Props) {
  const t = useTranslations('dashboard.layout')
  const [boards, setBoards] = useState<Board[]>([])
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(
    () => new Set(companies.map((c) => c.id))
  )
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  const companyIdsKey = useMemo(() => [...companies.map((c) => c.id)].sort().join(','), [companies])

  useEffect(() => {
    if (!companyIdsKey) {
      setExpandedCompanies(new Set())
      return
    }
    setExpandedCompanies(new Set(companyIdsKey.split(',')))
  }, [companyIdsKey])

  useEffect(() => {
    async function loadBoards() {
      const supabase = createClient()
      const companyIds = companies.map((c) => c.id)
      if (!companyIds.length) {
        setBoards([])
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('boards')
        .select('id, name, color, company_id')
        .in('company_id', companyIds)
        .order('name')

      setBoards(data ?? [])
      setLoading(false)
    }
    loadBoards()
  }, [companyIdsKey, companies])

  function toggleCompany(id: string) {
    setExpandedCompanies((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!companies.length) return null

  return (
    <div style={{ flex: 1, padding: '0 0 8px' }}>
      <div style={{ height: '0.5px', background: 'var(--border-default)', margin: '4px 8px 8px' }} />

      {companies.map((company) => {
        const companyBoards = boards.filter((b) => b.company_id === company.id)
        const isExpanded = expandedCompanies.has(company.id)

        return (
          <div key={company.id} style={{ marginBottom: '4px' }}>
            <button
              type="button"
              onClick={() => toggleCompany(company.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                width: '100%',
                padding: '4px 12px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary)',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {company.name}
              </span>
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-tertiary)"
                strokeWidth="2.5"
                style={{
                  flexShrink: 0,
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform .15s',
                }}
                aria-hidden
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {isExpanded && (
              <div style={{ padding: '0 8px' }}>
                {loading ? (
                  <div style={{ padding: '4px 8px' }}>
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        style={{
                          height: '28px',
                          background: 'var(--bg-surface)',
                          borderRadius: '6px',
                          marginBottom: '2px',
                          opacity: 0.6,
                        }}
                      />
                    ))}
                  </div>
                ) : companyBoards.length === 0 ? (
                  <div style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    {t('sidebarNoBoards')}
                  </div>
                ) : (
                  companyBoards.map((board) => {
                    const href = `/${orgSlug}/${company.slug}/board/${board.id}` as Route
                    const isActive = pathname === href
                    return (
                      <Link
                        key={board.id}
                        href={href}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '5px 8px',
                          borderRadius: '6px',
                          textDecoration: 'none',
                          marginBottom: '1px',
                          background: isActive ? 'var(--primary-light)' : 'transparent',
                          transition: 'background .1s',
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.background = 'var(--bg-surface)'
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <div
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '2px',
                            background: board.color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: '12px',
                            color: isActive ? 'hsl(var(--primary))' : 'var(--text-secondary)',
                            fontWeight: isActive ? 500 : 400,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                        >
                          {board.name}
                        </span>
                      </Link>
                    )
                  })
                )}

                <Link
                  href={`/${orgSlug}/${company.slug}/boards?new=1` as Route}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '5px 8px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    color: 'var(--text-tertiary)',
                    fontSize: '12px',
                    marginTop: '2px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-surface)'
                    e.currentTarget.style.color = 'var(--text-secondary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--text-tertiary)'
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  {t('sidebarAddBoard')}
                </Link>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
