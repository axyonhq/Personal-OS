import { parseJsonRecord } from '@/lib/mentor/parseJson'

export type CoSBriefPayload = {
  summary: string
  actionItems: string[]
  blindSpots: string[]
  unmadeDecisions: string[]
  chatReply: string
}

export type CoSScanPayload = {
  summary: string
  patterns: string[]
  blindSpots: string[]
  unmadeDecisions: string[]
  actionItems: string[]
  chatReply: string
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .slice(0, 12)
}

export function normalizeBrief(raw: unknown): CoSBriefPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const summary = typeof o.summary === 'string' ? o.summary.trim() : ''
  const chatReply = typeof o.chatReply === 'string' ? o.chatReply.trim() : ''
  if (!summary) return null
  return {
    summary,
    actionItems: asStringArray(o.actionItems),
    blindSpots: asStringArray(o.blindSpots),
    unmadeDecisions: asStringArray(o.unmadeDecisions),
    chatReply: chatReply || summary,
  }
}

export function normalizeScan(raw: unknown): CoSScanPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const summary = typeof o.summary === 'string' ? o.summary.trim() : ''
  const chatReply = typeof o.chatReply === 'string' ? o.chatReply.trim() : ''
  if (!summary) return null
  return {
    summary,
    patterns: asStringArray(o.patterns),
    blindSpots: asStringArray(o.blindSpots),
    unmadeDecisions: asStringArray(o.unmadeDecisions),
    actionItems: asStringArray(o.actionItems),
    chatReply: chatReply || summary,
  }
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: string }

export function briefFromMessageContent(content: ContentBlock[]): CoSBriefPayload | null {
  for (const block of content) {
    if (block.type === 'tool_use' && 'input' in block) {
      const normalized = normalizeBrief(block.input)
      if (normalized) return normalized
    }
  }
  for (const block of content) {
    if (block.type === 'text' && 'text' in block) {
      const parsed = parseJsonRecord(block.text)
      const normalized = normalizeBrief(parsed)
      if (normalized) return normalized
    }
  }
  return null
}

export function scanFromMessageContent(content: ContentBlock[]): CoSScanPayload | null {
  for (const block of content) {
    if (block.type === 'tool_use' && 'input' in block) {
      const normalized = normalizeScan(block.input)
      if (normalized) return normalized
    }
  }
  for (const block of content) {
    if (block.type === 'text' && 'text' in block) {
      const parsed = parseJsonRecord(block.text)
      const normalized = normalizeScan(parsed)
      if (normalized) return normalized
    }
  }
  return null
}
