import { NextRequest, NextResponse } from 'next/server'
import { assertAppSecret, jsonError } from '@/lib/revolut/http'
import {
  createRevolutClient,
  dayBoundsIso,
  isRevolutConfigured,
  refreshTokenFromRequest,
  withRotatedToken,
} from '@/lib/revolut/client'
import { isInternalRevolutTransaction } from '@/lib/revolut/internal'

function normalizeAccountIds(raw: string | null) {
  if (!raw) return []
  return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))]
}

function normalizeTransaction(
  txn: {
    id: string
    type?: string
    state?: string
    reference?: string
    created_at?: string
    completed_at?: string
    merchant?: { name?: string }
    card?: { card_number?: string }
    legs?: Array<{
      leg_id: string
      account_id: string
      amount?: number
      currency?: string
      description?: string
    }>
  },
  accountNames: Map<string, string>,
  dateKey: string,
  accountFilter: Set<string>,
  ownAccountIds: Set<string>,
) {
  if (isInternalRevolutTransaction(txn, ownAccountIds)) return []

  const merchant = txn.merchant?.name?.trim() || ''
  const items = []

  for (const leg of txn.legs || []) {
    if (!accountFilter.has(leg.account_id)) continue
    if (typeof leg.amount !== 'number' || leg.amount === 0) continue

    const direction = leg.amount < 0 ? 'out' : 'in'
    const amount = Math.round(Math.abs(leg.amount) * 100) / 100
    const description = leg.description?.trim() || merchant || txn.reference || txn.type

    items.push({
      id: `${txn.id}:${leg.leg_id}`,
      revolutTransactionId: txn.id,
      legId: leg.leg_id,
      accountId: leg.account_id,
      accountName: accountNames.get(leg.account_id) || 'Account',
      date: dateKey,
      createdAt: txn.completed_at || txn.created_at,
      amount,
      currency: leg.currency,
      direction,
      type: txn.type,
      state: txn.state,
      merchant: merchant || description,
      description,
      reference: txn.reference,
      cardLastFour: txn.card?.card_number?.slice(-4),
      internal: false,
    })
  }

  return items
}

export async function GET(req: NextRequest) {
  try {
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

    const date = req.nextUrl.searchParams.get('date')
    const accountIds = normalizeAccountIds(req.nextUrl.searchParams.get('accounts'))

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError(400, 'Query param "date" (YYYY-MM-DD) is required.')
    }
    if (accountIds.length === 0) {
      return jsonError(400, 'Query param "accounts" (comma-separated IDs) is required.')
    }

    const client = createRevolutClient(refreshToken)
    const { from, to } = dayBoundsIso(date)
    const accounts = await client.listAccounts()
    const accountNames = new Map(accounts.map((a) => [a.id, a.name]))
    const accountFilter = new Set(accountIds)
    const ownAccountIds = new Set(accounts.map((a) => a.id))

    const unknown = accountIds.filter((id) => !accountNames.has(id))
    if (unknown.length) {
      return jsonError(400, `Unknown account id(s): ${unknown.join(', ')}`)
    }

    const seen = new Set<string>()
    const transactions: ReturnType<typeof normalizeTransaction>[number][] = []

    for (const accountId of accountIds) {
      const raw = await client.listTransactionsForAccount({ accountId, from, to })
      for (const txn of raw) {
        for (const item of normalizeTransaction(
          txn,
          accountNames,
          date,
          accountFilter,
          ownAccountIds,
        )) {
          if (seen.has(item.id)) continue
          seen.add(item.id)
          transactions.push(item)
        }
      }
    }

    transactions.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

    return NextResponse.json(
      withRotatedToken(
        {
          date,
          from,
          to,
          count: transactions.length,
          transactions,
        },
        client,
      ),
    )
  } catch (error) {
    console.error('revolut transactions failed', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch transactions'
    return jsonError(502, message)
  }
}
