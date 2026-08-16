-- SIKANDA V1.1.16 — migrasi autentikasi Firebase ke Supabase Auth
-- WAJIB: backup database sebelum menjalankan berkas ini.
-- Jalankan setelah migrasi 001–008 berhasil. Jangan jalankan ulang 001–008.

begin;

-- Hentikan migrasi sebelum membuat indeks bila data akun masih ganda.
do $$
begin
  if exists (
    select 1 from public.app_access
    where nullif(trim(email), '') is not null
    group by lower(trim(email)) having count(*) > 1
  ) then
    raise exception 'MIGRASI 009 DIHENTIKAN: email ganda (case-insensitive) ditemukan pada app_access.';
  end if;
  if exists (
    select 1 from public.app_access
    where nullif(regexp_replace(coalesce(nip, ''), '\s+', '', 'g'), '') is not null
    group by regexp_replace(nip, '\s+', '', 'g') having count(*) > 1
  ) then
    raise exception 'MIGRASI 009 DIHENTIKAN: NIP ganda ditemukan pada app_access.';
  end if;
  if exists (
    select 1 from public.app_access
    where email is null
       or trim(email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'MIGRASI 009 DIHENTIKAN: setiap akun app_access wajib memiliki email valid.';
  end if;
  if exists (
    select 1 from public.app_access
    where regexp_replace(coalesce(nip, ''), '\s+', '', 'g') !~ '^[0-9]{18}$'
  ) then
    raise exception 'MIGRASI 009 DIHENTIKAN: setiap akun app_access wajib memiliki NIP 18 digit.';
  end if;
end $$;

update public.app_access
set email = lower(trim(email)),
    nip = nullif(regexp_replace(coalesce(nip, ''), '\s+', '', 'g'), '')
where email is distinct from lower(trim(email))
   or nip is distinct from nullif(regexp_replace(coalesce(nip, ''), '\s+', '', 'g'), '');

alter table public.app_access
  add column if not exists auth_user_id uuid,
  add column if not exists auth_status text not null default 'ready',
  add column if not exists registered_at timestamptz;

update public.app_access
set auth_status = case
  when is_active is false then 'disabled'
  when auth_user_id is not null then 'active'
  else 'ready'
end;

create unique index if not exists app_access_email_lower_uidx
  on public.app_access (lower(email))
  where email is not null and trim(email) <> '';

create unique index if not exists app_access_nip_uidx
  on public.app_access (nip)
  where nip is not null and trim(nip) <> '';

create unique index if not exists app_access_auth_user_uidx
  on public.app_access (auth_user_id)
  where auth_user_id is not null;

create index if not exists app_access_auth_status_idx
  on public.app_access (auth_status, is_active);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_access_auth_status_check'
      and conrelid = 'public.app_access'::regclass
  ) then
    alter table public.app_access
      add constraint app_access_auth_status_check
      check (auth_status in ('ready', 'active', 'disabled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'app_access_nip_format_check'
      and conrelid = 'public.app_access'::regclass
  ) then
    alter table public.app_access
      add constraint app_access_nip_format_check
      check (nip ~ '^[0-9]{18}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'app_access_auth_user_fk'
      and conrelid = 'public.app_access'::regclass
  ) then
    alter table public.app_access
      add constraint app_access_auth_user_fk
      foreign key (auth_user_id) references auth.users(id) on delete set null;
  end if;
end $$;

comment on column public.app_access.auth_status is
  'ready=Administrator sudah menetapkan NIP/email/role; active=user sudah registrasi; disabled=akses dinonaktifkan';
comment on column public.app_access.auth_user_id is
  'Binding server-side ke auth.users.id; tidak boleh diisi dari frontend';

-- Browser tetap tidak memperoleh akses tabel bisnis. Semua operasi aplikasi
-- melewati Apps Script dengan service_role.
alter table public.app_access enable row level security;
revoke all on table public.app_access from anon, authenticated;
grant all on table public.app_access to service_role;

commit;

-- VERIFIKASI SETELAH COMMIT (jalankan sebagai query terpisah):
-- select auth_status, count(*) from public.app_access group by auth_status order by auth_status;
-- select email, nip, role, is_active, auth_status, auth_user_id, registered_at
-- from public.app_access order by email;
-- select count(*) as duplicate_email_groups from (
--   select lower(email) from public.app_access where email is not null group by lower(email) having count(*) > 1
-- ) q;
-- select count(*) as duplicate_nip_groups from (
--   select nip from public.app_access where nip is not null group by nip having count(*) > 1
-- ) q;
-- select grantee, privilege_type from information_schema.role_table_grants
-- where table_schema='public' and table_name='app_access' order by grantee, privilege_type;
