-- PlusMinusBoard schema (Supabase Postgres)

-- People list is fixed to 6 names, but stored in DB for consistency.
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  score integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  delta integer not null check (delta in (-1, 1)),
  story text not null,
  created_at timestamptz not null default now()
);

create index if not exists events_person_created_idx on public.events(person_id, created_at desc);

-- Seed the 6 people (idempotent)
insert into public.people(name)
values
  ('CREAG'),
  ('ARGYLE'),
  ('JOE'),
  ('NICOLA'),
  ('CHIP DOUGLAS'),
  ('TOP DOG')
on conflict (name) do nothing;

-- Atomic operation: add event + update score in a single transaction
create or replace function public.add_event(p_name text, p_delta integer, p_story text)
returns json
language plpgsql
as $$
declare
  pid uuid;
  new_score integer;
begin
  select id into pid from public.people where name = p_name;
  if pid is null then
    raise exception 'Unknown person: %', p_name;
  end if;

  insert into public.events(person_id, delta, story)
  values (pid, p_delta, p_story);

  update public.people set score = score + p_delta where id = pid returning score into new_score;

  return json_build_object('person', p_name, 'score', new_score);
end;
$$;

-- Reset helpers (admin)
create or replace function public.reset_person(p_name text)
returns void
language plpgsql
as $$
declare pid uuid;
begin
  select id into pid from public.people where name = p_name;
  if pid is null then return; end if;
  delete from public.events where person_id = pid;
  update public.people set score = 0 where id = pid;
end;
$$;

create or replace function public.reset_all()
returns void
language plpgsql
as $$
begin
  delete from public.events;
  update public.people set score = 0;
end;
$$;

-- RLS
-- For simplicity (per your current use-case), allow public read/write.
-- You can tighten later with auth or a PIN-based edge function.
alter table public.people enable row level security;
alter table public.events enable row level security;

drop policy if exists "public read people" on public.people;
create policy "public read people" on public.people for select using (true);

drop policy if exists "public write people" on public.people;
create policy "public write people" on public.people for update using (true);

drop policy if exists "public read events" on public.events;
create policy "public read events" on public.events for select using (true);

drop policy if exists "public write events" on public.events;
create policy "public write events" on public.events for insert with check (true);

-- Allow RPC execution
grant execute on function public.add_event(text, integer, text) to anon;
grant execute on function public.reset_person(text) to anon;
grant execute on function public.reset_all() to anon;
