/**
 * Smoke checks for mentor synthesis parsing (no OpenAI API needed).
 * Run: npx tsx scripts/check-mentor-synthesis.ts
 */
import { clipMentorContext } from '../src/lib/mentor/clipContext'
import {
  coerceToolInput,
  insightFromMessageContent,
  normalizeInsight,
  parseInsightJson,
} from '../src/lib/mentor/synthesis'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

const fromTool = insightFromMessageContent([
  {
    type: 'tool_use',
    name: 'submit_mentor_synthesis',
    input: {
      summary: 'Operates best before noon.',
      weapons: ['deep morning blocks'],
      drags: ['phone after lunch'],
      blindSpots: ['ignores sleep debt'],
      prescriptions: ['no-phone until first 90m'],
      chatReply: 'Mornings are your weapon. Protect them.',
    },
  },
])
assert(fromTool?.summary.includes('noon'), 'tool object path')

const emptySummary = insightFromMessageContent([
  {
    type: 'tool_use',
    name: 'submit_mentor_synthesis',
    input: {
      summary: '',
      weapons: [],
      drags: [],
      blindSpots: [],
      prescriptions: [],
      chatReply: 'Fallback from chatReply when summary is empty.',
    },
  },
])
assert(emptySummary?.summary.startsWith('Fallback'), 'summary falls back to chatReply')

const stringInput = insightFromMessageContent([
  {
    type: 'tool_use',
    name: 'submit_mentor_synthesis',
    input: JSON.stringify({
      summary: 'Stringified tool input works.',
      weapons: ['focus'],
      drags: ['noise'],
      blindSpots: ['drift'],
      prescriptions: ['calendar lock'],
      chatReply: 'ok',
    }),
  },
])
assert(stringInput?.weapons[0] === 'focus', 'string tool input')

const objectItems = normalizeInsight({
  summary: 'ok',
  weapons: [{ text: 'weapon A' }, 'weapon B'],
  drags: [{ value: 'drag A' }],
  blindSpots: 'single blind spot',
  prescriptions: [{ item: 'rx A' }],
  chatReply: 'hi',
})
assert(objectItems?.weapons.length === 2, 'object list items coerce')
assert(objectItems?.blindSpots[0] === 'single blind spot', 'string array coerce')

const prose = parseInsightJson(
  'You run hard in the morning then leak energy after lunch with short broken sessions.',
)
assert(prose?.summary.includes('morning'), 'prose fallback')

assert(coerceToolInput(null) === null, 'null input')
assert(coerceToolInput({ a: 1 })?.a === 1, 'object input')

const long = 'x'.repeat(80_000)
const clipped = clipMentorContext(long, 1000)
assert(clipped.length <= 1000, 'clip respects limit')
assert(clipped.includes('clipped for length'), 'clip marks middle')

const defaultClipped = clipMentorContext(long)
assert(defaultClipped.length <= 36_000, 'default clip stays under timeout budget')
assert(defaultClipped.includes('clipped for length'), 'default clip marks middle')

console.log('mentor synthesis checks passed')
