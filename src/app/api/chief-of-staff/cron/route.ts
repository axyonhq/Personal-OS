import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { buildChiefOfStaffContext } from '@/lib/chiefOfStaff/context'
import {
  COS_OPENAI_MODEL,
  getOpenAIClient,
  openaiNotConfiguredResponse,
  parseOpenAIToolArgs,
} from '@/lib/chiefOfStaff/openai'
import { COS_BRIEF_INSTRUCTION, COS_SYSTEM_PROMPT } from '@/lib/chiefOfStaff/prompts'
import { normalizeBrief } from '@/lib/chiefOfStaff/synthesis'
import { postCosBriefToSlack, slackConfigured } from '@/lib/chiefOfStaff/slack'
import type { AppState, CoSBrief, CoSBriefSlot, CompanyTask } from '@/types'
import { cosBriefKey, emptyChiefOfStaffState } from '@/types'
import { nowMinutesInAppTz, todayDateKey } from '@/utils/time'
import { uid } from '@/data/seed'

export const runtime = 'nodejs'
export const maxDuration = 120

const BRIEF_TOOL = {
  type: 'function' as const,
  function: {
    name: 'submit_cos_brief',
    description: 'Submit a morning or night Chief of Staff brief.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        actionItems: { type: 'array', items: { type: 'string' } },
        blindSpots: { type: 'array', items: { type: 'string' } },
        unmadeDecisions: { type: 'array', items: { type: 'string' } },
        chatReply: { type: 'string' },
      },
      required: ['summary', 'actionItems', 'blindSpots', 'unmadeDecisions', 'chatReply'],
      additionalProperties: false,
    },
  },
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim() || process.env.COS_CRON_SECRET?.trim()
  if (!secret) return false
  const header = req.headers.get('authorization') || ''
  if (header === `Bearer ${secret}`) return true
  const urlSecret = req.nextUrl.searchParams.get('secret')
  return urlSecret === secret
}

function pickSlot(force?: string | null): CoSBriefSlot | null {
  if (force === 'morning' || force === 'night') return force
  const hour = Math.floor(nowMinutesInAppTz() / 60)
  // Morning window 7–11, night window 22–23
  if (hour >= 7 && hour < 12) return 'morning'
  if (hour >= 22 || hour < 1) return 'night'
  return null
}

async function loadOwnerState(): Promise<{ userId: string; state: AppState } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const userId = process.env.COS_OWNER_USER_ID?.trim()
  if (!url || !serviceKey || !userId) return null

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client
    .from('user_app_state')
    .select('state')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.state) return null
  return { userId, state: data.state as AppState }
}

async function loadCompanyTasks(userId: string): Promise<CompanyTask[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceKey) return []
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client
    .from('company_tasks')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
  if (error || !data) return []
  return data.map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    priority: (row.priority as CompanyTask['priority']) || 'schedule',
    status: (row.status as CompanyTask['status']) || 'not_started',
    notes: (row.notes as string) || '',
    parentId: (row.parent_id as string | null) ?? null,
    sortOrder: (row.sort_order as number) || 0,
    hidden: Boolean(row.hidden),
    deadline: (row.deadline as string | null) ?? null,
    energyRequired:
      row.energy_required === 'max' ||
      row.energy_required === 'medium' ||
      row.energy_required === 'little'
        ? (row.energy_required as CompanyTask['energyRequired'])
        : null,
    estimateHours:
      row.estimate_hours === null || row.estimate_hours === undefined
        ? null
        : Number(row.estimate_hours) > 0
          ? Number(row.estimate_hours)
          : null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    blockedByIds: [],
  }))
}

async function persistBrief(userId: string, state: AppState, brief: CoSBrief, chatReply: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceKey) return
  const cos = state.chiefOfStaff || emptyChiefOfStaffState()
  const withoutDup = (cos.briefs || []).filter(
    (b) => cosBriefKey(b.date, b.slot) !== cosBriefKey(brief.date, brief.slot),
  )
  const nextState: AppState = {
    ...state,
    chiefOfStaff: {
      ...cos,
      briefs: [brief, ...withoutDup].slice(0, 60),
      messages: [
        ...(cos.messages || []),
        {
          id: uid('cosmsg'),
          role: 'cos' as const,
          text: chatReply,
          createdAt: brief.createdAt,
          briefId: brief.id,
        },
      ].slice(-120),
    },
  }
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  await client.from('user_app_state').upsert({
    user_id: userId,
    state: nextState,
    updated_at: new Date().toISOString(),
  })
}

export async function GET(req: NextRequest) {
  return runCron(req)
}

export async function POST(req: NextRequest) {
  return runCron(req)
}

async function runCron(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const slot = pickSlot(req.nextUrl.searchParams.get('slot'))
  if (!slot) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'Outside morning/night window',
      hour: Math.floor(nowMinutesInAppTz() / 60),
    })
  }

  if (!slackConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Slack not configured for CoS briefs' },
      { status: 503 },
    )
  }

  const client = getOpenAIClient()
  if (!client) return openaiNotConfiguredResponse()

  const owned = await loadOwnerState()
  if (!owned) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Missing cloud state. Set SUPABASE_SERVICE_ROLE_KEY + COS_OWNER_USER_ID (Clerk user id).',
      },
      { status: 503 },
    )
  }

  const date = todayDateKey()
  const cos = owned.state.chiefOfStaff || emptyChiefOfStaffState()
  if (!cos.proactiveEnabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Proactive briefs disabled' })
  }
  const existing = (cos.briefs || []).find(
    (b) => cosBriefKey(b.date, b.slot) === cosBriefKey(date, slot),
  )
  if (existing?.slackSentAt) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Brief already sent to Slack' })
  }

  const companyTasks = await loadCompanyTasks(owned.userId)
  const context = buildChiefOfStaffContext(owned.state, { companyTasks })

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
        content: `Write the ${slot} brief for ${date}. First principles. 4th-grade reading level. Scan the whole platform.\n\n${context}`,
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
  const parsed = normalizeBrief(args)
  if (!parsed) {
    return NextResponse.json({ ok: false, error: 'Could not parse brief' }, { status: 502 })
  }

  const now = new Date().toISOString()
  const slack = await postCosBriefToSlack({
    date,
    slot,
    summary: parsed.summary,
    actionItems: parsed.actionItems,
    blindSpots: parsed.blindSpots,
    unmadeDecisions: parsed.unmadeDecisions,
  })

  const brief: CoSBrief = {
    id: existing?.id || uid('brief'),
    date,
    slot,
    summary: parsed.summary,
    actionItems: parsed.actionItems,
    blindSpots: parsed.blindSpots,
    unmadeDecisions: parsed.unmadeDecisions,
    createdAt: existing?.createdAt || now,
    slackSentAt: slack.ok ? now : undefined,
  }

  await persistBrief(owned.userId, owned.state, brief, parsed.chatReply)

  return NextResponse.json({
    ok: true,
    slot,
    date,
    slack,
    briefId: brief.id,
  })
}
