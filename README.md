# Personal OS

One home screen: vision, money, tasks, journal, and deep work.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Home

- **Vision** — dream home board and long goals
- **Metrics** — spend vs budget, deep work hours
- **Finances** — edit categories, log spend from Revolut
- **Tasks** — one personal list
- **Journal** — upload page photos
- **Deep work** — start a session with one tap, then log how it felt
- **Sunday review** — auto at 4pm Bali every Sunday, on screen for 24 hours

## Stack

Next.js (App Router) + React + TypeScript + Clerk + Supabase + OpenAI API

## Auth + cloud data

See [AUTH_SETUP.md](./AUTH_SETUP.md).

## OpenAI

Set `OPENAI_API_KEY` in Vercel (Production + Preview) and locally in `.env.local`.

## Revolut

See [REVOLUT_SETUP.md](./REVOLUT_SETUP.md).
