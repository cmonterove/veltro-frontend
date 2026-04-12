'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useState, useTransition } from 'react'

const COLORS = [
  '#1a3a2e',
  '#2d8a6a',
  '#1d4ed8',
  '#7c3aed',
  '#db2777',
  '#d97706',
  '#dc2626',
  '#0891b2',
  '#059669',
  '#4f46e5',
  '#ea580c',
  '#0f172a',
]

interface Props {
  onClose: () => void
  onSubmit: (formData: FormData) => Promise<{ error?: string } | void>
}

export function CreateBoardModal({ onClose, onSubmit }: Props) {
  const t = useTranslations('boards')
  const tModal = useTranslations('boards.createModal')
  const id = useId()
  const [selectedColor, setSelectedColor] = useState(COLORS[0])
  const [visibility, setVisibility] = useState<'company' | 'private' | 'groups'>('company')
  const [nameValue, setNameValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!nameValue.trim()) {
      setError(tModal('nameRequired'))
      return
    }

    const formData = new FormData(e.currentTarget)
    formData.set('color', selectedColor)
    formData.set('visibility', visibility)

    startTransition(async () => {
      const result = await onSubmit(formData)
      if (result && 'error' in result && result.error) setError(result.error)
    })
  }

  const visibilityOptions = [
    {
      value: 'company' as const,
      label: tModal('visCompany'),
      icon: '🏢',
      desc: tModal('visCompanyDesc'),
    },
    {
      value: 'private' as const,
      label: tModal('visPrivate'),
      icon: '🔒',
      desc: tModal('visPrivateDesc'),
    },
    {
      value: 'groups' as const,
      label: tModal('visGroups'),
      icon: '👥',
      desc: tModal('visGroupsDesc'),
    },
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        animation: 'fadeIn .15s ease',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}} @keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'var(--bg-base)',
          borderRadius: '14px',
          border: '0.5px solid var(--border-default)',
          overflow: 'hidden',
          animation: 'slideUp .2s ease',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '18px 20px 16px',
            borderBottom: '0.5px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 id={`${id}-title`} style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {tModal('title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              border: '0.5px solid var(--border-default)',
              background: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-surface)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ height: '6px', background: selectedColor, transition: 'background .2s' }} />

        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          <div style={{ marginBottom: '18px' }}>
            <label
              htmlFor={`${id}-name`}
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {t('create.nameLabel')} *
            </label>
            <input
              id={`${id}-name`}
              name="name"
              type="text"
              autoFocus
              placeholder={t('create.namePlaceholder')}
              value={nameValue}
              onChange={(e) => {
                setNameValue(e.target.value)
                if (error) setError(null)
              }}
              style={{
                width: '100%',
                height: '40px',
                padding: '0 12px',
                borderRadius: '8px',
                border: `0.5px solid ${error ? '#dc2626' : 'var(--border-medium)'}`,
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color .15s',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--primary-mid)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = error ? '#dc2626' : 'var(--border-medium)'
              }}
            />
            {error ? (
              <p
                style={{
                  fontSize: '12px',
                  color: '#dc2626',
                  marginTop: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </p>
            ) : null}
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label
              htmlFor={`${id}-desc`}
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {t('create.descriptionLabel')}{' '}
              <span style={{ fontWeight: 400, opacity: 0.6 }}>{tModal('optional')}</span>
            </label>
            <textarea
              id={`${id}-desc`}
              name="description"
              placeholder={t('create.descriptionPlaceholder')}
              rows={2}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '0.5px solid var(--border-medium)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                lineHeight: 1.5,
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--primary-mid)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border-medium)'
              }}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {t('create.colorLabel')}
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    background: color,
                    border: selectedColor === color ? '3px solid var(--text-primary)' : '3px solid transparent',
                    cursor: 'pointer',
                    transition: 'transform .1s, border .1s',
                    outline: 'none',
                    boxShadow:
                      selectedColor === color ? `0 0 0 2px var(--bg-base), 0 0 0 4px ${color}` : 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.15)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)'
                  }}
                  title={color}
                />
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {tModal('visibility')}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {visibilityOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setVisibility(opt.value)}
                  style={{
                    padding: '10px 8px',
                    borderRadius: '8px',
                    border: `1.5px solid ${visibility === opt.value ? 'hsl(var(--primary))' : 'var(--border-default)'}`,
                    background: visibility === opt.value ? 'var(--primary-light)' : 'var(--bg-surface)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all .15s',
                  }}
                >
                  <div style={{ fontSize: '18px', marginBottom: '4px' }}>{opt.icon}</div>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: visibility === opt.value ? 'hsl(var(--primary))' : 'var(--text-primary)',
                      marginBottom: '2px',
                    }}
                  >
                    {opt.label}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', lineHeight: 1.3 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                height: '40px',
                borderRadius: '8px',
                border: '0.5px solid var(--border-medium)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background .15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-surface)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {tModal('cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending || !nameValue.trim()}
              style={{
                flex: 2,
                height: '40px',
                borderRadius: '8px',
                background:
                  isPending || !nameValue.trim() ? 'var(--border-default)' : 'hsl(var(--primary))',
                color: 'white',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isPending || !nameValue.trim() ? 'not-allowed' : 'pointer',
                transition: 'background .15s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
              onMouseEnter={(e) => {
                if (!isPending && nameValue.trim()) e.currentTarget.style.background = 'var(--primary-mid)'
              }}
              onMouseLeave={(e) => {
                if (!isPending && nameValue.trim()) e.currentTarget.style.background = 'hsl(var(--primary))'
              }}
            >
              {isPending ? (
                <>
                  <svg
                    style={{ animation: 'spin .6s linear infinite' }}
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    aria-hidden
                  >
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  {tModal('creating')}
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  {t('create.submitButton')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
