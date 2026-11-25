-- الخزنة — صور في شات «اجتماع»: صالح يرفق صور، والموظفين يشوفونها وقت الرد
-- الصور في مخزن خاص (مو عام): يوصل لها khazna-team بس، ويعطي الجوال روابط موقّعة لمدة ساعة

alter table public.team_meeting_msgs add column if not exists images text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-meet', 'team-meet', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
-- بدون سياسات RLS على storage.objects لهالمخزن: anon و authenticated ما يوصلون له، الخادم بس
