import type { Pegawai } from "@/types";

export type EmploymentStatusKey = "ASN" | "PPPK_PENUH_WAKTU" | "PPPK_PARUH_WAKTU" | "PENSIUN" | "";

export interface EmploymentAgendaPolicy {
  kgb: boolean;
  pangkat: boolean;
  bup: boolean;
  hasAgenda: boolean;
}

export function kategoriPppk(row: Pick<Pegawai, "status" | "kategori_pppk">): "penuh_waktu" | "paruh_waktu" | "" {
  const status = String(row.status || "").toUpperCase();
  const category = String(row.kategori_pppk || "").toLowerCase();
  if (!status.startsWith("PPPK")) return "";
  if (category === "paruh_waktu" || status.includes("PARUH")) return "paruh_waktu";
  return "penuh_waktu";
}

export function employmentStatusKey(row: Pick<Pegawai, "status" | "kategori_pppk">): EmploymentStatusKey {
  const status = String(row.status || "").trim().toUpperCase();
  if (!status) return "";
  if (status.startsWith("PPPK")) return kategoriPppk(row) === "paruh_waktu" ? "PPPK_PARUH_WAKTU" : "PPPK_PENUH_WAKTU";
  if (status === "ASN" || status === "PENSIUN") return status;
  return status as EmploymentStatusKey;
}

export function employmentStatusLabel(row: Pick<Pegawai, "status" | "kategori_pppk">): string {
  const key = employmentStatusKey(row);
  if (key === "PPPK_PENUH_WAKTU") return "PPPK (Penuh Waktu)";
  if (key === "PPPK_PARUH_WAKTU") return "PPPK (Paruh Waktu)";
  return key || "-";
}

/**
 * Sumber tunggal hak agenda Buku Penjagaan.
 *
 * - ASN: KGB, kenaikan pangkat, dan BUP.
 * - PPPK Penuh Waktu (termasuk data lama tanpa kategori): KGB saja.
 * - PPPK Paruh Waktu dan Pensiun: tidak memiliki agenda aktif.
 *
 * Seluruh halaman wajib memakai kebijakan ini agar kartu profil, daftar agenda,
 * dashboard, laporan, dan notifikasi tidak saling berbeda.
 */
export function employmentAgendaPolicy(
  row: Pick<Pegawai, "status" | "kategori_pppk">,
): EmploymentAgendaPolicy {
  const key = employmentStatusKey(row);
  const policy = key === "ASN"
    ? { kgb: true, pangkat: true, bup: true }
    : key === "PPPK_PENUH_WAKTU"
      ? { kgb: true, pangkat: false, bup: false }
      : { kgb: false, pangkat: false, bup: false };

  return { ...policy, hasAgenda: policy.kgb || policy.pangkat || policy.bup };
}

export function matchesEmploymentStatus(row: Pick<Pegawai, "status" | "kategori_pppk">, filter: string): boolean {
  return filter === "all" || employmentStatusKey(row) === filter;
}
