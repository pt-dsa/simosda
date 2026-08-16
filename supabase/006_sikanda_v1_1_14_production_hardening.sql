-- SIKANDA V1.1.14 Production Hardening
-- Jalankan seluruh file sebagai satu blok SETELAH backup database.
-- Idempoten: aman dijalankan ulang.

begin;

-- Koordinat berada pada baris aset yang sama sehingga create/update aset dan
-- koordinat berlangsung dalam satu transaksi PostgREST.
alter table if exists public.assets_vehicle
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists foto_storage_path text,
  add column if not exists foto_provider text;

alter table if exists public.assets_equipment
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists foto_storage_path text,
  add column if not exists foto_provider text;

alter table if exists public.app_access
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by text;

create index if not exists assets_vehicle_foto_storage_idx
  on public.assets_vehicle (foto_storage_path)
  where foto_storage_path is not null;
create index if not exists assets_equipment_foto_storage_idx
  on public.assets_equipment (foto_storage_path)
  where foto_storage_path is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assets_vehicle_foto_provider_check'
      and conrelid = 'public.assets_vehicle'::regclass
  ) then
    alter table public.assets_vehicle add constraint assets_vehicle_foto_provider_check
      check (foto_provider is null or foto_provider in ('supabase', 'drive'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'assets_equipment_foto_provider_check'
      and conrelid = 'public.assets_equipment'::regclass
  ) then
    alter table public.assets_equipment add constraint assets_equipment_foto_provider_check
      check (foto_provider is null or foto_provider in ('supabase', 'drive'));
  end if;
end $$;

-- Bucket foto aset selalu private. Browser hanya menerima signed URL singkat
-- dari backend dan tidak pernah memperoleh service-role key.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'asset-photos',
  'asset-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Audit database ini berada pada transaksi yang sama dengan perubahan data.
-- Jika audit gagal ditulis, perubahan utama ikut dibatalkan (fail-closed).
create or replace function public.sikanda_db_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  actor text;
  entity_key text;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  actor := coalesce(nullif(row_data->>'updated_by', ''), nullif(row_data->>'created_by', ''), 'database');
  entity_key := coalesce(
    row_data->>'nip', row_data->>'asset_id', row_data->>'email',
    row_data->>'key', row_data->>'config_key', ''
  );
  insert into public.audit_logs (
    actor_email, actor_role, action, entity_type, entity_id, details
  ) values (
    actor, 'database', lower(tg_table_name || '.' || tg_op), tg_table_name,
    entity_key, jsonb_build_object('source', 'database_trigger', 'operation', tg_op)
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists sikanda_audit_pegawai on public.pegawai;
create trigger sikanda_audit_pegawai
after insert or update or delete on public.pegawai
for each row execute function public.sikanda_db_audit();

drop trigger if exists sikanda_audit_assets_vehicle on public.assets_vehicle;
create trigger sikanda_audit_assets_vehicle
after insert or update or delete on public.assets_vehicle
for each row execute function public.sikanda_db_audit();

drop trigger if exists sikanda_audit_assets_equipment on public.assets_equipment;
create trigger sikanda_audit_assets_equipment
after insert or update or delete on public.assets_equipment
for each row execute function public.sikanda_db_audit();

drop trigger if exists sikanda_audit_app_access on public.app_access;
create trigger sikanda_audit_app_access
after insert or update or delete on public.app_access
for each row execute function public.sikanda_db_audit();

drop trigger if exists sikanda_audit_system_config on public.system_config;
create trigger sikanda_audit_system_config
after insert or update or delete on public.system_config
for each row execute function public.sikanda_db_audit();

alter table public.assets_vehicle enable row level security;
alter table public.assets_equipment enable row level security;
alter table public.app_access enable row level security;
revoke all on table public.assets_vehicle, public.assets_equipment, public.app_access from anon, authenticated;
grant all on table public.assets_vehicle, public.assets_equipment, public.app_access to service_role;
grant execute on function public.sikanda_db_audit() to service_role;

commit;

-- Verifikasi terpisah setelah COMMIT:
-- select id, name, public, file_size_limit from storage.buckets where id in ('pegawai-photos','asset-photos');
-- select trigger_name, event_object_table from information_schema.triggers where trigger_name like 'sikanda_audit_%';
