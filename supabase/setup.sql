-- Ejecuta esto una sola vez en Supabase: SQL Editor > New query > Run

create table if not exists public.checklist_state (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  tasks jsonb not null default '[]'::jsonb,
  habits jsonb not null default '{}'::jsonb,
  deleted jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.checklist_state enable row level security;

drop policy if exists "owner can read" on public.checklist_state;
drop policy if exists "owner can insert" on public.checklist_state;
drop policy if exists "owner can update" on public.checklist_state;

create policy "owner can read" on public.checklist_state
  for select using (auth.uid() = user_id);
create policy "owner can insert" on public.checklist_state
  for insert with check (auth.uid() = user_id);
create policy "owner can update" on public.checklist_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
