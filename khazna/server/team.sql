-- الخزنة — تبويب «الفريق»: الموظفين وحالتهم وبريدهم وطابور إشعاراتهم
-- مقفلة تمامًا: التطبيق يوصل لها عبر edge function khazna-team فقط (service role)

create table if not exists public.team_members (
  id           text primary key,
  n            text not null,              -- الاسم
  t            text not null,              -- المنصب
  d            text,                       -- وصف قصير
  dept         text,                       -- اسم القسم (لرئيس القسم)
  boss         text,                       -- id المدير المباشر
  lead         boolean not null default false,
  paused_until date,                       -- القسم موقوف لين هالتاريخ
  duty         text,                       -- شغله في الجولة
  cadence      text not null default 'on_demand' check (cadence in ('daily','every2','weekly','monthly','on_demand')),
  tasks        text[] not null default '{}',
  ref          text,
  rule         text,
  ord          int not null default 100,
  updated_at   timestamptz not null default now()
);

create table if not exists public.team_status (
  member_id  text primary key references public.team_members(id) on delete cascade,
  working    boolean not null default false,
  doing      text,
  last_done  timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.team_mail (
  id         uuid primary key default gen_random_uuid(),
  member_id  text references public.team_members(id) on delete set null,
  from_name  text not null,                -- يبقى الاسم حتى لو انحذف الموظف
  subject    text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists team_mail_created on public.team_mail (created_at desc);

create table if not exists public.team_push (
  id      uuid primary key default gen_random_uuid(),
  title   text not null,
  body    text not null,
  url     text not null default '/khazna/#team',
  tag     text,
  send_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists team_push_pending on public.team_push (send_at) where sent_at is null;

alter table public.team_members enable row level security;
alter table public.team_status  enable row level security;
alter table public.team_mail    enable row level security;
alter table public.team_push    enable row level security;
revoke all on public.team_members, public.team_status, public.team_mail, public.team_push from anon, authenticated;

-- يحجز رسائل الطابور الجاهزة ويعلّمها مرسلة بنفس الخطوة (ما تتكرر لو khazna-tick اشتغل مرتين)
create or replace function public.team_claim_push() returns setof public.team_push
language sql security definer set search_path = public as $$
  update public.team_push set sent_at = now()
  where id in (select id from public.team_push where sent_at is null and send_at <= now() for update skip locked)
  returning *;
$$;
revoke all on function public.team_claim_push() from anon, authenticated, public;
grant execute on function public.team_claim_push() to service_role;
-- team_secret: مفتاح عشوائي داخل khazna_config (ما ينكتب هنا) — تستخدمه rays-quality لتنبيه الشكاوى
