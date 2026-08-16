-- SIKANDA V1.1.3 Secure - status PPPK dan kelengkapan Alat & Mesin
-- Jalankan SELURUH FILE ini sebagai SATU BLOK di Supabase SQL Editor.
-- Idempoten: aman dijalankan ulang. Backup database tetap wajib.

begin;

-- Ketentuan bisnis: data PPPK lama/tanpa kategori dianggap Penuh Waktu.
update public.pegawai
set kategori_pppk = 'penuh_waktu', updated_at = now(), updated_by = 'migration_v1_1_3'
where upper(trim(coalesce(status, ''))) = 'PPPK'
  and coalesce(trim(kategori_pppk), '') = '';

alter table if exists public.assets_equipment
  add column if not exists jenis text,
  add column if not exists jumlah numeric,
  add column if not exists satuan text,
  add column if not exists harga_pembelian numeric,
  add column if not exists qr_url text;

update public.assets_equipment set jumlah = 1 where jumlah is null;
update public.assets_equipment set satuan = 'Unit' where coalesce(trim(satuan), '') = '';

alter table if exists public.assets_equipment enable row level security;
revoke all on table public.assets_equipment from anon, authenticated;
grant all on table public.assets_equipment to service_role;

create index if not exists pegawai_status_kategori_idx
  on public.pegawai (status, kategori_pppk) where is_active = true;
create index if not exists equipment_kondisi_idx
  on public.assets_equipment (kondisi) where is_active = true;

commit;

-- VERIFIKASI (jalankan sebagai query TERPISAH setelah migrasi sukses):
-- select status, kategori_pppk, count(*) from public.pegawai group by status, kategori_pppk order by status, kategori_pppk;
-- select column_name, data_type from information_schema.columns
-- where table_schema='public' and table_name='assets_equipment' order by ordinal_position;
