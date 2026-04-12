import { RegisterForm } from '@/components/auth/register-form'
import { LocaleSwitcher } from '@/components/shared/locale-switcher'
import { getTranslations } from 'next-intl/server'
import '../auth.css'

export default async function RegisterPage() {
  const t = await getTranslations('auth.registerPage')
  const tCommon = await getTranslations('common')
  const features = [t('feature1'), t('feature2'), t('feature3'), t('feature4')]

  return (
    <div className="auth-root">
      <div className="auth-left">
        <div className="auth-bg" />
        <div className="auth-bg-overlay" />
        <div className="auth-left-content">
          <div className="auth-logo">
            <div className="auth-logo-icon">
              <svg width="18" height="18" viewBox="0 0 13 13" fill="none" aria-hidden>
                <rect x="1" y="1" width="5" height="5" rx="1" fill="white" opacity="0.9" />
                <rect x="7" y="1" width="5" height="5" rx="1" fill="white" opacity="0.6" />
                <rect x="1" y="7" width="5" height="5" rx="1" fill="white" opacity="0.6" />
                <rect x="7" y="7" width="5" height="5" rx="1" fill="white" opacity="0.3" />
              </svg>
            </div>
            <span className="auth-logo-name">{tCommon('appName')}</span>
          </div>

          <div className="auth-hero">
            <div className="auth-hero-label">{t('heroLabel')}</div>
            <h1 className="auth-hero-title">
              {t('heroLine1')}
              <br />
              {t('heroLine2')} <span>{t('heroAccent')}</span>
            </h1>
            <p className="auth-hero-sub">{t('heroSub')}</p>
          </div>

          <div className="auth-features">
            {features.map((f) => (
              <div key={f} className="auth-feature">
                <div className="auth-feature-dot" />
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-locale">
          <LocaleSwitcher dark />
        </div>
        <RegisterForm />
      </div>
    </div>
  )
}
