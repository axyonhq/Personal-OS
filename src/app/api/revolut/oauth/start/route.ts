import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/revolut/http'
import { revolutEnv, requireEnv } from '@/lib/revolut/client'
import {
  createOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
} from '@/lib/revolut/oauthState'

/** Redirects to Revolut consent (READ scope). Requires sign-in via middleware. */
export async function GET() {
  try {
    const clientId = requireEnv('REVOLUT_CLIENT_ID')
    const redirectUri = requireEnv('REVOLUT_REDIRECT_URI')
    const scope = 'READ'
    const base =
      revolutEnv() === 'sandbox'
        ? 'https://sandbox-business.revolut.com/app-confirm'
        : 'https://business.revolut.com/app-confirm'

    const state = createOAuthState()

    const url = new URL(base)
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', scope)
    url.searchParams.set('state', state)

    const response = NextResponse.redirect(url.toString())
    // Lax so the cookie still rides along on Revolut's top-level redirect back.
    response.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/revolut/oauth',
      maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    })
    return response
  } catch (error) {
    console.error('revolut oauth start failed', error)
    const message = error instanceof Error ? error.message : 'OAuth start failed'
    return jsonError(503, message)
  }
}
