import { NextRequest, NextResponse } from 'next/server'
import {
  getAnthropicClient,
  MENTOR_MODEL,
  mentorNotConfiguredResponse,
} from '@/lib/mentor/anthropic'
import { COS_BRIEF_INSTRUCTION, COS_SYSTEM_PROMPT } from '@/lib/chiefOfStaff/prompts'
import { briefFromMessageContent } from '@/lib/chiefOfStaff/synthesis'

export const runtime = 'nodejs'
export const maxDuration = 90

const BRIEF_TOOL = {
  name: 'submit_cos_brief',
  description: 'Submit a morning or night Chief of Staff brief.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: {
        type: 'string',
        description: '3-6 short sentences. 4th-grade reading level.',
      },
      actionItems: {
        type: 'array',
        items: { type: 'string' },
        description: '3-5 concrete next actions',
      },
      blindSpots: {
        type: 'array',
        items: { type: 'string' },
        description: 'Patterns or gaps they are missing',
      },
      unmadeDecisions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Open or overdue choices that still need a call',
      },
      chatReply: {
        type: 'string',
        description: 'Short CoS chat message delivering the brief',
      },
    },
    required: ['summary', 'actionItems', 'blindSpots', 'unmadeDecisions', 'chatReply'],
    additionalProperties: false,
  },
}

export async function POST(req: NextRequest) {
  try {
    const client = getAnthropicClient()
    if (!client) return mentorNotConfiguredResponse()

    const body = (await req.json()) as {
      context?: string
      slot?: 'morning' | 'night'
      date?: string
    }

    const context = typeof body.context === 'string' ? body.context : ''
    if (!context.trim()) {
      return NextResponse.json({ error: 'Context required' }, { status: 400 })
    }

    const slot = body.slot === 'night' ? 'night' : 'morning'
    const date = typeof body.date === 'string' && body.date ? body.date : 'today'

    const createParams = {
      model: MENTOR_MODEL,
      max_tokens: 4096,
      system: `${COS_SYSTEM_PROMPT}\n\n${COS_BRIEF_INSTRUCTION}`,
      tools: [BRIEF_TOOL],
      tool_choice: { type: 'tool' as const, name: 'submit_cos_brief' },
      messages: [
        {
          role: 'user' as const,
          content: `Write the ${slot} brief for ${date}. Be specific. Use first principles. Write at a 4th-grade reading level. Hunt blind spots and unmade decisions across the whole platform.\n\n${context}`,
        },
      ],
    }

    let response = await client.messages.create(createParams)
    if (response.stop_reason === 'max_tokens') {
      response = await client.messages.create({
        ...createParams,
        max_tokens: 8192,
      })
    }

    const brief = briefFromMessageContent(response.content)
    if (!brief) {
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
          error: 'Could not parse Chief of Staff brief',
          raw: raw.slice(0, 500),
          stop_reason: response.stop_reason,
        },
        { status: 502 },
      )
    }

    return NextResponse.json({ brief, slot, date })
  } catch (error) {
    console.error('chief of staff brief failed', error)
    const message = error instanceof Error ? error.message : 'Chief of Staff brief failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
