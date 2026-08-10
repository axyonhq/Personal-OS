/**
 * Quick sanity checks for company-document merge (no test runner in package.json).
 * Run: npx --yes tsx scripts/check-doc-merge.ts
 */
import { mergeCompanyDocuments, mergeSessionSafeState, stateRichnessScore } from '../src/lib/supabase/sync'
import type { AppState, CompanyDocument } from '../src/types'
import { createSeedState } from '../src/data/seed'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

function doc(partial: Partial<CompanyDocument> & Pick<CompanyDocument, 'id' | 'title' | 'content' | 'updatedAt'>): CompanyDocument {
  return {
    createdAt: partial.createdAt ?? partial.updatedAt,
    sourceName: partial.sourceName,
    id: partial.id,
    title: partial.title,
    content: partial.content,
    updatedAt: partial.updatedAt,
  }
}

const older = doc({
  id: 'doc-1',
  title: 'Offer',
  content: 'old body',
  updatedAt: '2026-08-01T10:00:00.000Z',
})
const newer = doc({
  id: 'doc-1',
  title: 'Offer',
  content: 'NEW body that must win',
  updatedAt: '2026-08-10T12:00:00.000Z',
})
const onlyLocal = doc({
  id: 'doc-2',
  title: 'Local only',
  content: 'created while hydrate ran',
  updatedAt: '2026-08-10T12:01:00.000Z',
})

const merged = mergeCompanyDocuments([older], [newer, onlyLocal])
assert(merged.length === 2, 'expected union of two docs')
assert(merged.find((d) => d.id === 'doc-1')?.content === newer.content, 'newer body must win')
assert(merged.some((d) => d.id === 'doc-2'), 'local-only doc must survive')

const blankTie = doc({
  id: 'doc-1',
  title: 'Offer',
  content: '',
  updatedAt: newer.updatedAt,
})
const tie = mergeCompanyDocuments([newer], [blankTie])
assert(tie[0]?.content === newer.content, 'on timestamp tie, richer body must win')

const base = createSeedState() as AppState
const remoteHeavy: AppState = {
  ...base,
  timeEntries: Array.from({ length: 20 }, (_, i) => ({
    id: `t-${i}`,
    projectId: 'chase',
    date: '2026-08-01',
    minutes: 45,
  })),
  companyDocuments: [older],
}
const localLight: AppState = {
  ...base,
  companyDocuments: [newer, onlyLocal],
}

const folded = mergeSessionSafeState(remoteHeavy, localLight)
assert(
  folded.companyDocuments.find((d) => d.id === 'doc-1')?.content === newer.content,
  'mergeSessionSafeState must keep newer doc body even when remote is richer elsewhere',
)
assert(
  folded.companyDocuments.some((d) => d.id === 'doc-2'),
  'mergeSessionSafeState must keep docs only present on the other side',
)

const richerLocal = stateRichnessScore({
  companyDocuments: [newer],
})
const thinnerRemote = stateRichnessScore({
  companyDocuments: [older],
})
assert(richerLocal > thinnerRemote, 'richness must prefer longer saved doc bodies')

console.log('check-doc-merge: ok')
