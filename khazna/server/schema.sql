-- الخزنة — جداول الإشعارات (المهام: الاسم والوقت فقط، بدون أي بيانات مالية)
create table if not exists public.khazna_devices (
  device_hash  text primary key,            -- sha256 of a secret that lives only on the phone
  subscription jsonb,                       -- Web Push subscription
  tz           text not null default 'Asia/Riyadh',
  morning      text,                        -- 'HH:MM' daily summary, null = off
  morning_sent date,
  updated_at   timestamptz not null default now()
);

create table if not exists public.khazna_reminders (
  device_hash text not null references public.khazna_devices(device_hash) on delete cascade,
  task_id     text not null,
  title       text not null,
  time        text,                         -- 'HH:MM' local (null = no own push, counted in morning summary)
  date        date,                         -- one-off date (null when daily)
  daily       boolean not null default false,
  skip_date   date,                         -- task already done on this day → no push
  last_sent   date,
  primary key (device_hash, task_id)
);

-- Locked down: no anon/authenticated access at all. Only the edge functions (service role) touch these tables.
alter table public.khazna_devices   enable row level security;
alter table public.khazna_reminders enable row level security;
revoke all on public.khazna_devices, public.khazna_reminders from anon, authenticated;

-- Server-only settings (VAPID private key, cron secret). Never readable by anon.
create table if not exists public.khazna_config (key text primary key, value text not null);
alter table public.khazna_config enable row level security;
revoke all on public.khazna_config from anon, authenticated;
