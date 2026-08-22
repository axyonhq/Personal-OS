import { NextRequest, NextResponse } from 'next/server'
import { assertAppSecret, assertSignedIn, jsonError } from '@/lib/revolut/http'
import {
  createRevolutClient,
  isRevolutConfigured,
  refreshTokenFromRequest,
  withRotatedToken,
} from '@/lib/revolut/client'

export async function GET(req: NextRequest) {
  try {
    const authError = await assertSignedIn()
    if (authError) return authError

    const secretError = assertAppSecret(req)
    if (secretError) return secretError

    const refreshToken = refreshTokenFromRequest(req)
    const status = isRevolutConfigured(Boolean(refreshToken))
    if (!status.serverReady) {
      return jsonError(
        503,
        `Revolut is not fully configured. Missing: ${status.missing.join(', ')}`,
      )
    }
    if (!refreshToken) {
      return jsonError(
        401,
        'Missing Revolut refresh token. Click Reconnect in the app to sign in again.',
      )
    }

    const displayCurrency = (req.nextUrl.searchParams.get('to') || 'AUD').toUpperCase()

    const client = createRevolutClient(refreshToken)
    const accounts = await client.listAccounts()
    const rateCache = new Map<string, { rate: number }>()

    const enriched = []
    for (const a of accounts) {
      const currency = (a.currency || '').toUpperCase()
      const balance = typeof a.balance === 'number' ? a.balance : 0
      let displayBalance = balance
      let rate = 1

      if (currency && currency !== displayCurrency) {
        const cacheKey = `${currency}:${displayCurrency}`
        if (!rateCache.has(cacheKey)) {
          rateCache.set(
            cacheKey,
            await client.getExchangeRate(currency, displayCurrency, 1),
          )
        }
        const fx = rateCache.get(cacheKey)!
        rate = fx.rate
        displayBalance = Math.round(balance * rate * 100) / 100
      }

      enriched.push({
        id: a.id,
        name: a.name,
        balance,
        currency,
        state: a.state,
        displayCurrency,
        displayBalance,
        rate,
      })
    }

    return NextResponse.json(
      withRotatedToken(
        {
          displayCurrency,
          accounts: enriched,
          rates: Object.fromEntries(
            [...rateCache.entries()].map(([key, value]) => [key, value.rate]),
          ),
        },
        client,
      ),
    )
  } catch (error) {
    console.error('revolut accounts failed', error)
    const message = error instanceof Error ? error.message : 'Failed to list accounts'
    return jsonError(502, message)
  }
}
