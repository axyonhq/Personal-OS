import type { ExpenseCategory, FinanceLedger, RevolutReviewItem, SpendEntry } from '../types'
import { childCategories, topLevelCategories } from './finance'

export type RevolutCategoryPick = {
  topId: string
  childId: string
}

export type RevolutCategorySuggestion = RevolutCategoryPick & {
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

const UNEXPECTED = '__unexpected__'

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(raw: string): string[] {
  return normalize(raw)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOP.has(t))
}

const STOP = new Set([
  'the',
  'and',
  'for',
  'from',
  'with',
  'payment',
  'transfer',
  'card',
  'revolut',
  'ltd',
  'pty',
  'inc',
  'llc',
  'www',
  'com',
  'app',
])

type Pack = { keys: string[]; names: string[] }

const PACKS: Pack[] = [
  {
    keys: [
      'mcdonald',
      'mcdonalds',
      'starbucks',
      'cafe',
      'coffee',
      'restaurant',
      'grabfood',
      'go food',
      'gofood',
      'uber eats',
      'ubereats',
      'deliveroo',
      'warung',
      'grocery',
      'supermarket',
      'woolworths',
      'coles',
      'aldi',
      'kfc',
      'pizza',
      'sushi',
      'bakery',
      'chipotle',
      'nandos',
      'hungry jack',
      'grilld',
      'menu',
      'eats',
      'foodpanda',
      'doordash',
      'convenience',
      '7 eleven',
      'seven eleven',
      'circle k',
      'minimart',
      'indomaret',
      'alfamart',
      'tokopedia',
    ],
    names: ['food', 'drink', 'food and drink', 'groceries', 'eating'],
  },
  {
    keys: ['bar', 'pub', 'beer', 'wine', 'cocktail', 'alcohol', 'bottle', 'liquor', 'nightclub'],
    names: ['drink', 'drinks', 'food and drink', 'alcohol'],
  },
  {
    keys: [
      'grab',
      'gojek',
      'uber',
      'taxi',
      'bolt',
      'petrol',
      'shell',
      'bp ',
      'parking',
      'toll',
      'train',
      'bus',
      'lyft',
      'transit',
    ],
    names: ['transport', 'travel', 'rides', 'uber', 'commute'],
  },
  {
    keys: [
      'netflix',
      'spotify',
      'youtube',
      'icloud',
      'adobe',
      'openai',
      'anthropic',
      'chatgpt',
      'cursor',
      'apple',
      'google one',
      'prime video',
      'disney',
      'audible',
      'notion',
      'icloud',
    ],
    names: ['bills', 'subscription', 'subs', 'software'],
  },
  {
    keys: ['gym', 'fitness', 'pharmacy', 'chemist', 'hospital', 'dentist', 'doctor', 'physio'],
    names: ['health', 'fitness', 'medical', 'gym'],
  },
  {
    keys: ['uniqlo', 'zara', 'h and m', 'amazon', 'ikea', 'target', 'kmart', 'cotton on', 'shopee', 'tokopedia'],
    names: ['shopping', 'clothes', 'clothing'],
  },
  {
    keys: ['airbnb', 'hotel', 'booking', 'flight', 'airline', 'qantas', 'jetstar'],
    names: ['travel', 'holiday', 'flights'],
  },
  {
    keys: ['rent', 'landlord', 'airbnb', 'apartment'],
    names: ['rent', 'housing', 'home'],
  },
]

function merchantText(item: Pick<RevolutReviewItem, 'merchant' | 'description' | 'reference'>): string {
  return [item.merchant, item.description, item.reference].filter(Boolean).join(' ')
}

function spendHaystack(spend: SpendEntry): string {
  return [spend.label, spend.note].filter(Boolean).join(' ')
}

function pickFromCategoryId(
  categoryId: string,
  ledger: FinanceLedger,
): RevolutCategoryPick | null {
  const cat = ledger.categories.find((c) => c.id === categoryId)
  if (!cat) return null
  if (cat.parentId) return { topId: cat.parentId, childId: cat.id }
  return { topId: cat.id, childId: '' }
}

function categoryNameHits(query: string, cats: ExpenseCategory[]): ExpenseCategory | null {
  const q = normalize(query)
  if (!q) return null
  let best: { cat: ExpenseCategory; score: number } | null = null
  for (const cat of cats) {
    const name = normalize(cat.name)
    if (!name) continue
    let score = 0
    if (q === name) score = 8
    else if (q.includes(name) && name.length >= 4) score = 5
    else if (name.includes(q) && q.length >= 4) score = 4
    else {
      const shared = tokens(q).filter((t) => name.split(' ').includes(t)).length
      if (shared > 0) score = shared
    }
    if (score > 0 && (!best || score > best.score)) best = { cat, score }
  }
  return best?.cat ?? null
}

function historyMatch(
  item: RevolutReviewItem,
  ledger: FinanceLedger,
): { categoryId: string; hits: number } | null {
  const merchant = normalize(item.merchant || item.description || '')
  if (merchant.length < 4) return null
  const counts = new Map<string, number>()
  for (const spend of ledger.spends) {
    if (spend.kind !== 'category' || !spend.categoryId) continue
    const hay = normalize(spendHaystack(spend))
    if (!hay) continue
    if (hay.includes(merchant)) {
      counts.set(spend.categoryId, (counts.get(spend.categoryId) || 0) + 2)
      continue
    }
    const shared = tokens(merchant).filter((t) => hay.split(' ').includes(t)).length
    if (shared >= 2) counts.set(spend.categoryId, (counts.get(spend.categoryId) || 0) + 1)
  }
  let best: { categoryId: string; hits: number } | null = null
  for (const [categoryId, hits] of counts) {
    if (!best || hits > best.hits) best = { categoryId, hits }
  }
  return best
}

function packMatch(query: string, ledger: FinanceLedger): ExpenseCategory | null {
  const q = ` ${normalize(query)} `
  const tops = topLevelCategories(ledger)
  const all = ledger.categories
  for (const pack of PACKS) {
    if (!pack.keys.some((key) => q.includes(` ${normalize(key)} `) || q.includes(normalize(key)))) {
      continue
    }
    const byName = all.find((c) => pack.names.includes(normalize(c.name)))
    if (byName) return byName
    const fuzzy = categoryNameHits(pack.names.join(' '), [...tops, ...all])
    if (fuzzy) return fuzzy
  }
  return null
}

export function suggestRevolutCategory(
  item: RevolutReviewItem,
  ledger: FinanceLedger,
): RevolutCategorySuggestion | null {
  if (item.direction !== 'out') return null
  const query = merchantText(item)
  const tops = topLevelCategories(ledger)
  if (tops.length === 0) return null

  const history = historyMatch(item, ledger)
  if (history) {
    const pick = pickFromCategoryId(history.categoryId, ledger)
    if (pick) {
      const cat = ledger.categories.find((c) => c.id === (pick.childId || pick.topId))
      return {
        ...pick,
        confidence: history.hits >= 4 ? 'high' : 'medium',
        reason: cat ? `Same as last ${cat.name} spend` : 'Matched a past spend',
      }
    }
  }

  const named = categoryNameHits(query, ledger.categories)
  if (named) {
    const pick = pickFromCategoryId(named.id, ledger)
    if (pick) {
      return {
        ...pick,
        confidence: 'medium',
        reason: `Looks like ${named.name}`,
      }
    }
  }

  const packed = packMatch(query, ledger)
  if (packed) {
    const pick = pickFromCategoryId(packed.id, ledger)
    if (pick) {
      const kids = childCategories(ledger, pick.topId)
      const childHit = kids.length > 0 ? categoryNameHits(query, kids) : null
      return {
        topId: pick.topId,
        childId: childHit?.id || pick.childId,
        confidence: 'medium',
        reason: `Guess from ${packed.name}`,
      }
    }
  }

  return null
}

export function defaultRevolutPick(
  item: RevolutReviewItem,
  ledger: FinanceLedger,
): RevolutCategoryPick {
  const suggestion = suggestRevolutCategory(item, ledger)
  if (suggestion) return { topId: suggestion.topId, childId: suggestion.childId }
  const tops = topLevelCategories(ledger)
  return { topId: tops[0]?.id ?? UNEXPECTED, childId: '' }
}

export { UNEXPECTED as REVOLUT_UNEXPECTED }
