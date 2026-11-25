-- يطبّق على مشروع rays-quality: أي شكوى جديدة → تنبيه فوري لتبويب «الفريق» في الخزنة (رسالة من مشعل + إشعار)
-- المفتاح محفوظ في Vault باسم khazna_team_secret (نفس قيمة khazna_config.team_secret في مشروع khazna) — ما ينكتب هنا
-- يرسل الكود والفئة والفرع والخطورة فقط، بدون اسم العميل أو رقمه
create or replace function public.notify_khazna_team()
returns trigger language plpgsql security definer set search_path = public as $$
declare sec text;
begin
  select decrypted_secret into sec from vault.decrypted_secrets where name = 'khazna_team_secret' limit 1;
  if sec is null then return new; end if;
  perform net.http_post(
    url := 'https://lpsifrdiangpfcwhjeim.supabase.co/functions/v1/khazna-team',
    body := jsonb_build_object('action','notify','code',new.code,'category',new.category,'branch',new.branch,'severity',new.severity),
    headers := jsonb_build_object('Content-Type','application/json','x-team-secret',sec)
  );
  return new;
exception when others then
  return new; -- تنبيه الفريق ما يوقف تسجيل الشكوى أبد
end $$;
revoke all on function public.notify_khazna_team() from public, anon, authenticated;
drop trigger if exists complaints_khazna_team on public.complaints;
create trigger complaints_khazna_team after insert on public.complaints
for each row execute function public.notify_khazna_team();
