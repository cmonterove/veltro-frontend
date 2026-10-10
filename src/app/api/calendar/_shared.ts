import 'server-only'
import { NextResponse } from 'next/server'
import { GoogleAuthRevokedError, GoogleNotConnectedError } from '@/lib/google/calendar'

export function googleErrorResponse(e: unknown) {
  if (e instanceof GoogleNotConnectedError) return NextResponse.json({ error: 'google_not_connected' }, { status: 409 })
  if (e instanceof GoogleAuthRevokedError) return NextResponse.json({ error: 'google_auth_revoked' }, { status: 409 })
  console.error('[calendar]', e)
  return NextResponse.json({ error: 'google_error' }, { status: 502 })
}
