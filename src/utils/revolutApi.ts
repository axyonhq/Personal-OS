export interface RevolutAccountDto {
  id: string
  name: string
  balance: number
  currency: string
  state: string
  displayCurrency?: string
  displayBalance?: number
  rate?: number
}

export interface RevolutTxnDto {
  id: string
  revolutTransactionId: string
  legId: string
  accountId: string
  accountName: string
  date: string
  createdAt: string
  amount: number
  currency: string
  direction: 'in' | 'out'
  type: string
  state: string
  merchant: string
  description: string
  reference?: string
  cardLastFour?: string
  internal?: boolean
}

const SECRET_STORAGE_KEY = 'batcave-revolut-app-secret'
const REFRESH_STORAGE_KEY = 'batcave-revolut-refresh-token'
const CREDENTIALS_EVENT = 'batcave-revolut-credentials-changed'

function notifyCredentialsChanged() {
  try {
    window.dispatchEvent(new Event(CREDENTIALS_EVENT))
  } catch {
    // ignore (SSR)
  }
}

export function loadRevolutAppSecret(): string {
  try {
    return localStorage.getItem(SECRET_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function saveRevolutAppSecret(secret: string) {
  try {
    if (secret.trim()) localStorage.setItem(SECRET_STORAGE_KEY, secret.trim())
    else localStorage.removeItem(SECRET_STORAGE_KEY)
    notifyCredentialsChanged()
  } catch {
    // ignore
  }
}

export function loadRevolutRefreshToken(): string {
  try {
    return localStorage.getItem(REFRESH_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function saveRevolutRefreshToken(token: string) {
  try {
    if (token.trim()) localStorage.setItem(REFRESH_STORAGE_KEY, token.trim())
    else localStorage.removeItem(REFRESH_STORAGE_KEY)
    notifyCredentialsChanged()
  } catch {
    // ignore
  }
}

export function revolutCredentialsChangedEvent() {
  return CREDENTIALS_EVENT
}

function captureRotatedToken(data: { refreshToken?: string }) {
  if (typeof data.refreshToken === 'string' && data.refreshToken.trim()) {
    saveRevolutRefreshToken(data.refreshToken)
  }
}

async function revolutRequest<T>(path: string, appSecret: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'x-revolut-app-secret': appSecret,
  }
  const refreshToken = loadRevolutRefreshToken()
  if (refreshToken) headers['x-revolut-refresh-token'] = refreshToken

  const response = await fetch(path, { headers })

  const data = (await response.json().catch(() => ({}))) as {
    error?: string
    refreshToken?: string
  } & T

  captureRotatedToken(data)

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`)
  }
  return data
}

export async function fetchRevolutStatus(appSecret: string) {
  return revolutRequest<{
    ok: boolean
    serverReady?: boolean
    env: string
    missing: string[]
    hasRefreshToken?: boolean
    authOk?: boolean
    authError?: string
    refreshToken?: string
  }>('/api/revolut/status', appSecret)
}

export async function fetchRevolutAccounts(appSecret: string, displayCurrency = 'AUD') {
  const params = new URLSearchParams({ to: displayCurrency })
  return revolutRequest<{
    accounts: RevolutAccountDto[]
    displayCurrency: string
    rates: Record<string, number>
    refreshToken?: string
  }>(`/api/revolut/accounts?${params}`, appSecret)
}

export async function fetchRevolutTransactions(
  appSecret: string,
  date: string,
  accountIds: string[],
) {
  const params = new URLSearchParams({
    date,
    accounts: accountIds.join(','),
  })
  return revolutRequest<{
    date: string
    count: number
    transactions: RevolutTxnDto[]
    refreshToken?: string
  }>(`/api/revolut/transactions?${params}`, appSecret)
}

export function formatAud(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0
  const abs = Math.abs(n)
  const formatted = abs.toLocaleString(undefined, {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return n < 0 ? `−A$${formatted}` : `A$${formatted}`
}

export function formatFx(amount: number, currency: string): string {
  const n = Number.isFinite(amount) ? amount : 0
  const abs = Math.abs(n)
  const formatted = abs.toLocaleString(undefined, {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
  const prefix = currency === 'USD' ? 'US$' : `${currency} `
  return n < 0 ? `−${prefix}${formatted}` : `${prefix}${formatted}`
}
