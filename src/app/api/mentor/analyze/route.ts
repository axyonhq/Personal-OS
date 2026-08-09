import { NextRequest, NextResponse } from 'next/server'
import {
  getAnthropicClient,
  MENTOR_MODEL,
  mentorNotConfiguredResponse,
} from '@/lib/mentor/anthropic'
import { ANALYZE_JSON_INSTRUCTION, MENTOR_SYSTEM_PROMPT } from '@/lib/mentor/context'
import { insightFromMessageContent } from '@/lib/mentor/synthesis'

export const runtime = 'nodejs'
export const maxDuration = 90

const SYNTHESIS_TOOL = {
  name: 'submit_mentor_synthesis',
  description: 'Submit the structured mentor pattern synthesis for this operator.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: {
        type: 'string',
        description: '2-4 sentence read on how they currently operate',
      },
      weapons: {
        type: 'array',
        items: { type: 'string' },
        description: 'What makes them lethal — specific, evidence-backed',
      },
      drags: {
        type: 'array',
        items: { type: 'string' },
        description: 'What bleeds performance — specific, evidence-backed',
      },
      blindSpots: {
        type: 'array',
        items: { type: 'string' },
        description: 'Patterns they are likely missing',
      },
      prescriptions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Concrete systems / rules / constraints to install',
      },
      chatReply: {
        type: 'string',
        description: 'Short mentor message for the chat thread summarizing the synthesis',
      },
    },
    required: ['summary', 'weapons', 'drags', 'blindSpots', 'prescriptions', 'chatReply'],
    additionalProperties: false,
  },
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

    const createParams = {
      model: MENTOR_MODEL,
      max_tokens: 4096,
      system: `${MENTOR_SYSTEM_PROMPT}\n\n${ANALYZE_JSON_INSTRUCTION}`,
      tools: [SYNTHESIS_TOOL],
      tool_choice: { type: 'tool' as const, name: 'submit_mentor_synthesis' },
      messages: [
        {
          role: 'user' as const,
          content: `Run a full pattern synthesis on this operator. Be specific. Cite times of day, session shapes, breaks, spend, journals, and debrief feelings when the data supports it.\n\n${context}`,
        },
      ],
    }

    let response = await client.messages.create(createParams)

    // Truncated tool JSON is useless — one retry with more room.
    if (response.stop_reason === 'max_tokens') {
      response = await client.messages.create({
        ...createParams,
        max_tokens: 8192,
      })
    }

    const insight = insightFromMessageContent(response.content)

    if (!insight) {
      const raw = response.content
        .map((b) =>
          b.type === 'text'
            ? b.text
            : b.type === 'tool_use'
              ? JSON.stringify(b.input)
              : '',
        )
        .join('\n')
        .trim()
      return NextResponse.json(
        {
          error: 'Could not parse mentor synthesis',
          raw: raw.slice(0, 500),
          stop_reason: response.stop_reason,
        },
        { status: 502 },
      )
    }

    return NextResponse.json({ insight })
  } catch (error) {
    console.error('mentor analyze failed', error)
    const message = error instanceof Error ? error.message : 'Mentor analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
