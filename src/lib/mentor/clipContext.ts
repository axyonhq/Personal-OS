/** Keep the dossier small enough that one OpenAI call finishes inside Vercel. */
export const MENTOR_CONTEXT_CHAR_LIMIT = 36_000

export function clipMentorContext(context: string, limit = MENTOR_CONTEXT_CHAR_LIMIT): string {
  const trimmed = context.trim()
  if (trimmed.length <= limit) return trimmed
  const head = Math.floor(limit * 0.4)
  const tail = limit - head - 80
  return `${trimmed.slice(0, head)}\n\n[…dossier clipped for length…]\n\n${trimmed.slice(-tail)}`
}
