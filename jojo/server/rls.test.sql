-- RLS / privilege tests for جوجو. Run after test/supabase-shim.sql and schema.sql
-- (see test/run-rls.sh). Any failed assertion RAISEs and aborts (ON_ERROR_STOP=1).
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = warning;
\o /dev/null

-- ---------------------------------------------------------------- helpers
drop schema if exists jt cascade;
create schema jt;
create table jt.results (n serial, label text not null);

-- count rows a query returns, as the CURRENT role
create function jt.n(q text) returns bigint language plpgsql as $$
declare c bigint;
begin execute 'select count(*) from (' || q || ') s' into c; return c; end $$;

-- run a statement as the CURRENT role: 'denied' on permission/RLS error, else 'ok:<rows>'
create function jt.try(q text) returns text language plpgsql as $$
declare c bigint;
begin
  execute q; get diagnostics c = row_count; return 'ok:' || c;
exception when insufficient_privilege then return 'denied';
end $$;

-- read: rows visible, or -1 if reading is denied outright
create function jt.see(q text) returns bigint language plpgsql as $$
begin return jt.n(q);
exception when insufficient_privilege then return -1;
end $$;

create function jt.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', label; end if;
  insert into jt.results(label) values (label);
end $$;

grant usage on schema jt to anon, authenticated, service_role;
grant execute on all functions in schema jt to anon, authenticated, service_role;
grant insert, select on jt.results to anon, authenticated, service_role;
grant usage on all sequences in schema jt to anon, authenticated, service_role;

-- ---------------------------------------------------------------- seed (superuser)
-- jojo  = 1111..., saleh = 2222..., other (some other khazna user, no profile) = 3333...
insert into auth.users(id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333')
on conflict do nothing;
insert into public.jojo_profiles(user_id, role, settings) values
  ('11111111-1111-1111-1111-111111111111', 'jojo',  '{"water_goal":8}'),
  ('22222222-2222-2222-2222-222222222222', 'saleh', '{}');
insert into public.jojo_checks(user_id, date, key, value) values
  ('11111111-1111-1111-1111-111111111111', '2026-11-24', 'fajr', 'true');
insert into public.jojo_tasks(id, user_id, title, days) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'مذاكرة', '{0,1,2}');
insert into public.jojo_notes(id, user_id, body) values
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'سر');
insert into public.jojo_letters(id, user_id, body) values
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'هلا صالح');
insert into public.jojo_daily(user_id, date, pct) values
  ('11111111-1111-1111-1111-111111111111', '2026-11-24', 80);
insert into public.jojo_messages(id, kind, for_date, body) values
  ('aaaaaaaa-0000-0000-0000-000000000004', 'daily', '2026-11-24', 'صباح الخير');
insert into public.jojo_messages(id, kind, for_date, body) values
  ('aaaaaaaa-0000-0000-0000-0000000000f9', 'daily', ((now() at time zone 'Asia/Riyadh')::date + 1), 'رسالة بكرة');
insert into public.jojo_beans(id, user_id, roaster, name) values
  ('aaaaaaaa-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Some Roaster', 'Ethiopia');
insert into public.jojo_ratings(id, user_id, bean_id, liked, notes) values
  ('aaaaaaaa-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000005', true, '{berry}');
insert into public.jojo_recipes(id, name, style, dose, water, temp_c, target_sec, grind_encore) values ('r1', 'V60 hot', 'hot', 15, 250, 93, 180, 16);
insert into public.jojo_push(user_id, subscription, tz) values
  ('11111111-1111-1111-1111-111111111111', '{}', 'Asia/Riyadh');
insert into public.jojo_config(key, value) values ('vapid_private', '"secret"');

select jt.ok((select count(*) from public.jojo_notes)  = 1, 'seed: notes row exists');
select jt.ok((select count(*) from public.jojo_checks) = 1, 'seed: checks row exists');
select jt.ok((select count(*) from public.jojo_tasks)  = 1, 'seed: tasks row exists');

-- ================================================================ SALEH
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select jt.ok(public.jojo_is_saleh() = true, 'saleh: jojo_is_saleh() true');
-- private data: never visible, never writable
select jt.ok(jt.see('select * from public.jojo_notes')  = 0, 'saleh: sees 0 jojo_notes');
select jt.ok(jt.see('select * from public.jojo_checks') = 0, 'saleh: sees 0 jojo_checks');
select jt.ok(jt.see('select * from public.jojo_tasks')  = 0, 'saleh: sees 0 jojo_tasks');
select jt.ok(jt.try($q$update public.jojo_notes set body='x'$q$) in ('ok:0','denied'), 'saleh: cannot update notes');
select jt.ok(jt.try($q$delete from public.jojo_notes$q$) in ('ok:0','denied'), 'saleh: cannot delete notes');
select jt.ok(jt.try($q$delete from public.jojo_checks$q$) in ('ok:0','denied'), 'saleh: cannot delete checks');
select jt.ok(jt.try($q$insert into public.jojo_notes(user_id, body) values ('11111111-1111-1111-1111-111111111111','x')$q$) = 'denied', 'saleh: cannot insert note as jojo');
select jt.ok(jt.try($q$insert into public.jojo_notes(user_id, body) values ('22222222-2222-2222-2222-222222222222','x')$q$) = 'denied', 'saleh: cannot insert note for himself');
-- daily: read only
select jt.ok(jt.see('select * from public.jojo_daily') = 1, 'saleh: reads jojo_daily');
select jt.ok(jt.try($q$update public.jojo_daily set pct=100$q$) in ('ok:0','denied'), 'saleh: cannot update jojo_daily');
select jt.ok(jt.try($q$insert into public.jojo_daily(user_id,date,pct) values ('11111111-1111-1111-1111-111111111111','2026-11-23',100)$q$) = 'denied', 'saleh: cannot insert jojo_daily');
-- letters: read all, update read_at only
select jt.ok(jt.see('select * from public.jojo_letters') = 1, 'saleh: reads jojo_letters');
select jt.ok(jt.try($q$update public.jojo_letters set read_at = now()$q$) = 'ok:1', 'saleh: can set read_at');
select jt.ok(jt.try($q$update public.jojo_letters set body = 'hacked'$q$) = 'denied', 'saleh: cannot change letter body');
select jt.ok(jt.try($q$update public.jojo_letters set body = 'hacked', read_at = now()$q$) = 'denied', 'saleh: cannot change body alongside read_at');
select jt.ok(jt.try($q$update public.jojo_letters set user_id = '22222222-2222-2222-2222-222222222222'$q$) = 'denied', 'saleh: cannot change letter owner');
select jt.ok(jt.try($q$delete from public.jojo_letters$q$) in ('ok:0','denied'), 'saleh: cannot delete letter');
select jt.ok(jt.try($q$insert into public.jojo_letters(user_id, body) values ('11111111-1111-1111-1111-111111111111','fake')$q$) = 'denied', 'saleh: cannot insert letter');
-- messages: full control
select jt.ok(jt.try($q$insert into public.jojo_messages(id, kind, for_date, body) values ('aaaaaaaa-0000-0000-0000-000000000007','achievement','2026-11-24','كفو')$q$) = 'ok:1', 'saleh: inserts jojo_messages');
select jt.ok(jt.see('select * from public.jojo_messages') = 3, 'saleh: reads jojo_messages (incl. tomorrow)');
select jt.ok(jt.try($q$update public.jojo_messages set body='كفو يا بطلة' where id='aaaaaaaa-0000-0000-0000-000000000007'$q$) = 'ok:1', 'saleh: updates jojo_messages');
select jt.ok(jt.try($q$delete from public.jojo_messages where id='aaaaaaaa-0000-0000-0000-000000000007'$q$) = 'ok:1', 'saleh: deletes jojo_messages');
-- taste summary: read only
select jt.ok(jt.see('select * from public.jojo_ratings') = 1, 'saleh: reads jojo_ratings');
select jt.ok(jt.see('select * from public.jojo_beans') = 1, 'saleh: reads jojo_beans');
select jt.ok(jt.try($q$update public.jojo_ratings set liked=false$q$) in ('ok:0','denied'), 'saleh: cannot update ratings');
select jt.ok(jt.try($q$delete from public.jojo_beans$q$) in ('ok:0','denied'), 'saleh: cannot delete beans');
select jt.ok(jt.try($q$insert into public.jojo_beans(user_id,name) values ('11111111-1111-1111-1111-111111111111','x')$q$) = 'denied', 'saleh: cannot insert beans');
-- profiles: own row only
select jt.ok(jt.see('select * from public.jojo_profiles') = 1, 'saleh: sees exactly 1 profile');
select jt.ok(jt.see($q$select * from public.jojo_profiles where user_id='11111111-1111-1111-1111-111111111111'$q$) = 0, 'saleh: cannot read jojo profile/settings');
select jt.ok(jt.try($q$update public.jojo_profiles set settings='{}' where user_id='11111111-1111-1111-1111-111111111111'$q$) in ('ok:0','denied'), 'saleh: cannot update jojo settings');
-- server-only
select jt.ok(jt.see('select * from public.jojo_config') = -1, 'saleh: jojo_config denied');
select jt.ok(jt.see('select * from public.jojo_push') = -1, 'saleh: jojo_push denied');
commit;

-- superuser verification of Saleh's attempts
select jt.ok((select body from public.jojo_letters where id='aaaaaaaa-0000-0000-0000-000000000003') = 'هلا صالح', 'verify: letter body unchanged');
select jt.ok((select read_at from public.jojo_letters where id='aaaaaaaa-0000-0000-0000-000000000003') is not null, 'verify: read_at was set');
select jt.ok((select count(*) from public.jojo_notes where body='سر') = 1, 'verify: note untouched');
select jt.ok((select pct from public.jojo_daily where date='2026-11-24') = 80, 'verify: daily untouched');
select jt.ok((select count(*) from public.jojo_letters) = 1, 'verify: letter not deleted');

-- ================================================================ JOJO
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select jt.ok(public.jojo_is_saleh() = false, 'jojo: jojo_is_saleh() false');
select jt.ok(jt.see($q$select * from public.jojo_messages where id='aaaaaaaa-0000-0000-0000-0000000000f9'$q$) = 0, 'jojo: cannot see tomorrow''s daily message');
-- review fix: a letter inserted by Jojo can't carry a fake read receipt or backdate
select jt.ok(jt.try($q$insert into public.jojo_letters(id, user_id, body, read_at, created_at) values ('aaaaaaaa-0000-0000-0000-0000000000f1','11111111-1111-1111-1111-111111111111','x', now(), '2020-01-01')$q$) = 'ok:1', 'jojo: inserts letter with forged fields');
select jt.ok((select read_at is null and created_at > '2026-01-01' from public.jojo_letters where id='aaaaaaaa-0000-0000-0000-0000000000f1'), 'jojo: forged read_at/created_at are reset on insert');
delete from public.jojo_letters where id='aaaaaaaa-0000-0000-0000-0000000000f1';
-- own private data
select jt.ok(jt.see('select * from public.jojo_notes') = 1, 'jojo: reads own notes');
select jt.ok(jt.see('select * from public.jojo_checks') = 1, 'jojo: reads own checks');
select jt.ok(jt.see('select * from public.jojo_tasks') = 1, 'jojo: reads own tasks');
select jt.ok(jt.try($q$insert into public.jojo_notes(user_id, body) values ('11111111-1111-1111-1111-111111111111','new')$q$) = 'ok:1', 'jojo: inserts own note');
select jt.ok(jt.try($q$update public.jojo_notes set body='سر٢' where id='aaaaaaaa-0000-0000-0000-000000000002'$q$) = 'ok:1', 'jojo: updates own note');
select jt.ok(jt.try($q$insert into public.jojo_notes(user_id, body) values ('22222222-2222-2222-2222-222222222222','spoof')$q$) = 'denied', 'jojo: cannot insert note as saleh');
select jt.ok(jt.try($q$update public.jojo_notes set user_id='22222222-2222-2222-2222-222222222222'$q$) = 'denied', 'jojo: cannot hand note to saleh');
select jt.ok(jt.try($q$insert into public.jojo_checks(user_id,date,key,value) values ('11111111-1111-1111-1111-111111111111','2026-11-24','water','3') on conflict (user_id,date,key) do update set value=excluded.value$q$) = 'ok:1', 'jojo: upserts own check');
select jt.ok(jt.try($q$insert into public.jojo_tasks(user_id,title,days) values ('11111111-1111-1111-1111-111111111111','قراءة','{5}')$q$) = 'ok:1', 'jojo: inserts own task');
select jt.ok(jt.try($q$delete from public.jojo_tasks where title='قراءة'$q$) = 'ok:1', 'jojo: deletes own task');
-- daily upsert
select jt.ok(jt.try($q$insert into public.jojo_daily(user_id,date,pct) values ('11111111-1111-1111-1111-111111111111','2026-11-24',90) on conflict (user_id,date) do update set pct=excluded.pct$q$) = 'ok:1', 'jojo: upserts own daily');
-- letters
select jt.ok(jt.try($q$insert into public.jojo_letters(id,user_id,body) values ('aaaaaaaa-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','ثاني')$q$) = 'ok:1', 'jojo: writes a letter');
select jt.ok(jt.try($q$update public.jojo_letters set body='ثاني معدل' where id='aaaaaaaa-0000-0000-0000-000000000008'$q$) = 'ok:1', 'jojo: edits own letter');
select jt.ok(jt.try($q$update public.jojo_letters set read_at=null where id='aaaaaaaa-0000-0000-0000-000000000003'$q$) = 'denied', 'jojo: cannot fake/clear read_at');
select jt.ok(jt.try($q$delete from public.jojo_letters where id='aaaaaaaa-0000-0000-0000-000000000008'$q$) = 'ok:1', 'jojo: deletes own letter');
-- messages: read + seen_at only
select jt.ok(jt.see('select * from public.jojo_messages') = 1, 'jojo: reads jojo_messages');
select jt.ok(jt.try($q$insert into public.jojo_messages(kind, for_date, body) values ('daily','2026-11-25','fake')$q$) = 'denied', 'jojo: cannot insert jojo_messages');
select jt.ok(jt.try($q$update public.jojo_messages set seen_at=now()$q$) = 'ok:1', 'jojo: sets seen_at');
select jt.ok(jt.try($q$update public.jojo_messages set body='x'$q$) = 'denied', 'jojo: cannot change message body');
select jt.ok(jt.try($q$update public.jojo_messages set body='x', seen_at=now()$q$) = 'denied', 'jojo: cannot change body alongside seen_at');
select jt.ok(jt.try($q$delete from public.jojo_messages$q$) in ('ok:0','denied'), 'jojo: cannot delete jojo_messages');
-- profile: own settings yes, role no
select jt.ok(jt.see('select * from public.jojo_profiles') = 1, 'jojo: sees only own profile');
select jt.ok(jt.try($q$update public.jojo_profiles set settings='{"water_goal":10}'$q$) = 'ok:1', 'jojo: updates own settings');
select jt.ok(jt.try($q$update public.jojo_profiles set role='jojo'$q$) = 'denied', 'jojo: role column not updatable at all');
select jt.ok(jt.try($q$update public.jojo_profiles set role='saleh'$q$) = 'denied', 'jojo: cannot change own role');
select jt.ok(jt.try($q$update public.jojo_profiles set user_id='33333333-3333-3333-3333-333333333333'$q$) = 'denied', 'jojo: cannot change profile user_id');
select jt.ok(jt.try($q$insert into public.jojo_profiles(user_id, role) values ('33333333-3333-3333-3333-333333333333','saleh')$q$) = 'denied', 'jojo: cannot insert profiles');
select jt.ok(jt.try($q$delete from public.jojo_profiles$q$) = 'denied', 'jojo: cannot delete profile');
-- beans/ratings: own full
select jt.ok(jt.try($q$update public.jojo_ratings set liked=false$q$) = 'ok:1', 'jojo: updates own rating');
select jt.ok(jt.try($q$insert into public.jojo_beans(user_id,name) values ('11111111-1111-1111-1111-111111111111','Kenya')$q$) = 'ok:1', 'jojo: inserts own bean');
-- reference data read-only
select jt.ok(jt.see('select * from public.jojo_recipes') = 1, 'jojo: reads recipes');
select jt.ok(jt.try($q$insert into public.jojo_recipes(id,name,style,dose,water,temp_c,target_sec,grind_encore) values ('x','x','hot',1,1,1,1,1)$q$) = 'denied', 'jojo: cannot write recipes');
-- server-only
select jt.ok(jt.see('select * from public.jojo_config') = -1, 'jojo: jojo_config denied');
select jt.ok(jt.see('select * from public.jojo_push') = -1, 'jojo: jojo_push denied');
select jt.ok(jt.try($q$insert into public.jojo_push(user_id, subscription) values ('11111111-1111-1111-1111-111111111111','{}') on conflict do nothing$q$) = 'denied', 'jojo: cannot write jojo_push');
commit;

select jt.ok((select role from public.jojo_profiles where user_id='11111111-1111-1111-1111-111111111111') = 'jojo', 'verify: jojo role unchanged');
select jt.ok((select body from public.jojo_messages where id='aaaaaaaa-0000-0000-0000-000000000004') = 'صباح الخير', 'verify: message body unchanged');
select jt.ok((select seen_at from public.jojo_messages where id='aaaaaaaa-0000-0000-0000-000000000004') is not null, 'verify: seen_at set');
select jt.ok((select read_at from public.jojo_letters where id='aaaaaaaa-0000-0000-0000-000000000003') is not null, 'verify: read_at not cleared by jojo');

-- ================================================================ OTHER authenticated user (no jojo profile)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare t text;
begin
  foreach t in array array['jojo_profiles','jojo_checks','jojo_tasks','jojo_notes','jojo_letters','jojo_daily',
                           'jojo_messages','jojo_beans','jojo_ratings','jojo_push','jojo_config'] loop
    perform jt.ok(jt.see('select * from public.' || t) <= 0, 'other user: sees nothing in ' || t);
  end loop;
end $$;
select jt.ok(jt.try($q$insert into public.jojo_notes(user_id, body) values ('33333333-3333-3333-3333-333333333333','x')$q$) = 'denied', 'other user: cannot create jojo data');
select jt.ok(jt.try($q$update public.jojo_messages set seen_at=now()$q$) in ('ok:0','denied'), 'other user: cannot touch messages');
commit;

-- ================================================================ ANON
begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare t text;
begin
  foreach t in array array['jojo_profiles','jojo_checks','jojo_tasks','jojo_notes','jojo_letters','jojo_daily',
                           'jojo_messages','jojo_beans','jojo_ratings','jojo_recipes',
                           'jojo_push','jojo_config'] loop
    perform jt.ok(jt.see('select * from public.' || t) <= 0, 'anon: reads nothing from ' || t);
  end loop;
end $$;
select jt.ok(jt.try($q$insert into public.jojo_messages(kind, for_date, body) values ('daily','2026-11-25','x')$q$) = 'denied', 'anon: cannot insert messages');
commit;

-- ================================================================ SERVICE ROLE
begin;
set local role service_role;
select jt.ok(jt.see('select * from public.jojo_config') = 1, 'service_role: reads jojo_config');
select jt.ok(jt.see('select * from public.jojo_notes') >= 1, 'service_role: bypasses RLS');
select jt.ok(jt.try($q$insert into public.jojo_recipes(id,name,style,dose,water,temp_c,target_sec,grind_encore) values ('r2','x','iced',1,1,1,1,1)$q$) = 'ok:1', 'service_role: writes recipes');
commit;

\o
\unset QUIET
\pset tuples_only on
select format('PASS: all %s RLS assertions passed', count(*)) as result from jt.results;
