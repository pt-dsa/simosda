-- SIKANDA V1.1.16 — PRECHECK READ-ONLY Supabase Auth
-- Jalankan seluruh isi file ini SEKALI sebelum migrasi 009.
-- File ini tidak mengubah data. Lanjutkan hanya jika seluruh status = PASS.

with checks as (
  select
    '01_duplicate_email'::text as check_name,
    count(*)::bigint as issue_count,
    'Email app_access harus unik tanpa membedakan huruf besar/kecil.'::text as guidance
  from (
    select lower(trim(email))
    from public.app_access
    where nullif(trim(email), '') is not null
    group by lower(trim(email))
    having count(*) > 1
  ) duplicate_email

  union all

  select
    '02_duplicate_nip',
    count(*)::bigint,
    'NIP app_access harus unik setelah spasi dihapus.'
  from (
    select regexp_replace(coalesce(nip, ''), '\s+', '', 'g')
    from public.app_access
    where nullif(regexp_replace(coalesce(nip, ''), '\s+', '', 'g'), '') is not null
    group by regexp_replace(coalesce(nip, ''), '\s+', '', 'g')
    having count(*) > 1
  ) duplicate_nip

  union all

  select
    '03_invalid_email',
    count(*)::bigint,
    'Setiap akun harus memiliki email valid yang didaftarkan Administrator/Pimpinan.'
  from public.app_access
  where email is null
     or trim(email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'

  union all

  select
    '04_invalid_nip',
    count(*)::bigint,
    'Setiap akun, termasuk Administrator/Pimpinan, harus memiliki NIP 18 digit.'
  from public.app_access
  where regexp_replace(coalesce(nip, ''), '\s+', '', 'g') !~ '^[0-9]{18}$'

  union all

  select
    '05_orphan_employee_nip',
    count(*)::bigint,
    'Setiap NIP app_access harus ditemukan tepat pada pegawai aktif.'
  from public.app_access access_row
  left join public.pegawai employee
    on employee.nip = regexp_replace(coalesce(access_row.nip, ''), '\s+', '', 'g')
   and coalesce(employee.is_active, true) is true
  where employee.nip is null

  union all

  select
    '06_existing_supabase_auth_users',
    count(*)::bigint,
    'Kondisi awal yang diharapkan adalah 0. Jika bukan 0, periksa user Auth sebelum migrasi.'
  from auth.users
)
select
  check_name,
  case
    when check_name = '06_existing_supabase_auth_users' then
      case when issue_count = 0 then 'PASS' else 'REVIEW' end
    else case when issue_count = 0 then 'PASS' else 'FAIL' end
  end as status,
  issue_count,
  guidance
from checks
order by check_name;

