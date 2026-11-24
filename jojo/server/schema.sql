-- جوجو — schema + row-level security.  Idempotent; safe to re-run.
-- Privacy model (docs/superpowers/specs/2026-11-24-jojo-design.md "المستخدمين والخصوصية"):
--   * checks / tasks / notes ............ Jojo only. Saleh NEVER.
--   * letters (💌 نوت لصالح) ............ Jojo full; Saleh reads all + may set read_at only.
--   * daily % ........................... Jojo upserts; Saleh reads.
--   * beans / ratings (taste) ........... Jojo full; Saleh reads.
--   * messages (Saleh -> Jojo) .......... Saleh full; Jojo reads + may set seen_at only.
--   * profiles .......................... each user reads/updates own settings; role never client-writable.
--   * rays_products / rays_recipes ...... authenticated read; service role writes.
--   * push / config ..................... service role only.
--   * anon .............................. nothing.
-- Supabase grants ALL on new public tables to anon/authenticated by default, so
-- every table below starts with an explicit REVOKE and then grants back only what is needed.
-- Storage bucket + policies live in storage.sql (needs the Supabase storage schema).

-- ======================================================================= tables
create table if not exists public.jojo_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('jojo','saleh')),
  settings   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- at most one saleh and one jojo
create unique index if not exists jojo_profiles_one_per_role on public.jojo_profiles(role);

create table if not exists public.jojo_checks (
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  key        text not null,
  value      jsonb not null default 'true'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, date, key)
);

create table if not exists public.jojo_tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  days       smallint[],               -- null/empty = every day; 0=Sun..6=Sat
  created_at timestamptz not null default now()
);
create index if not exists jojo_tasks_user on public.jojo_tasks(user_id);

create table if not exists public.jojo_notes (       -- 📝 نوتي — private
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jojo_notes_user on public.jojo_notes(user_id);

create table if not exists public.jojo_letters (     -- 💌 نوت لصالح — Saleh reads
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null default '',
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists jojo_letters_user on public.jojo_letters(user_id);

create table if not exists public.jojo_daily (
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  pct        smallint check (pct between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists public.jojo_messages (    -- written by Saleh, read by Jojo
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('daily','achievement')),
  for_date    date,
  achievement text,
  body        text not null,
  created_at  timestamptz not null default now(),
  seen_at     timestamptz
);
create index if not exists jojo_messages_for_date on public.jojo_messages(for_date);

create table if not exists public.jojo_beans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  photo_path text,                      -- object path in bucket jojo-beans: <user_id>/<file>
  roaster    text,
  name       text,
  origin     text,
  process    text,
  roast      text,
  is_rays    boolean not null default false,
  product_id text,                      -- jojo_rays_products.notion_id when matched (soft link)
  created_at timestamptz not null default now()
);
create index if not exists jojo_beans_user on public.jojo_beans(user_id);

create table if not exists public.jojo_ratings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  bean_id    uuid references public.jojo_beans(id) on delete cascade,
  date       date not null default current_date,
  liked      boolean,
  notes      text[],
  brew_sec   int,
  grind      text,
  created_at timestamptz not null default now()
);
create index if not exists jojo_ratings_user on public.jojo_ratings(user_id);
create index if not exists jojo_ratings_bean on public.jojo_ratings(bean_id);

create table if not exists public.jojo_rays_products (
  notion_id  text primary key,
  name       text not null,
  aliases    text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.jojo_rays_recipes (
  notion_id         text primary key,
  product_notion_id text references public.jojo_rays_products(notion_id) on delete set null,
  name              text,
  dose              numeric,
  water_out         numeric,
  temp_c            numeric,
  target            text,
  grinder           text,
  grind             text,
  source_url        text,
  updated_at        timestamptz not null default now()
);

create table if not exists public.jojo_push (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  subscription jsonb not null,
  tz           text not null default 'Asia/Riyadh',
  updated_at   timestamptz not null default now()
);

create table if not exists public.jojo_config (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

-- ======================================================================= role helpers
-- SECURITY DEFINER so policies can look up the caller's role without the caller
-- being able to read jojo_profiles rows of others. Fixed empty search_path.
create or replace function public.jojo_role() returns text
language sql stable security definer set search_path = ''
as $$ select p.role from public.jojo_profiles p where p.user_id = auth.uid() $$;

create or replace function public.jojo_is_saleh() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select p.role = 'saleh' from public.jojo_profiles p where p.user_id = auth.uid()), false) $$;

create or replace function public.jojo_is_jojo() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select p.role = 'jojo' from public.jojo_profiles p where p.user_id = auth.uid()), false) $$;

revoke all on function public.jojo_role()     from public, anon;
revoke all on function public.jojo_is_saleh() from public, anon;
revoke all on function public.jojo_is_jojo()  from public, anon;
grant execute on function public.jojo_role()     to authenticated, service_role;
grant execute on function public.jojo_is_saleh() to authenticated, service_role;
grant execute on function public.jojo_is_jojo()  to authenticated, service_role;

-- ======================================================================= column guards
-- Column grants are per DB role, and Jojo and Saleh are both `authenticated`,
-- so "Saleh may change only read_at" / "Jojo may change only seen_at" is enforced here.
create or replace function public.jojo_letters_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id
       or new.created_at is distinct from old.created_at then
      raise exception 'jojo_letters: id/user_id/created_at are immutable' using errcode = '42501';
    end if;
    if old.user_id = auth.uid() then
      if new.read_at is distinct from old.read_at then
        raise exception 'jojo_letters: only Saleh sets read_at' using errcode = '42501';
      end if;
    elsif public.jojo_is_saleh() then
      if new.body is distinct from old.body then
        raise exception 'jojo_letters: Saleh may only set read_at' using errcode = '42501';
      end if;
    else
      raise exception 'jojo_letters: not allowed' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists jojo_letters_guard on public.jojo_letters;
create trigger jojo_letters_guard before update on public.jojo_letters
  for each row execute function public.jojo_letters_guard();

create or replace function public.jojo_messages_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.jojo_is_saleh() then
    if (to_jsonb(new) - 'seen_at') is distinct from (to_jsonb(old) - 'seen_at') then
      raise exception 'jojo_messages: Jojo may only set seen_at' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists jojo_messages_guard on public.jojo_messages;
create trigger jojo_messages_guard before update on public.jojo_messages
  for each row execute function public.jojo_messages_guard();

create or replace function public.jojo_touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists jojo_notes_touch on public.jojo_notes;
create trigger jojo_notes_touch before update on public.jojo_notes
  for each row execute function public.jojo_touch_updated_at();

revoke all on function public.jojo_letters_guard()    from public, anon, authenticated;
revoke all on function public.jojo_messages_guard()   from public, anon, authenticated;
revoke all on function public.jojo_touch_updated_at() from public, anon, authenticated;

-- ======================================================================= grants
-- Start from zero for client roles on every jojo_ table, then grant back.
revoke all on public.jojo_profiles, public.jojo_checks, public.jojo_tasks, public.jojo_notes,
              public.jojo_letters, public.jojo_daily, public.jojo_messages, public.jojo_beans,
              public.jojo_ratings, public.jojo_rays_products, public.jojo_rays_recipes,
              public.jojo_push, public.jojo_config
  from public, anon, authenticated;
grant all on public.jojo_profiles, public.jojo_checks, public.jojo_tasks, public.jojo_notes,
             public.jojo_letters, public.jojo_daily, public.jojo_messages, public.jojo_beans,
             public.jojo_ratings, public.jojo_rays_products, public.jojo_rays_recipes,
             public.jojo_push, public.jojo_config
  to service_role;

grant select                 on public.jojo_profiles to authenticated;
grant update (settings)      on public.jojo_profiles to authenticated;   -- never role / user_id
grant select, insert, delete on public.jojo_checks   to authenticated;
grant update (value, updated_at) on public.jojo_checks to authenticated;
grant select, insert, update, delete on public.jojo_tasks to authenticated;
grant select, insert, update, delete on public.jojo_notes to authenticated;
grant select, insert, delete on public.jojo_letters  to authenticated;
grant update (body, read_at) on public.jojo_letters  to authenticated;   -- who-may-change-what: guard trigger
grant select, insert         on public.jojo_daily    to authenticated;
grant update (pct, updated_at) on public.jojo_daily  to authenticated;
grant select, insert, delete on public.jojo_messages to authenticated;
grant update (kind, for_date, achievement, body, seen_at) on public.jojo_messages to authenticated;
grant select, insert, update, delete on public.jojo_beans   to authenticated;
grant select, insert, update, delete on public.jojo_ratings to authenticated;
grant select on public.jojo_rays_products to authenticated;
grant select on public.jojo_rays_recipes  to authenticated;
-- jojo_push, jojo_config: nothing for anon/authenticated.

-- ======================================================================= RLS
alter table public.jojo_profiles      enable row level security;
alter table public.jojo_checks        enable row level security;
alter table public.jojo_tasks         enable row level security;
alter table public.jojo_notes         enable row level security;
alter table public.jojo_letters       enable row level security;
alter table public.jojo_daily         enable row level security;
alter table public.jojo_messages      enable row level security;
alter table public.jojo_beans         enable row level security;
alter table public.jojo_ratings       enable row level security;
alter table public.jojo_rays_products enable row level security;
alter table public.jojo_rays_recipes  enable row level security;
alter table public.jojo_push          enable row level security;
alter table public.jojo_config        enable row level security;

-- profiles: own row only (Saleh does NOT see Jojo's settings)
drop policy if exists jojo_profiles_select_own on public.jojo_profiles;
create policy jojo_profiles_select_own on public.jojo_profiles for select to authenticated
  using (user_id = auth.uid());
drop policy if exists jojo_profiles_update_own on public.jojo_profiles;
create policy jojo_profiles_update_own on public.jojo_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- owner-only tables (Jojo's private data): one ALL policy each, no Saleh policy at all
drop policy if exists jojo_checks_owner on public.jojo_checks;
create policy jojo_checks_owner on public.jojo_checks for all to authenticated
  using (user_id = auth.uid() and public.jojo_is_jojo())
  with check (user_id = auth.uid() and public.jojo_is_jojo());
drop policy if exists jojo_tasks_owner on public.jojo_tasks;
create policy jojo_tasks_owner on public.jojo_tasks for all to authenticated
  using (user_id = auth.uid() and public.jojo_is_jojo())
  with check (user_id = auth.uid() and public.jojo_is_jojo());
drop policy if exists jojo_notes_owner on public.jojo_notes;
create policy jojo_notes_owner on public.jojo_notes for all to authenticated
  using (user_id = auth.uid() and public.jojo_is_jojo())
  with check (user_id = auth.uid() and public.jojo_is_jojo());

-- letters: owner full; Saleh select + update (guard trigger limits him to read_at)
drop policy if exists jojo_letters_owner on public.jojo_letters;
create policy jojo_letters_owner on public.jojo_letters for all to authenticated
  using (user_id = auth.uid() and public.jojo_is_jojo())
  with check (user_id = auth.uid() and public.jojo_is_jojo());
drop policy if exists jojo_letters_saleh_select on public.jojo_letters;
create policy jojo_letters_saleh_select on public.jojo_letters for select to authenticated
  using (public.jojo_is_saleh());
drop policy if exists jojo_letters_saleh_read_at on public.jojo_letters;
create policy jojo_letters_saleh_read_at on public.jojo_letters for update to authenticated
  using (public.jojo_is_saleh()) with check (public.jojo_is_saleh());

-- daily: owner upsert; Saleh select
drop policy if exists jojo_daily_owner on public.jojo_daily;
create policy jojo_daily_owner on public.jojo_daily for all to authenticated
  using (user_id = auth.uid() and public.jojo_is_jojo())
  with check (user_id = auth.uid() and public.jojo_is_jojo());
drop policy if exists jojo_daily_saleh_select on public.jojo_daily;
create policy jojo_daily_saleh_select on public.jojo_daily for select to authenticated
  using (public.jojo_is_saleh());

-- beans / ratings: owner full; Saleh select
drop policy if exists jojo_beans_owner on public.jojo_beans;
create policy jojo_beans_owner on public.jojo_beans for all to authenticated
  using (user_id = auth.uid() and public.jojo_is_jojo())
  with check (user_id = auth.uid() and public.jojo_is_jojo());
drop policy if exists jojo_beans_saleh_select on public.jojo_beans;
create policy jojo_beans_saleh_select on public.jojo_beans for select to authenticated
  using (public.jojo_is_saleh());
drop policy if exists jojo_ratings_owner on public.jojo_ratings;
create policy jojo_ratings_owner on public.jojo_ratings for all to authenticated
  using (user_id = auth.uid() and public.jojo_is_jojo())
  with check (user_id = auth.uid() and public.jojo_is_jojo());
drop policy if exists jojo_ratings_saleh_select on public.jojo_ratings;
create policy jojo_ratings_saleh_select on public.jojo_ratings for select to authenticated
  using (public.jojo_is_saleh());

-- messages: Saleh full; Jojo select + update (guard trigger limits her to seen_at)
drop policy if exists jojo_messages_saleh on public.jojo_messages;
create policy jojo_messages_saleh on public.jojo_messages for all to authenticated
  using (public.jojo_is_saleh()) with check (public.jojo_is_saleh());
drop policy if exists jojo_messages_jojo_select on public.jojo_messages;
create policy jojo_messages_jojo_select on public.jojo_messages for select to authenticated
  using (public.jojo_is_jojo());
drop policy if exists jojo_messages_jojo_seen on public.jojo_messages;
create policy jojo_messages_jojo_seen on public.jojo_messages for update to authenticated
  using (public.jojo_is_jojo()) with check (public.jojo_is_jojo());

-- Rays reference data: read for any signed-in user; writes via service role
drop policy if exists jojo_rays_products_read on public.jojo_rays_products;
create policy jojo_rays_products_read on public.jojo_rays_products for select to authenticated using (true);
drop policy if exists jojo_rays_recipes_read on public.jojo_rays_recipes;
create policy jojo_rays_recipes_read on public.jojo_rays_recipes for select to authenticated using (true);

-- jojo_push, jojo_config: RLS on, no policies, no grants => service role only.
