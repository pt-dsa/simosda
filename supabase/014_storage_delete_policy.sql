
-- Izinkan authenticated users untuk menghapus file (DELETE) di bucket pegawai-photos dan asset-photos
begin;

drop policy if exists "Authenticated users can delete pegawai photos" on storage.objects;
create policy "Authenticated users can delete pegawai photos"
  on storage.objects for delete to authenticated
  using ( bucket_id = 'pegawai-photos' );

drop policy if exists "Authenticated users can delete asset photos" on storage.objects;
create policy "Authenticated users can delete asset photos"
  on storage.objects for delete to authenticated
  using ( bucket_id = 'asset-photos' );

-- Tambahkan juga untuk UPDATE dan INSERT jika belum ada yang eksplisit untuk role tersebut
-- Namun asumsikan INSERT/UPDATE sudah berjalan dengan baik sesuai file 013 dan keluhan sebelumnya

commit;
