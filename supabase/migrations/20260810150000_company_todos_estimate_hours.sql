-- Estimated effort (hours) for company tasks
-- Run in Supabase → SQL Editor for project gfpcdwjdxtgypizlzbkq (Personal OS / Batcave)

alter table public.company_tasks
  add column if not exists estimate_hours numeric;

alter table public.company_tasks
  drop constraint if exists company_tasks_estimate_hours_check;

alter table public.company_tasks
  add constraint company_tasks_estimate_hours_check
  check (
    estimate_hours is null
    or (estimate_hours > 0 and estimate_hours <= 168)
  );
