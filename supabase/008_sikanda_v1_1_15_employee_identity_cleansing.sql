-- SIKANDA V1.1.15 - Identitas pegawai terpusat dan cleansing pengguna aset
-- Jalankan SETELAH 007_sikanda_v1_1_14_kib_b_import_gallery.sql.
-- Idempoten: tidak menghapus kolom/data lama dan aman dijalankan ulang.
begin;

create or replace function public.sikanda_normalize_employee_name(value text)
returns text
language sql
immutable
parallel safe
as $$
  select upper(regexp_replace(coalesce(value, ''), '[^[:alnum:]]+', '', 'g'));
$$;

alter table if exists public.assets_vehicle
  add column if not exists pengguna_nip text,
  add column if not exists pengguna_raw text,
  add column if not exists pengguna_match_status text not null default 'unmatched',
  add column if not exists penanggung_jawab_nip text;

alter table if exists public.assets_equipment
  add column if not exists pengguna_nip text,
  add column if not exists pengguna_raw text,
  add column if not exists pengguna_match_status text not null default 'unmatched',
  add column if not exists penanggung_jawab_nip text;

-- Simpan nama sumber sebelum nama tampilan diselaraskan dengan nama resmi.
update public.assets_vehicle
set pengguna_raw = pengguna
where nullif(btrim(pengguna), '') is not null
  and nullif(btrim(pengguna_raw), '') is null;

update public.assets_equipment
set pengguna_raw = pengguna
where nullif(btrim(pengguna), '') is not null
  and nullif(btrim(pengguna_raw), '') is null;

-- Hanya kecocokan nama persis setelah normalisasi dan hanya bila kandidat
-- pegawainya tunggal. Kemiripan/fuzzy tidak pernah ditautkan otomatis.
with unique_employee as (
  select public.sikanda_normalize_employee_name(nama) as normalized_name,
         min(nip) as nip,
         min(nama) as nama
  from public.pegawai
  where coalesce(is_active, true) = true
    and nullif(btrim(nip), '') is not null
    and nullif(btrim(nama), '') is not null
  group by public.sikanda_normalize_employee_name(nama)
  having count(*) = 1
)
update public.assets_vehicle asset
set pengguna_nip = employee.nip,
    pengguna = employee.nama,
    pengguna_match_status = 'matched'
from unique_employee employee
where nullif(btrim(asset.pengguna), '') is not null
  and nullif(btrim(asset.pengguna_nip), '') is null
  and public.sikanda_normalize_employee_name(asset.pengguna) = employee.normalized_name;

with unique_employee as (
  select public.sikanda_normalize_employee_name(nama) as normalized_name,
         min(nip) as nip,
         min(nama) as nama
  from public.pegawai
  where coalesce(is_active, true) = true
    and nullif(btrim(nip), '') is not null
    and nullif(btrim(nama), '') is not null
  group by public.sikanda_normalize_employee_name(nama)
  having count(*) = 1
)
update public.assets_equipment asset
set pengguna_nip = employee.nip,
    pengguna = employee.nama,
    pengguna_match_status = 'matched'
from unique_employee employee
where nullif(btrim(asset.pengguna), '') is not null
  and nullif(btrim(asset.pengguna_nip), '') is null
  and public.sikanda_normalize_employee_name(asset.pengguna) = employee.normalized_name;

update public.assets_vehicle
set pengguna_match_status = case
  when nullif(btrim(pengguna_nip), '') is not null then 'matched'
  when nullif(btrim(pengguna_raw), '') is not null then 'unmatched'
  else 'unmatched'
end;

update public.assets_equipment
set pengguna_match_status = case
  when nullif(btrim(pengguna_nip), '') is not null then 'matched'
  when nullif(btrim(pengguna_raw), '') is not null then 'unmatched'
  else 'unmatched'
end;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assets_vehicle_pengguna_match_status_check'
      and conrelid = 'public.assets_vehicle'::regclass
  ) then
    alter table public.assets_vehicle
      add constraint assets_vehicle_pengguna_match_status_check
      check (pengguna_match_status in ('matched', 'unmatched', 'review'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'assets_equipment_pengguna_match_status_check'
      and conrelid = 'public.assets_equipment'::regclass
  ) then
    alter table public.assets_equipment
      add constraint assets_equipment_pengguna_match_status_check
      check (pengguna_match_status in ('matched', 'unmatched', 'review'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'assets_vehicle_pengguna_nip_fkey'
      and conrelid = 'public.assets_vehicle'::regclass
  ) then
    alter table public.assets_vehicle
      add constraint assets_vehicle_pengguna_nip_fkey
      foreign key (pengguna_nip) references public.pegawai(nip)
      on update cascade on delete set null not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'assets_vehicle_penanggung_jawab_nip_fkey'
      and conrelid = 'public.assets_vehicle'::regclass
  ) then
    alter table public.assets_vehicle
      add constraint assets_vehicle_penanggung_jawab_nip_fkey
      foreign key (penanggung_jawab_nip) references public.pegawai(nip)
      on update cascade on delete set null not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'assets_equipment_pengguna_nip_fkey'
      and conrelid = 'public.assets_equipment'::regclass
  ) then
    alter table public.assets_equipment
      add constraint assets_equipment_pengguna_nip_fkey
      foreign key (pengguna_nip) references public.pegawai(nip)
      on update cascade on delete set null not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'assets_equipment_penanggung_jawab_nip_fkey'
      and conrelid = 'public.assets_equipment'::regclass
  ) then
    alter table public.assets_equipment
      add constraint assets_equipment_penanggung_jawab_nip_fkey
      foreign key (penanggung_jawab_nip) references public.pegawai(nip)
      on update cascade on delete set null not valid;
  end if;
end $$;

create index if not exists assets_vehicle_pengguna_nip_idx
  on public.assets_vehicle (pengguna_nip);
create index if not exists assets_vehicle_pengguna_match_status_idx
  on public.assets_vehicle (pengguna_match_status);
create index if not exists assets_equipment_pengguna_nip_idx
  on public.assets_equipment (pengguna_nip);
create index if not exists assets_equipment_pengguna_match_status_idx
  on public.assets_equipment (pengguna_match_status);

grant execute on function public.sikanda_normalize_employee_name(text) to service_role;

commit;

-- Verifikasi setelah COMMIT:
-- select pengguna_match_status, count(*) from public.assets_equipment group by 1 order by 1;
-- select pengguna_match_status, count(*) from public.assets_vehicle group by 1 order by 1;
-- select asset_id, pengguna_raw, pengguna, pengguna_nip, pengguna_match_status
-- from public.assets_equipment where pengguna_match_status <> 'matched' order by asset_id;
