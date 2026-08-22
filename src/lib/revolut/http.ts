import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status })
}

/**
 * Confirm a signed-in caller before touching banking data.
 *
 * These routes used to be public, gated only by a shared app secret that also
 * sits in browser localStorage. Middleware now covers them, but each route
 * checks too, so a future matcher change cannot silently reopen the account
 * data to the internet.
 */
export async function assertSignedIn(): Promise<NextResponse | null> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  return null
}

/** Returns an error response if the app secret is missing/invalid; otherwise null. */
export function assertAppSecret(req: NextRequest): NextResponse | null {
  const expected = process.env.REVOLUT_APP_SECRET?.trim()
  if (!expected) {
    return NextResponse.json(
      { error: 'REVOLUT_APP_SECRET is not configured on the server.' },
      { status: 503 },
    )
  }
  const provided = req.headers.get('x-revolut-app-secret')
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: 'Invalid or missing app secret.' }, { status: 401 })
  }
  return null
}
