import { NextResponse } from 'next/server'
import { assertSignedIn } from '@/lib/revolut/http'

/** Connectivity check. Signed-in only, so it cannot be used to probe the API. */
export async function GET() {
  const authError = await assertSignedIn()
  if (authError) return authError
  return NextResponse.json({ ok: true, ping: 'revolut-api' })
}
