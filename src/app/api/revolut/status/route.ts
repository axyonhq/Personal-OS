import { NextRequest, NextResponse } from 'next/server'
import { assertAppSecret, assertSignedIn, jsonError } from '@/lib/revolut/http'
import {
  createRevolutClient,
  isRevolutConfigured,
  refreshTokenFromRequest,
} from '@/lib/revolut/client'

export async function GET(req: NextRequest) {
  try {
    const signedInError = await assertSignedIn()
    if (signedInError) return signedInError

    const secretError = assertAppSecret(req)
    if (secretError) return secretError

    const refreshToken = refreshTokenFromRequest(req)
    const status = isRevolutConfigured(Boolean(refreshToken))

    let authOk = false
    let authError = ''
    let refreshTokenRotated: string | null = null

    if (status.serverReady && refreshToken) {
      try {
        const client = createRevolutClient(refreshToken)
        await client.listAccounts()
        authOk = true
        refreshTokenRotated = client.getRotatedRefreshToken()
      } catch (error) {
        authError = error instanceof Error ? error.message : 'Auth failed'
      }
    }

    const payload: Record<string, unknown> = {
      ok: status.serverReady && authOk,
      serverReady: status.serverReady,
      env: status.env,
      missing: status.missing,
      hasRefreshToken: Boolean(refreshToken),
      authOk,
      authError: authError || undefined,
    }
    if (refreshTokenRotated) payload.refreshToken = refreshTokenRotated

    return NextResponse.json(payload)
  } catch (error) {
    console.error('revolut status failed', error)
    const message = error instanceof Error ? error.message : 'Status check failed'
    return jsonError(500, message)
  }
}
