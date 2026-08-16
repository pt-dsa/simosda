// ---------------------------------------------------------------------------
// SIMOSDA — RBAC (Role-Based Access Control)
// ---------------------------------------------------------------------------
// SUMBER KEBENARAN IZIN ADA DI KODE INI, BUKAN DI DATABASE (disepakati Tahap 3).
// Alasan: aturan keamanan harus ter-review secara kode. Tabel `app_access` HANYA menyimpan
// identitas (email), peran (role), relasi (nip), dan status aktif pengguna — bukan aturan izinnya.
//
// Tiga peran:
//   - admin    : CRUD penuh, approval, akun, konfigurasi, dan cleansing.
//   - pimpinan : kewenangan identik dengan admin (label dipertahankan untuk audit).
//   - pegawai  : dapat membuka seluruh menu operasional, tetapi tidak dapat
//                membuka Kelola Akun/Cleansing dan hanya mengubah profil sendiri.
// ---------------------------------------------------------------------------

export type Role = "admin" | "pimpinan" | "pegawai";

/** Identitas pengguna aplikasi (hasil pencocokan email → tabel app_access). */
export interface AppUser {
  email: string;
  role: Role;
  nip?: string; // relasi ke sheet pegawai (WAJIB untuk role 'pegawai')
  nama?: string;
  foto?: string; // signed URL foto pegawai untuk avatar sesi
  foto_nip?: string; // NIP sumber foto; dapat berbeda dari relasi akun manajer
  is_active?: boolean;
}

/** Kunci menu — SELARAS dengan route di App.tsx & navItems di AppShell.tsx. */
export type MenuKey =
  | "dashboard"
  | "pegawai"
  | "buku-penjagaan"
  | "kendaraan"
  | "alat-mesin"
  | "inventaris"
  | "pagu"
  | "pemeliharaan-kendaraan"
  | "peminjaman"
  | "peta"
  | "laporan"
  | "kelola-akun" // baru (admin saja)
  | "cleansing" // Tahap 6 (admin/pimpinan)
  | "tanya"; // Tanya SIMOSDA — chat AI (semua peran)

/** Aksi berbutir (action-level), ditegakkan di UI dan (Increment 3) di backend. */
export type Action =
  | "pegawai.create"
  | "pegawai.edit.any"
  | "pegawai.edit.own"
  | "pegawai.delete"
  | "asset.write"
  | "data.export"
  | "config.write"
  | "cleansing.run"
  | "account.manage";

/**
 * Field profil yang boleh diubah pegawai pada baris miliknya sendiri. TMT,
 * field kepegawaian struktural tetap server-locked. Di luar daftar kunci itu,
 * pegawai dapat memperbarui profilnya sendiri.
 */
export const EDITABLE_FIELDS_OWN: readonly string[] = [
  "nama",
  "foto",
  "tgl_lahir",
  "kontak",
  "email",
  "tingkat",
  "pendidikan_jurusan",
  "universitas",
  "tahun_lulus",
  "riwayat_diklat",
  "tahun_diklat",
  "keterangan",
];

const ALL_MENUS: MenuKey[] = [
  "dashboard",
  "pegawai",
  "buku-penjagaan",
  "kendaraan",
  "alat-mesin",
  "inventaris",
  "pagu",
  "pemeliharaan-kendaraan",
  "peminjaman",
  "peta",
  "laporan",
  "tanya", // Tanya SIMOSDA — semua peran boleh bertanya (konteks SIMOSDA saja)
];

// Pegawai dapat membaca seluruh menu operasional, kecuali Rekap Laporan.
// Kelola Akun dan Data Cleansing tetap merupakan menu tata-kelola manajer.
const EMPLOYEE_MENUS: MenuKey[] = ALL_MENUS.filter((menu) => menu !== "laporan");

const MANAGER_MENUS: MenuKey[] = [...ALL_MENUS, "kelola-akun", "cleansing"];

const MENU_BY_ROLE: Record<Role, MenuKey[]> = {
  admin: MANAGER_MENUS,
  pimpinan: MANAGER_MENUS,
  pegawai: EMPLOYEE_MENUS,
};

const ACTIONS_BY_ROLE: Record<Role, Action[]> = {
  admin: [
    "pegawai.create",
    "pegawai.edit.any",
    "pegawai.delete",
    "asset.write",
    "data.export",
    "config.write",
    "cleansing.run",
    "account.manage",
  ],
  pimpinan: [
    "pegawai.create",
    "pegawai.edit.any",
    "pegawai.delete",
    "asset.write",
    "data.export",
    "config.write",
    "cleansing.run",
    "account.manage",
  ],
  pegawai: ["pegawai.edit.own"],
};

/** Apakah peran ini boleh MELIHAT menu tertentu (filter sidebar & route). */
export function canViewMenu(role: Role | undefined, menu: MenuKey): boolean {
  if (!role) return false;
  return MENU_BY_ROLE[role]?.includes(menu) ?? false;
}

/** Apakah peran ini boleh melakukan aksi tertentu. */
export function can(role: Role | undefined, action: Action): boolean {
  if (!role) return false;
  return ACTIONS_BY_ROLE[role]?.includes(action) ?? false;
}

/**
 * Kepemilikan baris: benar bila user adalah 'pegawai' DAN nip-nya sama persis
 * dengan nip baris. NIP dibandingkan sebagai STRING eksak (Aturan: NIP selalu
 * string; 18 digit, jangan jadi number).
 */
export function isOwnRow(
  user: AppUser | null | undefined,
  nip: string | undefined
): boolean {
  if (!user || user.role !== "pegawai") return false;
  const a = String(user.nip ?? "").trim();
  const b = String(nip ?? "").trim();
  return a !== "" && a === b;
}

/** Bolehkah user mengedit baris pegawai dengan nip tertentu? */
export function canEditPegawaiRow(
  user: AppUser | null | undefined,
  nip: string | undefined
): boolean {
  if (!user) return false;
  if (can(user.role, "pegawai.edit.any")) return true; // admin/pimpinan
  return isOwnRow(user, nip); // pegawai: hanya baris sendiri
}

/** Bolehkah FIELD tertentu diubah oleh user pada baris pegawai ini? */
export function canEditField(
  user: AppUser | null | undefined,
  nip: string | undefined,
  field: string
): boolean {
  if (!user) return false;
  if (can(user.role, "pegawai.edit.any")) return true; // admin/pimpinan: semua field
  if (isOwnRow(user, nip)) return EDITABLE_FIELDS_OWN.includes(field); // pegawai: terbatas
  return false;
}

/** Daftar menu yang boleh dilihat peran (untuk membangun sidebar). */
export function visibleMenus(role: Role | undefined): MenuKey[] {
  if (!role) return [];
  return MENU_BY_ROLE[role] ?? [];
}
