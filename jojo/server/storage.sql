-- جوجو — private Storage bucket for coffee-bag photos.  Apply AFTER schema.sql
-- (policies call public.jojo_is_saleh()).  Idempotent; no-op where the Supabase
-- `storage` schema does not exist (e.g. the local RLS test DB).
-- Object path convention: <auth.uid()>/<file>   e.g. 1111.../2026-11-24-bag.jpg
do $do$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present - skipping jojo-beans bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('jojo-beans', 'jojo-beans', false)
  on conflict (id) do update set public = false;

  execute 'drop policy if exists jojo_beans_obj_insert_own on storage.objects';
  execute $p$create policy jojo_beans_obj_insert_own on storage.objects for insert to authenticated
    with check (bucket_id = 'jojo-beans' and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  execute 'drop policy if exists jojo_beans_obj_select_own on storage.objects';
  execute $p$create policy jojo_beans_obj_select_own on storage.objects for select to authenticated
    using (bucket_id = 'jojo-beans' and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  execute 'drop policy if exists jojo_beans_obj_delete_own on storage.objects';
  execute $p$create policy jojo_beans_obj_delete_own on storage.objects for delete to authenticated
    using (bucket_id = 'jojo-beans' and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  execute 'drop policy if exists jojo_beans_obj_select_saleh on storage.objects';
  execute $p$create policy jojo_beans_obj_select_saleh on storage.objects for select to authenticated
    using (bucket_id = 'jojo-beans' and public.jojo_is_saleh())$p$;
end
$do$;
