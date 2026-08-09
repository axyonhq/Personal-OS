# AXYON — Command OS

Company OS (AXYON) + personal Command Center: deep work, money, and company ops in Next.js.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

- **Two layers after login** — Command Center (personal) and AXYON (company), chosen from a gate screen
- **Command Center** — dashboard, deep work, personal finances
- **AXYON** — Command Deck, to-dos, decision gate, ideas, cold email, documents, logins, company finance (Revolut + buckets); Meta Ads / Agents marked soon
- **Daily deep work target** — set hours/day, see hit/miss, streak, and week hit rate
- **Today's One Thing** — single outcome to protect
- **Project tasks** — brain-dump backlog; default view shows only today's tasks; toggle **Show all tasks** to promote/demote with Today/Later
- Focus timers — deep work requires a five-word session note (what you're building) before the clock starts
- Identity, week intention, mental RAM, reminders, non-negotiables
- Time summary + attention allocation
- 3-day calendar (click-drag blocks) + monthly grid
- Seeded from Claude artifact screenshots (Jul 2026)
- Persists to `localStorage` + Supabase
- **Mentor** — Claude-powered pattern recognition across deep work, breaks, session debriefs, spend, journals, and Sunday logs

## Stack

Next.js (App Router) + React + TypeScript + Clerk + Supabase + Anthropic Claude API

## Auth + cloud data

See [AUTH_SETUP.md](./AUTH_SETUP.md) for Clerk + Supabase env vars and dashboard steps.

## Mentor (Claude API)

Claude Pro on claude.ai does **not** unlock the API. Create an API key at [console.anthropic.com](https://console.anthropic.com/), enable billing, and set `ANTHROPIC_API_KEY` in Vercel (and locally in `.env.local`).

After each deep-work session, a debrief prompt captures feeling + tags. Journal photos can be bulk-uploaded; Claude Vision extracts text **and page dates** (e.g. “July 19th”) for backfill. Evening / Sunday journal steps require OCR. Body/energy logs, miss-day repair, horizon cascade (Vision → weekly goals → One Thing), debrief analytics, and one-click **Install** on mentor prescriptions (habit / One Thing / calendar / reminder) close the loop from insight → system.

## Deploy (Vercel) — if you see “No Next.js version detected”

1. **Settings → General → Framework Preset** → **Next.js**
2. **Root Directory** → click Edit → **clear it completely** (do **not** use `./` — leave blank) → Save
3. Build & Development Settings: all **Override** toggles **OFF**
4. Do **not** Redeploy an old failed deployment (it keeps Framework=Other). Instead:
   - Deployments → **Create Deployment** → branch `main` (or merge this PR)
   - Or push a new commit to `main`
5. On the new deploy details, confirm Framework = **Next.js**

Env vars: Clerk + Supabase (+ Revolut) — see `.env.example`

# Force Vercel to pick up current Next.js main
