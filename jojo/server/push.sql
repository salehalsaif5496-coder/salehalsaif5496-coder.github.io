-- جوجو — سجل التنبيهات المرسلة (منع التكرار). Idempotent; safe to re-run.
-- jojo-tick يحجز (user_id, date, key) قبل ما يرسل: لو الصف موجود ما يرسل مرة ثانية.
-- مثل jojo_push و jojo_config: service role بس.
create table if not exists public.jojo_push_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  date    date not null,                 -- اليوم بتوقيتها (Asia/Riyadh)
  key     text not null,                 -- مثل task:<id>@16:00 · prayer:fajr · water@12:30 · msg:<id>
  sent_at timestamptz not null default now(),
  primary key (user_id, date, key)
);
create index if not exists jojo_push_log_date on public.jojo_push_log(date);

revoke all on public.jojo_push_log from public, anon, authenticated;
grant all on public.jojo_push_log to service_role;
alter table public.jojo_push_log enable row level security;
-- RLS on, no policies, no grants for client roles => service role only.
