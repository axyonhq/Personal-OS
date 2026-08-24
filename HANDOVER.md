# Handover backup — Personal OS

Date: 2026-08-24  
Repo: `axyonhq/Personal-OS`  
Branch checked: `main` at `1e11628`

No real keys, tokens, or passwords were found in files that were opened. This file lists **names only**.

---

## Step 1 — Uncommitted work

`git status` on `main` was **clean**. There was nothing new, changed, or untracked to commit.

No “save work” commit was made, because there was no work to save.

---

## Step 2 — Paths checked

| Path | Status |
|------|--------|
| `.cursor/rules/**/*.mdc` | does not exist |
| `.cursor/skills/**/SKILL.md` | does not exist |
| `.cursor/commands/**/*.md` | does not exist |
| `.cursor/hooks.json` | does not exist |
| `.cursor/environment.json` | does not exist |
| `.cursor/mcp.json` | does not exist |
| `.cursorrules` | does not exist |
| `AGENTS.md` | **exists** |
| `CLAUDE.md` | does not exist |
| `.claude/skills/` | does not exist |
| `.codex/skills/` | does not exist |
| `.agents/skills/` | does not exist |
| `prompts/` | does not exist |
| `system/` | does not exist |
| `me/` | does not exist |
| `portfolio/` | does not exist |
| `research/` | does not exist |

This cloud run also has **no linked Cursor environment**. There is no `.cursor/environment.json` in the repo or on the run.

---

## Agent files

| Full path | Type | What it does | How it triggers | Outside service |
|-----------|------|--------------|-----------------|-----------------|
| `AGENTS.md` | other (repo agent rules) | Tells Cursor agents how to talk (4th-grade, short words) and not to save screenshots, videos, or walkthrough media in the repo or PRs. | Always on for agents in this repo | none |

Count:

- rules: **0**
- skills: **0**
- commands: **0**
- hooks: **0**
- env: **0**
- mcp: **0**
- other: **1** (`AGENTS.md`)

Related setup docs (not agent files, already on `main`):

- `AUTH_SETUP.md` — Clerk + Supabase sign-in and cloud save
- `REVOLUT_SETUP.md` — Revolut Business API setup
- `.env.example` — env var **names** (empty values)
- `README.md` — how to run and deploy

---

## MCPs to reconnect

There is **no** `.cursor/mcp.json` in this repo. MCP setup lives on the **Cursor account**, not in git.

These servers were connected on the **old** account during this handover run. Reconnect them on the **new** account. Names only. No tokens.

| Server name | Status on this run | Secret / login it needs |
|-------------|--------------------|-------------------------|
| Fathom | ready | Fathom account login (OAuth) |
| Slack | ready | Slack workspace login (OAuth) |
| Supabase | ready | Supabase login / access token (OAuth) |
| supabase-axyon-os | ready | Same as Supabase, pinned to the Axyon OS project |
| Gmail | needs auth | Google account login (OAuth) |
| Google-calendar | needs auth | Google account login (OAuth) |

Built-in Cursor tools (not something you paste into `mcp.json`):

- `cursor` (goals / images)
- `cursor-cloud` (this cloud agent)
- `cursor-subscriptions` (wait for GitHub / Slack / timers)

After you switch accounts, open **Cursor Settings → MCP** and add Fathom, Slack, Supabase, Gmail, and Google Calendar again. Sign in for each one.

---

## Variables to re-enter

`.cursor/environment.json` **does not exist**. No cloud-environment variable names came from there.

From `.env.example` (re-enter on the **new** Vercel project and in local `.env.local`):

**Required**

- `REVOLUT_ENV`
- `REVOLUT_CLIENT_ID`
- `REVOLUT_PRIVATE_KEY`
- `REVOLUT_REDIRECT_URI`
- `REVOLUT_JWT_ISS`
- `REVOLUT_APP_SECRET`
- `REVOLUT_REFRESH_TOKEN`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `OPENAI_API_KEY`

**Optional** (commented in `.env.example`, or used as a fallback in code)

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (old name for the publishable key)
- `MENTOR_OPENAI_MODEL`
- `COS_OPENAI_MODEL` (old Mentor model name; code still reads it)
- `REVOLUT_OAUTH_STATE_SECRET`

Env vars **do not** move with the GitHub repo. Add them again on the new Vercel project (Production + Preview), then redeploy.

Local secret files (gitignored; copy by hand, do not commit):

- `.env` / `.env.local`
- `privatecert.pem` (Revolut private key file)
- `publiccert.cer` (Revolut public cert; upload to Revolut, do not commit)

---

## Files NOT committed

**Step 1:** nothing was skipped, because the working tree was already clean.

These paths are **gitignored** on purpose so secrets never land in git. They were **not on disk** in this workspace, so there was nothing to skip or copy:

| File | Why it is not in git |
|------|----------------------|
| `.env` | holds real secret values |
| `.env.*` (except `.env.example`) | holds real secret values |
| `.env.local` | local secret values (`*.local` is ignored) |
| `privatecert.pem` | Revolut private key |
| `publiccert.cer` | Revolut cert material |
| `*.pem` | key/cert files |

If those files exist on your **laptop**, copy them yourself to the new machine. Do not paste values into chat or into this repo.

---

## What you still must do by hand

1. Copy local `.env.local` (if you have one) to the new computer. Do not commit it.
2. Re-add every env **name** above on the new Vercel project. Paste values from your password manager / Vercel old project UI — not from this file.
3. Reconnect the MCP servers in the new Cursor account.
4. Re-do Revolut OAuth if the refresh token is lost (`/api/revolut/oauth/start`).
5. Confirm Clerk + Supabase still point at the same app URL.
