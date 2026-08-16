-- SIKANDA V1.1.14 - KIB B Smart Import, unit INDEX, dan galeri lampiran
-- Jalankan SETELAH 006_sikanda_v1_1_14_production_hardening.sql.
-- Idempoten dan tidak menghapus kolom/data lama.
begin;

alter table if exists public.assets_equipment
  add column if not exists opd text,
  add column if not exists kib_index text,
  add column if not exists unit_indexes text[] not null default '{}',
  add column if not exists register_barang text,
  add column if not exists spesifikasi text,
  add column if not exists bidang text,
  add column if not exists mutasi text,
  add column if not exists dokumentasi jsonb not null default '[]'::jsonb,
  add column if not exists dokumentasi_primary_id text,
  add column if not exists import_source text,
  add column if not exists import_batch_id uuid,
  add column if not exists import_fingerprint text,
  add column if not exists imported_at timestamptz;

create index if not exists assets_equipment_tahun_idx on public.assets_equipment (tahun);
create index if not exists assets_equipment_jenis_idx on public.assets_equipment (jenis);
create index if not exists assets_equipment_bidang_idx on public.assets_equipment (bidang);
create index if not exists assets_equipment_pengguna_idx on public.assets_equipment (pengguna);
create index if not exists assets_equipment_kib_index_idx on public.assets_equipment (kib_index)
  where nullif(btrim(kib_index), '') is not null;
create unique index if not exists assets_equipment_kib_index_uidx
  on public.assets_equipment (upper(btrim(kib_index)))
  where nullif(btrim(kib_index), '') is not null;
create unique index if not exists assets_equipment_import_fingerprint_uidx
  on public.assets_equipment (import_fingerprint);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'assets_equipment_dokumentasi_array_check'
      and conrelid = 'public.assets_equipment'::regclass
  ) then
    alter table public.assets_equipment add constraint assets_equipment_dokumentasi_array_check
      check (jsonb_typeof(dokumentasi) = 'array');
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'asset-attachments', 'asset-attachments', false, 5242880,
  array[
    'image/jpeg','image/png','image/webp','application/pdf',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.assets_equipment enable row level security;
revoke all on table public.assets_equipment from anon, authenticated;
grant all on table public.assets_equipment to service_role;

commit;

-- Verifikasi:
-- select column_name, data_type from information_schema.columns
-- where table_schema='public' and table_name='assets_equipment' order by ordinal_position;
-- select id, public, file_size_limit from storage.buckets where id='asset-attachments';
