-- SIKANDA V1.1.6 - normalisasi nomor kontak Indonesia untuk WhatsApp.
-- Idempoten: aman dijalankan kembali. Hanya pola 08... yang tidak ambigu diubah.

begin;

update public.pegawai
set kontak = '62' || substring(regexp_replace(trim(kontak), '[^0-9]', '', 'g') from 2),
    updated_at = now()
where kontak is not null
  and regexp_replace(trim(kontak), '[^0-9]', '', 'g') ~ '^08[0-9]{7,12}$';

commit;

-- Verifikasi (jalankan terpisah):
-- select nip, nama, kontak from public.pegawai where kontak like '08%';
