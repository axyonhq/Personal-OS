import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

/**
 * Per-user request budgets for the OpenAI-backed routes.
 *
 * Middleware proves who is calling, but nothing capped how often. A stuck retry
 * loop or a leaked session could run up an unbounded OpenAI bill.
 *
 * This counter lives in module memory, so on serverless it is per-instance
 * rather than global. That is deliberate: it is a cheap brake on runaway loops,
 * not a billing control. Move it to Redis/Upstash if this ever needs to be exact.
 */
type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/** Stops the map growing without bound on a long-lived instance. */
function sweep(now: number) {
  if (buckets.size < 500) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now()
  sweep(now)

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }

  bucket.count += 1
  return { ok: true }
}

export type GuardFailure = { response: NextResponse; userId?: undefined }
export type GuardSuccess = { response?: undefined; userId: string }

/**
 * Confirm the caller is signed in and inside their budget for this route.
 *
 * Routes check auth directly rather than trusting middleware alone, so a future
 * matcher change cannot quietly expose an endpoint that spends money.
 */
export async function guardAiRoute(
  route: string,
  options?: { limit?: number; windowMs?: number },
): Promise<GuardFailure | GuardSuccess> {
  const { userId } = await auth()
  if (!userId) {
    return { response: NextResponse.json({ error: 'Sign in required' }, { status: 401 }) }
  }

  const limit = options?.limit ?? 30
  const windowMs = options?.windowMs ?? 60_000
  const result = rateLimit(`${route}:${userId}`, limit, windowMs)

  if (!result.ok) {
    return {
      response: NextResponse.json(
        { error: 'Too many requests. Give it a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
      ),
    }
  }

  return { userId }
}
