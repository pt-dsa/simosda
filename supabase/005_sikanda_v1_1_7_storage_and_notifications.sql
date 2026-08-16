-- SIKANDA V1.1.7 - Supabase Storage private untuk foto pegawai.
-- Idempoten. Jalankan di SQL Editor setelah backup database.

begin;

alter table if exists public.pegawai
  add column if not exists foto_storage_path text,
  add column if not exists foto_provider text,
  add column if not exists foto_migration_status text,
  add column if not exists foto_migrated_at timestamptz;

create index if not exists pegawai_foto_storage_idx
  on public.pegawai (foto_storage_path)
  where foto_storage_path is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pegawai_foto_provider_check'
      and conrelid = 'public.pegawai'::regclass
  ) then
    alter table public.pegawai add constraint pegawai_foto_provider_check
      check (foto_provider is null or foto_provider in ('supabase', 'drive'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'pegawai_foto_migration_status_check'
      and conrelid = 'public.pegawai'::regclass
  ) then
    alter table public.pegawai add constraint pegawai_foto_migration_status_check
      check (foto_migration_status is null or foto_migration_status in ('ready', 'failed', 'skipped'));
  end if;
end $$;

-- Bucket tidak public. Browser tidak memperoleh service role; akses baca
-- diberikan oleh Apps Script melalui signed URL berumur pendek.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pegawai-photos',
  'pegawai-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Pastikan URL signed tidak pernah disimpan sebagai data permanen.
update public.pegawai
set foto_provider = case
  when foto_storage_path is not null and trim(foto_storage_path) <> '' then 'supabase'
  when foto is not null and trim(foto) <> '' then 'drive'
  else foto_provider
end
where foto_provider is null;

commit;

-- Verifikasi:
-- select foto_provider, foto_migration_status, count(*)
-- from public.pegawai group by 1, 2 order by 1, 2;
-- select id, name, public, file_size_limit from storage.buckets where id='pegawai-photos';
