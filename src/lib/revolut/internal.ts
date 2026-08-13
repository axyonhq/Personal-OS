/** True when money only moved between accounts this business owns. */
export function isInternalRevolutTransaction(
  txn: {
    type?: string
    legs?: Array<{ account_id?: string; amount?: number }>
  },
  ownAccountIds: Set<string>,
): boolean {
  const type = (txn.type || '').toLowerCase()
  const legs = (txn.legs || []).filter(
    (leg) => typeof leg.amount === 'number' && leg.amount !== 0 && Boolean(leg.account_id),
  )
  const ownLegs = legs.filter((leg) => ownAccountIds.has(leg.account_id as string))

  if (type === 'exchange' && ownLegs.length >= 1) return true
  if (ownLegs.length >= 2) return true
  return false
}

/** Client-side fallback when a queued row has no `internal` flag. */
export function isInternalRevolutReviewItem(item: {
  type?: string
  merchant?: string
  description?: string
  reference?: string
  cardLastFour?: string
  internal?: boolean
}): boolean {
  if (item.internal) return true
  const type = (item.type || '').toLowerCase()
  if (type === 'exchange') return true
  const blob = `${item.merchant || ''} ${item.description || ''} ${item.reference || ''}`.toLowerCase()
  if (/\b(to|from)\s+(savings|pockets?|vaults?|aud|usd|eur|gbp|idr|sgd|nzd|cad|jpy)\b/.test(blob)) {
    return true
  }
  if (/^(to|from)\s+[a-z]{3}$/.test((item.description || '').trim().toLowerCase())) return true
  return false
}
