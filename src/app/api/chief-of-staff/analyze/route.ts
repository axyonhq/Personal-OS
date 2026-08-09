import { NextRequest, NextResponse } from 'next/server'
import {
  COS_OPENAI_MODEL,
  getOpenAIClient,
  openaiNotConfiguredResponse,
  parseOpenAIToolArgs,
} from '@/lib/chiefOfStaff/openai'
import { COS_ANALYZE_INSTRUCTION, COS_SYSTEM_PROMPT } from '@/lib/chiefOfStaff/prompts'
import { normalizeScan } from '@/lib/chiefOfStaff/synthesis'

export const runtime = 'nodejs'
export const maxDuration = 90

const SCAN_TOOL = {
  type: 'function' as const,
  function: {
    name: 'submit_cos_scan',
    description: 'Submit a full Chief of Staff platform scan.',
    strict: true,
    parameters: {
      type: 'object',
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
  },
}

export async function POST(req: NextRequest) {
  try {
    const client = getOpenAIClient()
    if (!client) return openaiNotConfiguredResponse()

    const body = (await req.json()) as { context?: string }
    const context = typeof body.context === 'string' ? body.context : ''
    if (!context.trim()) {
      return NextResponse.json({ error: 'Context required' }, { status: 400 })
    }

    const response = await client.chat.completions.create({
      model: COS_OPENAI_MODEL,
      max_completion_tokens: 4096,
      tools: [SCAN_TOOL],
      tool_choice: { type: 'function', function: { name: 'submit_cos_scan' } },
      messages: [
        {
          role: 'system',
          content: `${COS_SYSTEM_PROMPT}\n\n${COS_ANALYZE_INSTRUCTION}`,
        },
        {
          role: 'user',
          content: `Run a full platform scan. First principles. 4th-grade reading level. Find blind spots, patterns, and unmade decisions across company and personal capacity.\n\n${context}`,
        },
      ],
    })

    const toolCall = response.choices[0]?.message?.tool_calls?.find(
      (t) => t.type === 'function' && t.function?.name === 'submit_cos_scan',
    )
    const args =
      toolCall && toolCall.type === 'function'
        ? parseOpenAIToolArgs(toolCall.function.arguments)
        : null
    const insight = normalizeScan(args)

    if (!insight) {
      return NextResponse.json(
        {
          error: 'Could not parse Chief of Staff scan',
          raw: toolCall && toolCall.type === 'function' ? toolCall.function.arguments : '',
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
