import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { getTranslations } from 'next-intl/server'
import { peekInvite } from './peek'

/**
 * La imagen grande que muestran WhatsApp, iMessage o Slack al pegar el enlace de una invitación: el
 * logotipo, quién invita (con sus iniciales), la cuenta en grande y «Unirme al equipo», sobre ciruela y
 * con el sello del isotipo asomando a la derecha. Sin una invitación vigente, la versión general.
 */
export const alt = 'Veltro'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const C = { ciruela: '#5B1F7A', tinta: '#2E0F3D', lila: '#C4A3F2', lilaClaro: '#DCC6F6', perla: '#FBF3EE', crema: '#FBF6F2', frambuesa: '#C2185B' }

/** El isotipo (sello y punta del check) del kit de marca, con el sello un tono más claro que el fondo. */
const SEAL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="150 23.3 724.3 851"><path fill="#6E2F92" d="M670.8 188.9A360 360 0 1 0 770.4 261.3L483.6 758L305.6 530.1L371.6 415.8L468.4 539.6Z"/><path fill="${C.frambuesa}" d="M686.2 162.4L765.4 25.2L871.4 86.4L786.2 233.9A390.6 390.6 0 0 0 686.2 162.4Z"/></svg>`

/** Geist (la letra de la app) desde Google Fonts; si no responde, queda la letra por defecto. */
async function geist(weight: 500 | 700) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Geist:wght@${weight}`, { next: { revalidate: 60 * 60 * 24 * 7 } })).text()
    const url = css.match(/src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/)?.[1]
    if (!url) return null
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 30 } })
    return res.ok ? await res.arrayBuffer() : null
  } catch {
    return null
  }
}

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase() || 'V'

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const t = await getTranslations('invite')
  const [peek, regular, bold, logo] = await Promise.all([
    peekInvite(token),
    geist(500),
    geist(700),
    readFile(join(process.cwd(), 'public/og/veltro-logotipo-blanco.png'))
      .then((b) => `data:image/png;base64,${b.toString('base64')}`)
      .catch(() => null),
  ])
  const pending = peek?.status === 'pending' ? peek : null
  const inviter = pending?.inviter?.fullName ?? null
  const account = pending?.accountName ?? null
  // el nombre de la cuenta en grande, pero que entre aunque sea largo
  const big = !account ? 84 : account.length > 28 ? 64 : account.length > 16 ? 84 : 112
  const fonts = [
    ...(regular ? [{ name: 'Geist', data: regular, weight: 500 as const, style: 'normal' as const }] : []),
    ...(bold ? [{ name: 'Geist', data: bold, weight: 700 as const, style: 'normal' as const }] : []),
  ]

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: C.ciruela, fontFamily: fonts.length ? 'Geist' : undefined }}>
        <img src={`data:image/svg+xml;utf8,${encodeURIComponent(SEAL)}`} width={600} height={705} style={{ position: 'absolute', right: -170, top: 18 }} alt="" />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', padding: '60px 72px' }}>
          {logo ? <img src={logo} width={200} height={58} alt="" /> : <div style={{ fontSize: 44, fontWeight: 700, color: C.perla }}>veltro</div>}

          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 860 }}>
            {inviter ? (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 76, height: 76, borderRadius: 38, background: C.lila, color: C.tinta, fontSize: 30, fontWeight: 700 }}>
                  {initials(inviter)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 22 }}>
                  <div style={{ fontSize: 34, fontWeight: 700, color: C.perla }}>{inviter}</div>
                  <div style={{ fontSize: 28, fontWeight: 500, color: C.lilaClaro }}>{t('ogInvitedYou')}</div>
                </div>
              </div>
            ) : null}
            <div style={{ display: 'flex', marginTop: inviter ? 22 : 0, fontSize: big, fontWeight: 700, lineHeight: 1.02, letterSpacing: -3, color: C.perla }}>
              {account ?? t('ogGeneric')}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: C.crema, color: C.tinta, borderRadius: 999, padding: '18px 34px', fontSize: 30, fontWeight: 700 }}>
              {t('ogJoin')} →
            </div>
            <div style={{ display: 'flex', fontSize: 24, fontWeight: 500, color: C.lilaClaro }}>{t('ogTagline')}</div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  )
}
