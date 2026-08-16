-- SIKANDA V1.1.2 Secure — kelengkapan data kendaraan
-- Jalankan SELURUH FILE ini sebagai SATU BLOK di Supabase SQL Editor.
-- Script idempoten: aman dijalankan kembali.

begin;

alter table if exists public.assets_vehicle
  add column if not exists kapasitas_mesin numeric,
  add column if not exists no_bpkb text,
  add column if not exists no_rangka text,
  add column if not exists no_mesin text,
  add column if not exists harga_pembelian numeric,
  add column if not exists qr_url text;

alter table if exists public.assets_vehicle enable row level security;
revoke all on table public.assets_vehicle from anon, authenticated;
grant all on table public.assets_vehicle to service_role;

commit;

-- Pemeriksaan setelah migrasi (jalankan terpisah setelah file di atas sukses):
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'assets_vehicle'
-- order by ordinal_position;
