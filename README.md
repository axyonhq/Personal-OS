# Personal OS — Command Center

Personal command center: deep work, money, autopilot, and mentor. Built with Next.js.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

- **Dashboard** — command center home
- **Vision** — long-term goals
- **Autopilot** — evening / Sunday / miss-day rituals
- **Calendar + Tasks** — deep work, timers, projects
- **Money** — personal finances + Revolut sync
- **Mentor** — OpenAI pattern recognition across work, journals, and spend

## Stack

Next.js (App Router) + React + TypeScript + Clerk + Supabase + OpenAI API

## Auth + cloud data

See [AUTH_SETUP.md](./AUTH_SETUP.md) for Clerk + Supabase env vars and dashboard steps.

## Mentor (OpenAI API)

Set `OPENAI_API_KEY` from [platform.openai.com/api-keys](https://platform.openai.com/api-keys) in Vercel (Production + Preview) and locally in `.env.local`.

If you swapped Vercel or GitHub accounts, env vars do **not** follow the repo. Re-add keys on the new Vercel project, then redeploy.

## Revolut

See [REVOLUT_SETUP.md](./REVOLUT_SETUP.md).

## Deploy (Vercel)

1. **Settings → General → Framework Preset** → **Next.js**
2. **Root Directory** → leave blank
3. Build & Development Settings: all **Override** toggles **OFF**
4. Env vars: Clerk + Supabase + OpenAI (+ Revolut) — see `.env.example`
