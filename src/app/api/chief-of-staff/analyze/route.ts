import { NextRequest, NextResponse } from 'next/server'
import {
  getAnthropicClient,
  MENTOR_MODEL,
  mentorNotConfiguredResponse,
} from '@/lib/mentor/anthropic'
import { COS_ANALYZE_INSTRUCTION, COS_SYSTEM_PROMPT } from '@/lib/chiefOfStaff/prompts'
import { scanFromMessageContent } from '@/lib/chiefOfStaff/synthesis'

export const runtime = 'nodejs'
export const maxDuration = 90

const SCAN_TOOL = {
  name: 'submit_cos_scan',
  description: 'Submit a full Chief of Staff platform scan.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: { type: 'string' },
      patterns: { type: 'array', items: { type: 'string' } },
      blindSpots: { type: 'array', items: { type: 'string' } },
      unmadeDecisions: { type: 'array', items: { type: 'string' } },
      actionItems: { type: 'array', items: { type: 'string' } },
      chatReply: { type: 'string' },
    },
    required: [
      'summary',
      'patterns',
      'blindSpots',
      'unmadeDecisions',
      'actionItems',
      'chatReply',
    ],
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
      system: `${COS_SYSTEM_PROMPT}\n\n${COS_ANALYZE_INSTRUCTION}`,
      tools: [SCAN_TOOL],
      tool_choice: { type: 'tool' as const, name: 'submit_cos_scan' },
      messages: [
        {
          role: 'user' as const,
          content: `Run a full platform scan. First principles. 4th-grade reading level. Find blind spots, patterns, and unmade decisions across company and personal capacity.\n\n${context}`,
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

    const insight = scanFromMessageContent(response.content)
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
          error: 'Could not parse Chief of Staff scan',
          raw: raw.slice(0, 500),
          stop_reason: response.stop_reason,
        },
        { status: 502 },
      )
    }

    return NextResponse.json({ insight })
  } catch (error) {
    console.error('chief of staff scan failed', error)
    const message = error instanceof Error ? error.message : 'Chief of Staff scan failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
