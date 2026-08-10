import { NextRequest, NextResponse } from 'next/server'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import {
  formatAnthropicError,
  getAnthropicClient,
  MENTOR_MODEL,
  MENTOR_SYNTHESIS_SCHEMA,
  mentorNotConfiguredResponse,
} from '@/lib/mentor/anthropic'
import { ANALYZE_JSON_INSTRUCTION, MENTOR_SYSTEM_PROMPT } from '@/lib/mentor/context'
import {
  insightFromMessageContent,
  normalizeInsight,
  type MentorInsightPayload,
} from '@/lib/mentor/synthesis'

export const runtime = 'nodejs'
export const maxDuration = 90

const SYNTHESIS_TOOL = {
  name: 'submit_mentor_synthesis',
  description: 'Submit the structured mentor pattern synthesis for this operator.',
  strict: true,
  input_schema: {
    ...MENTOR_SYNTHESIS_SCHEMA,
    required: [...MENTOR_SYNTHESIS_SCHEMA.required],
  },
}

const OUTPUT_FORMAT = jsonSchemaOutputFormat({
  ...MENTOR_SYNTHESIS_SCHEMA,
  required: [...MENTOR_SYNTHESIS_SCHEMA.required],
} as const)

function insightFromParsed(parsed: unknown): MentorInsightPayload | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return normalizeInsight(parsed as Record<string, unknown>)
}

export async function POST(req: NextRequest) {
  try {
    const client = getAnthropicClient()
    if (!client) return mentorNotConfiguredResponse()

    const body = (await req.json()) as { context?: string }
    const context = typeof body.context === 'string' ? body.context : ''
    if (!context.trim()) {
      return NextResponse.json({ error: 'Context required' }, { status: 400 })
    }

    const system = `${MENTOR_SYSTEM_PROMPT}\n\n${ANALYZE_JSON_INSTRUCTION}`
    const userContent = `Run a full pattern synthesis on this operator. Be specific. Cite times of day, session shapes, breaks, spend, journals, and debrief feelings when the data supports it.\n\n${context}`

    let insight: MentorInsightPayload | null = null
    let raw = ''
    let stopReason: string | null = null
    let path: 'json_output' | 'tool_use' = 'json_output'

    // Primary path: Claude JSON structured outputs (grammar-constrained).
    try {
      let response = await client.messages.parse({
        model: MENTOR_MODEL,
        max_tokens: 4096,
        system,
        output_config: { format: OUTPUT_FORMAT },
        messages: [{ role: 'user', content: userContent }],
      })

      if (response.stop_reason === 'max_tokens') {
        response = await client.messages.parse({
          model: MENTOR_MODEL,
          max_tokens: 8192,
          system,
          output_config: { format: OUTPUT_FORMAT },
          messages: [{ role: 'user', content: userContent }],
        })
      }

      stopReason = response.stop_reason
      insight = insightFromParsed(response.parsed_output)
      if (!insight) {
        insight = insightFromMessageContent(response.content)
      }
      raw = response.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('\n')
        .trim()
    } catch (structuredError) {
      console.warn('mentor analyze structured output failed; trying tool fallback', structuredError)
      path = 'tool_use'
    }

    // Fallback: forced Claude tool call (same schema, still Anthropic).
    if (!insight) {
      path = 'tool_use'
      let response = await client.messages.create({
        model: MENTOR_MODEL,
        max_tokens: 4096,
        system,
        tools: [SYNTHESIS_TOOL],
        tool_choice: { type: 'tool' as const, name: 'submit_mentor_synthesis' },
        messages: [{ role: 'user' as const, content: userContent }],
      })

      if (response.stop_reason === 'max_tokens') {
        response = await client.messages.create({
          model: MENTOR_MODEL,
          max_tokens: 8192,
          system,
          tools: [SYNTHESIS_TOOL],
          tool_choice: { type: 'tool' as const, name: 'submit_mentor_synthesis' },
          messages: [{ role: 'user' as const, content: userContent }],
        })
      }

      stopReason = response.stop_reason
      insight = insightFromMessageContent(response.content)
      raw = response.content
        .map((b) =>
          b.type === 'text'
            ? b.text
            : b.type === 'tool_use'
              ? JSON.stringify(b.input)
              : '',
        )
        .join('\n')
        .trim()
    }

    if (!insight) {
      return NextResponse.json(
        {
          error: 'Could not parse mentor synthesis',
          raw: raw.slice(0, 500),
          stop_reason: stopReason,
          path,
          model: MENTOR_MODEL,
        },
        { status: 502 },
      )
    }

    return NextResponse.json({ insight, model: MENTOR_MODEL, path })
  } catch (error) {
    console.error('mentor analyze failed', error)
    return NextResponse.json({ error: formatAnthropicError(error) }, { status: 500 })
  }
}
