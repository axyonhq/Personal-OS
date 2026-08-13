# Clerk + Supabase setup (Personal OS)

## Vercel env vars

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Redeploy after saving.

## Clerk dashboard

1. **Paths** — Home / after sign-in / after sign-out → your Personal OS Vercel URL
2. **Domains** — allow that production URL (+ `http://localhost:3000` for local)
3. **[Supabase integration](https://dashboard.clerk.com/setup/supabase)** — Activate → copy **Clerk domain**

## Supabase dashboard

1. **SQL Editor** — run:
   - `supabase/migrations/20260728140000_user_app_state.sql`
2. **Authentication → Sign In / Third-party** — Add **Clerk** → paste Clerk domain

## What the app does

- Middleware requires Clerk sign-in for the UI
- After login you land in **Command Center** (personal OS only)
- App state syncs to `user_app_state` keyed by your Clerk user id:
  deep work, tasks, habits, calendar, identity, personal finances,
  Revolut account selections / queues, and Revolut app secret + refresh token
- On sign-in, richer browser data wins over an empty/thin cloud row (then uploads)
- Header **Upload → cloud** force-pushes this browser’s data under your account
- localStorage remains a cache; cloud is the cross-device source of truth
