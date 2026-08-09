import { NextRequest, NextResponse } from 'next/server'
import {
  COS_OPENAI_MODEL,
  getOpenAIClient,
  openaiNotConfiguredResponse,
  parseOpenAIToolArgs,
} from '@/lib/chiefOfStaff/openai'
import { COS_BRIEF_INSTRUCTION, COS_SYSTEM_PROMPT } from '@/lib/chiefOfStaff/prompts'
import { normalizeBrief } from '@/lib/chiefOfStaff/synthesis'

export const runtime = 'nodejs'
export const maxDuration = 90

const BRIEF_TOOL = {
  type: 'function' as const,
  function: {
    name: 'submit_cos_brief',
    description: 'Submit a morning or night Chief of Staff brief.',
    strict: true,
    parameters: {
      type: 'object',
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
  },
}

export async function POST(req: NextRequest) {
  try {
    const client = getOpenAIClient()
    if (!client) return openaiNotConfiguredResponse()

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

    const response = await client.chat.completions.create({
      model: COS_OPENAI_MODEL,
      max_completion_tokens: 4096,
      tools: [BRIEF_TOOL],
      tool_choice: { type: 'function', function: { name: 'submit_cos_brief' } },
      messages: [
        {
          role: 'system',
          content: `${COS_SYSTEM_PROMPT}\n\n${COS_BRIEF_INSTRUCTION}`,
        },
        {
          role: 'user',
          content: `Write the ${slot} brief for ${date}. Be specific. Use first principles. Write at a 4th-grade reading level. Hunt blind spots and unmade decisions across the whole platform.\n\n${context}`,
        },
      ],
    })

    const toolCall = response.choices[0]?.message?.tool_calls?.find(
      (t) => t.type === 'function' && t.function?.name === 'submit_cos_brief',
    )
    const args =
      toolCall && toolCall.type === 'function'
        ? parseOpenAIToolArgs(toolCall.function.arguments)
        : null
    const brief = normalizeBrief(args)

    if (!brief) {
      return NextResponse.json(
        {
          error: 'Could not parse Chief of Staff brief',
          raw: toolCall && toolCall.type === 'function' ? toolCall.function.arguments : '',
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
