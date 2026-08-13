import { parseJsonRecord } from '@/lib/mentor/parseJson'

export type MentorInsightPayload = {
  summary: string
  weapons: string[]
  drags: string[]
  blindSpots: string[]
  prescriptions: string[]
  chatReply: string
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value
      .map((item) => asText(item))
      .filter(Boolean)
      .join(' ')
      .trim()
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['text', 'summary', 'value', 'item', 'content', 'message']) {
      const nested = asText(record[key])
      if (nested) return nested
    }
  }
  return ''
}

export function asStringArray(value: unknown): string[] {
  if (typeof value === 'string') {
    const text = value.trim()
    return text ? [text] : []
  }
  if (!Array.isArray(value)) return []
  return value.map((item) => asText(item)).filter(Boolean).slice(0, 12)
}

/** Coerce tool input (object or JSON string) into a plain record. */
export function coerceToolInput(input: unknown): Record<string, unknown> | null {
  if (!input) return null
  if (typeof input === 'string') return parseJsonRecord(input)
  if (typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>
  }
  return null
}

export function normalizeInsight(
  parsed: Record<string, unknown>,
  fallbackText = '',
): MentorInsightPayload | null {
  const summary =
    asText(parsed.summary) ||
    asText(parsed.read) ||
    asText(parsed.analysis) ||
    asText(parsed.chatReply) ||
    asText(parsed.chat_reply) ||
    fallbackText.trim()
  if (!summary) return null

  const chatReply =
    asText(parsed.chatReply) || asText(parsed.chat_reply) || summary

  return {
    summary,
    weapons: asStringArray(parsed.weapons ?? parsed.strengths),
    drags: asStringArray(parsed.drags ?? parsed.leaks ?? parsed.weaknesses),
    blindSpots: asStringArray(parsed.blindSpots ?? parsed.blind_spots),
    prescriptions: asStringArray(
      parsed.prescriptions ?? parsed.actions ?? parsed.recommendations,
    ),
    chatReply,
  }
}

export function parseInsightJson(raw: string): MentorInsightPayload | null {
  const parsed = parseJsonRecord(raw)
  if (parsed) {
    const insight = normalizeInsight(parsed)
    if (insight) return insight
  }

  // Last resort: model returned prose — still surface a usable synthesis
  const prose = raw.trim()
  if (prose.length >= 40) {
    return {
      summary: prose.slice(0, 1200),
      weapons: [],
      drags: [],
      blindSpots: [],
      prescriptions: [],
      chatReply: prose.slice(0, 800),
    }
  }
  return null
}

/** Build insight from a Messages API content list (tool blocks first, then text). */
export function insightFromMessageContent(
  content: Array<{ type: string; text?: string; name?: string; input?: unknown }>,
): MentorInsightPayload | null {
  const toolBlock = content.find(
    (b) => b.type === 'tool_use' && b.name === 'submit_mentor_synthesis',
  )

  if (toolBlock) {
    const record = coerceToolInput(toolBlock.input)
    if (record) {
      const fromTool = normalizeInsight(record)
      if (fromTool) return fromTool
      // Tool payload present but oddly shaped — don't discard it
      const raw = JSON.stringify(record)
      const recovered = parseInsightJson(raw)
      if (recovered) return recovered
    }
  }

  const text = content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n')
    .trim()

  return parseInsightJson(text)
}
