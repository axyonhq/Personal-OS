import { NextRequest, NextResponse } from 'next/server'
import {
  formatOpenAIError,
  getMentorOpenAIClient,
  MENTOR_OPENAI_MODEL,
  mentorNotConfiguredResponse,
} from '@/lib/mentor/openai'
import {
  coerceJournalDateYear,
  extractDateFromJournalText,
  parseFlexibleJournalDate,
} from '@/utils/journalDate'
import { zonedParts } from '@/utils/time'

export const runtime = 'nodejs'
export const maxDuration = 90

const MAX_IMAGE_BYTES = 4_500_000

function parseModelPayload(raw: string, now: Date): {
  text: string
  detectedDate: string | null
  detectedDateRaw: string | null
} {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1].trim() : trimmed

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>
    const text =
      typeof parsed.text === 'string'
        ? parsed.text.trim()
        : typeof parsed.transcription === 'string'
          ? parsed.transcription.trim()
          : ''
    const rawDate =
      typeof parsed.detectedDateRaw === 'string'
        ? parsed.detectedDateRaw.trim()
        : typeof parsed.pageDate === 'string'
          ? parsed.pageDate.trim()
          : null
    let detectedDate =
      typeof parsed.detectedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.detectedDate)
        ? parsed.detectedDate
        : null
    if (!detectedDate && rawDate) detectedDate = parseFlexibleJournalDate(rawDate, now)
    if (text) {
      if (!detectedDate) {
        const fromText = extractDateFromJournalText(text, now)
        return {
          text,
          detectedDate: coerceJournalDateYear(fromText.date, rawDate || fromText.raw, now),
          detectedDateRaw: rawDate || fromText.raw,
        }
      }
      return {
        text,
        detectedDate: coerceJournalDateYear(detectedDate, rawDate, now),
        detectedDateRaw: rawDate,
      }
    }
  } catch {
    // fall through to plain-text handling
  }

  const fromText = extractDateFromJournalText(trimmed, now)
  return {
    text: trimmed,
    detectedDate: coerceJournalDateYear(fromText.date, fromText.raw, now),
    detectedDateRaw: fromText.raw,
  }
}

export async function POST(req: NextRequest) {
  try {
    const client = getMentorOpenAIClient()
    if (!client) return mentorNotConfiguredResponse()

    const body = (await req.json()) as {
      imageBase64?: string
      mediaType?: string
      date?: string
      sourceName?: string
      currentYear?: number
    }

    const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : ''
    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 required' }, { status: 400 })
    }

    if (imageBase64.length > MAX_IMAGE_BYTES * 1.4) {
      return NextResponse.json({ error: 'Image too large (max ~4.5MB)' }, { status: 413 })
    }

    const mediaType =
      body.mediaType === 'image/png' ||
      body.mediaType === 'image/gif' ||
      body.mediaType === 'image/webp'
        ? body.mediaType
        : 'image/jpeg'

    const dateHint =
      typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : null
    const sourceName =
      typeof body.sourceName === 'string' && body.sourceName.trim()
        ? body.sourceName.trim().slice(0, 120)
        : 'journal page'

    const now = new Date()
    const currentYear =
      typeof body.currentYear === 'number' && body.currentYear >= 2000 && body.currentYear <= 2100
        ? body.currentYear
        : zonedParts(now).year

    const data = imageBase64.replace(/^data:[^;]+;base64,/, '')
    const system = `You extract handwritten or printed journal pages for a high-performance coaching system.

Transcribe faithfully. Preserve line breaks for lists. Do not invent content you cannot read — mark illegible spots as [illegible].

CRITICAL — dates: These journals almost always have a date at the top WITHOUT a year (e.g. "July 19th", "August 1", "19 July"). 
When the year is missing, you MUST use ${currentYear} — never invent a previous year like ${currentYear - 1}.
Only use a different year if the page explicitly writes 20xx.

Return ONLY valid JSON (no markdown fences):
{
  "detectedDate": "YYYY-MM-DD or null",
  "detectedDateRaw": "exactly what was written, e.g. July 19th",
  "text": "full transcription of the page"
}`

    const response = await client.chat.completions.create({
      model: MENTOR_OPENAI_MODEL,
      max_completion_tokens: 2800,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mediaType};base64,${data}`,
              },
            },
            {
              type: 'text',
              text: [
                `Extract this journal page (${sourceName}).`,
                `Current year is ${currentYear}. Yearless headers → ${currentYear}.`,
                'Prioritize the date written at the top of the page.',
                dateHint
                  ? `Operator fallback date if none is readable: ${dateHint}. Prefer the page header over this fallback.`
                  : 'If no date is readable, set detectedDate to null.',
              ].join('\n'),
            },
          ],
        },
      ],
    })

    const raw = (response.choices[0]?.message?.content || '').trim()

    if (!raw) {
      return NextResponse.json({ error: 'No text extracted' }, { status: 502 })
    }

    const parsed = parseModelPayload(raw, now)
    if (!parsed.text) {
      return NextResponse.json({ error: 'No text extracted' }, { status: 502 })
    }

    return NextResponse.json({
      text: parsed.text,
      detectedDate: parsed.detectedDate,
      detectedDateRaw: parsed.detectedDateRaw,
    })
  } catch (error) {
    console.error('mentor journal failed', error)
    return NextResponse.json({ error: formatOpenAIError(error) }, { status: 500 })
  }
}
