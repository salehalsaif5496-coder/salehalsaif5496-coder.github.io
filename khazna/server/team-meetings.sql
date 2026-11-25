-- الخزنة — «اجتماع» داخل تبويب الفريق: الاجتماعات ورسائلها ومهامها
-- مقفلة تمامًا: التطبيق يوصل لها عبر khazna-team فقط، والجولة الساعية بصلاحية الخادم

create table if not exists public.team_meetings (
  id         uuid primary key default gen_random_uuid(),
  topic      text not null,
  details    text,
  attendees  text[] not null default '{}',          -- ids من team_members
  status     text not null default 'open' check (status in ('open','closed')),
  minutes    text,                                  -- خلاصة الفا
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);
create index if not exists team_meetings_created on public.team_meetings (created_at desc);

create table if not exists public.team_meeting_msgs (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.team_meetings(id) on delete cascade,
  member_id  text,                                  -- null = صالح
  from_name  text not null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists team_meeting_msgs_m on public.team_meeting_msgs (meeting_id, created_at);

create table if not exists public.team_meeting_tasks (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.team_meetings(id) on delete cascade,
  member_id  text references public.team_members(id) on delete set null,
  task       text not null,
  due        text,
  status     text not null default 'open' check (status in ('open','done')),
  result     text,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
create index if not exists team_meeting_tasks_open on public.team_meeting_tasks (created_at) where status = 'open';

alter table public.team_meetings      enable row level security;
alter table public.team_meeting_msgs  enable row level security;
alter table public.team_meeting_tasks enable row level security;
revoke all on public.team_meetings, public.team_meeting_msgs, public.team_meeting_tasks from anon, authenticated;
