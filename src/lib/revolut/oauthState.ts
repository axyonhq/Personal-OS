import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const OAUTH_STATE_COOKIE = 'revolut_oauth_state'
/** Auth codes expire in about 2 minutes, so the flow has a short lifetime. */
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60

/**
 * Secret used to sign the OAuth state value. Falls back to other server-only
 * secrets so the flow still works when no dedicated secret is configured.
 */
function stateSecret(): string {
  const secret =
    process.env.REVOLUT_OAUTH_STATE_SECRET?.trim() ||
    process.env.REVOLUT_APP_SECRET?.trim() ||
    process.env.CLERK_SECRET_KEY?.trim()
  if (!secret) {
    throw new Error(
      'Set REVOLUT_OAUTH_STATE_SECRET (or REVOLUT_APP_SECRET) to secure the Revolut OAuth flow.',
    )
  }
  return secret
}

function sign(nonce: string): string {
  return createHmac('sha256', stateSecret()).update(nonce).digest('hex')
}

/**
 * Build a `nonce.signature` state value. The signature means a tampered nonce
 * is rejected even before the cookie comparison.
 */
export function createOAuthState(): string {
  const nonce = randomBytes(24).toString('hex')
  return `${nonce}.${sign(nonce)}`
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * A callback is genuine only when the returned state matches the cookie set at
 * the start of the flow and still carries a valid signature. Without this an
 * attacker could complete OAuth against their own Revolut account and bind the
 * resulting token to someone else's browser.
 */
export function verifyOAuthState(
  returned: string | null | undefined,
  cookieValue: string | null | undefined,
): boolean {
  if (!returned || !cookieValue) return false
  if (!safeEqual(returned, cookieValue)) return false

  const [nonce, signature] = returned.split('.')
  if (!nonce || !signature) return false
  try {
    return safeEqual(signature, sign(nonce))
  } catch {
    return false
  }
}
