-- Deadline + energy required for company tasks
-- Run in Supabase → SQL Editor for project gfpcdwjdxtgypizlzbkq (Personal OS / Batcave)

alter table public.company_tasks
  add column if not exists deadline date;

alter table public.company_tasks
  add column if not exists energy_required text;

alter table public.company_tasks
  drop constraint if exists company_tasks_energy_required_check;

alter table public.company_tasks
  add constraint company_tasks_energy_required_check
  check (
    energy_required is null
    or energy_required in ('max', 'medium', 'little')
  );

create index if not exists company_tasks_user_deadline_idx
  on public.company_tasks (user_id, deadline);
