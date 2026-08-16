// ---------------------------------------------------------------------------
// SIMOSDA — MODUL BUKU PENJAGAAN (sumber tunggal perhitungan tenggat kepegawaian)
// ---------------------------------------------------------------------------
// Modul ini dipakai bersama oleh:
//   • dataService.ts  → menghitung tgl_kgb / tgl_pangkat / tgl_pensiun
//   • halaman BukuPenjagaan.tsx → membangun daftar agenda + bucket + ekspor
//   • (tidak langsung) Dashboard & lonceng AppShell konsumsi field tgl_* yang
//     dihitung service via fungsi DI SINI, sehingga TIDAK ADA perhitungan ganda
//     yang berbeda hasil.
//
// Aturan tanggal (disepakati):
//   • Tanggal hasil selalu diformat dari KOMPONEN LOKAL ("YYYY-MM-DD"), TIDAK
//     memakai toISOString() — agar tidak ada geser 1 hari di zona WIB (UTC+7)
//     dan agar hasil frontend SAMA PERSIS dengan backend Apps Script (Code.gs).
//   • KGB = siklus 2 tahun, Kenaikan Pangkat = siklus 4 tahun, keduanya dari
//     TMT Golongan. Tenggat waktu pertama = TMT + siklus (TMT sendiri BUKAN
//     tenggat waktu KGB/Pangkat).
//   • BUP = tanggal lahir + BUP_USIA (default 58, dari system_config).
// ---------------------------------------------------------------------------

import { parseAnyDate } from "@/lib/utils";
import { employmentAgendaPolicy, employmentStatusLabel } from "@/lib/employmentStatus";

export type KategoriPenjagaan = "KGB" | "PANGKAT" | "BUP";
export type BucketPenjagaan = "terlambat" | "le3" | "le6" | "le12" | "jauh";

// Ambang "terlewat" untuk KGB/Pangkat: tenggat waktu siklus terakhir yang lewat
// MAKSIMAL 365 hari yang ditandai "Terlewat". Lewat dari itu, siklus berikutnya
// sudah dekat sehingga ditampilkan sebagai "akan datang" (bukan terlewat).
// BUP TIDAK memakai ambang ini (pegawai aktif yang lewat BUP selalu ditampilkan).
export const OVERDUE_LOOKBACK_DAYS = 365;

const MS_DAY = 86400000;

// ── util tanggal lokal ──────────────────────────────────────────────────────
function localISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function startOfToday(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value: Record<string, number> = {};
  parts.forEach((part) => { if (part.type !== "literal") value[part.type] = Number(part.value); });
  return new Date(value.year, value.month - 1, value.day, 0, 0, 0, 0);
}

/** Parse "YYYY-MM-DD" (atau format lain) sebagai tanggal LOKAL tengah malam. */
function parseLocalDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const pd = parseAnyDate(dateStr);
  if (pd) { pd.setHours(0, 0, 0, 0); return pd; }
  return null;
}

function anniversary(start: Date, year: number): Date {
  // JavaScript menggeser 29 Februari ke Maret pada tahun non-kabisat. Untuk
  // agenda administrasi, gunakan hari terakhir Februari secara konsisten.
  const month = start.getMonth();
  const day = start.getDate();
  const maxDay = new Date(year, month + 1, 0).getDate();
  const d = new Date(year, month, Math.min(day, maxDay));
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── perhitungan siklus ──────────────────────────────────────────────────────

/**
 * Tanggal tenggat waktu siklus BERIKUTNYA (>= hari ini) dari TMT.
 * Mempertahankan algoritma yang sama dengan backend (parity),
 * hanya keluaran diformat lokal (bukan UTC).
 */
export function nextCycleDate(tmtInput: unknown, cycleYears: number): string {
  const start = parseAnyDate(tmtInput);
  if (!start || !Number.isFinite(cycleYears) || cycleYears < 1) return "";
  const today = startOfToday();
  let year = start.getFullYear() + cycleYears;
  if (today.getFullYear() > year) {
    year += Math.floor((today.getFullYear() - year) / cycleYears) * cycleYears;
  }
  let cand = anniversary(start, year);
  while (cand < today) {
    year += cycleYears;
    cand = anniversary(start, year);
  }
  return localISO(cand);
}

/**
 * Tanggal tenggat waktu siklus TERAKHIR yang sudah lewat (< hari ini),
 * dihitung MUNDUR dari TMT. Tenggat waktu pertama = TMT + siklus (k>=1),
 * jadi TMT sendiri tidak pernah dianggap tenggat waktu KGB/Pangkat.
 * Mengembalikan "" bila belum ada (pegawai baru naik golongan < 1 siklus lalu).
 */
export function prevCycleDate(tmtInput: unknown, cycleYears: number): string {
  const start = parseAnyDate(tmtInput);
  if (!start) return "";
  const today = startOfToday();

  // Tenggat waktu pertama setelah TMT (k=1).
  let year = start.getFullYear() + cycleYears;
  let cand = anniversary(start, year);
  if (cand >= today) return ""; // siklus pertama masih di masa depan → belum ada yang lewat

  // Maju sampai occurrence terakhir yang masih < hari ini.
  while (true) {
    const nextYear = year + cycleYears;
    const nextCand = anniversary(start, nextYear);
    if (nextCand >= today) break;
    year = nextYear; cand = nextCand;
  }
  return localISO(cand);
}

/** Tanggal pensiun (BUP) = tanggal lahir + bup tahun, format lokal. */
export function pensionDate(lahirInput: unknown, bup: number): string {
  const b = parseAnyDate(lahirInput);
  if (!b) return "";
  const d = anniversary(b, b.getFullYear() + bup);
  return localISO(d);
}

/** Selisih hari bertanda: (tanggal − hari ini). Negatif = sudah lewat. */
export function diffDays(dateStr: string, today: Date = startOfToday()): number | null {
  const d = parseLocalDate(dateStr);
  if (!d) return null;
  return Math.round((d.getTime() - today.getTime()) / MS_DAY);
}

/** Klasifikasi bucket berdasarkan selisih hari bertanda. */
export function bucketOf(selisihHari: number): BucketPenjagaan {
  if (selisihHari < 0) return "terlambat";
  if (selisihHari <= 90) return "le3";
  if (selisihHari <= 182) return "le6";
  if (selisihHari <= 365) return "le12";
  return "jauh";
}

/**
 * True bila `dateStr` jatuh dalam `months` bulan KALENDER ke depan (>= hari ini).
 * Sumber tunggal dipakai Dashboard, lonceng AppShell, dan ringkasan halaman
 * Buku Penjagaan agar hitungan ≤6 bulan identik (tanpa divergensi).
 */
export function withinMonths(dateStr: string, months: number, today: Date = startOfToday()): boolean {
  const d = parseLocalDate(dateStr);
  if (!d) return false;
  const ceiling = new Date(today);
  ceiling.setMonth(ceiling.getMonth() + months);
  return d >= today && d <= ceiling;
}

// ── model agenda (satu baris per pegawai × kategori) ────────────────────────

export interface PenjagaanEvent {
  nip: string;
  nama: string;
  golongan: string;
  jabatan: string;
  bidang: string;            // unit_kerja, atau "(Tanpa Bidang)" bila kosong
  status: string;            // "ASN" | "PPPK" | ...
  kategori: KategoriPenjagaan;
  kategoriLabel: string;
  tanggal: string;           // "YYYY-MM-DD" — tanggal acuan yang ditampilkan
  selisihHari: number;       // bertanda; negatif = terlewat
  bucket: BucketPenjagaan;
  isOverdue: boolean;
  overdueLabel?: string;     // "Lewat BUP" khusus BUP
}

const NO_BIDANG = "(Tanpa Bidang)";

function baseOf(p: any) {
  return {
    nip: String(p.nip || "").trim(),
    nama: String(p.nama || "").trim(),
    golongan: String(p.golongan || "").trim(),
    jabatan: String(p.jabatan || "").trim(),
    bidang: String(p.unit_kerja || "").trim() || NO_BIDANG,
    status: employmentStatusLabel(p),
  };
}

function pushCycleEvent(
  events: PenjagaanEvent[],
  base: ReturnType<typeof baseOf>,
  kategori: "KGB" | "PANGKAT",
  kategoriLabel: string,
  nextStr: string,
  prevStr: string,
  today: Date,
) {
  if (base.status === "PENSIUN") return; // konsisten dgn BUP: pegawai pensiun tidak diagendakan
  const next = nextStr ? diffDays(nextStr, today) : null;
  const prev = prevStr ? diffDays(prevStr, today) : null; // selalu negatif jika ada

  let tanggal = "";
  let selisih: number | null = null;
  let overdue = false;

  // Kandidat "terlewat": siklus lampau yang lewat <= OVERDUE_LOOKBACK_DAYS,
  // dan lebih dekat ke hari ini dibanding siklus berikutnya.
  if (prev !== null && prev < 0 && -prev <= OVERDUE_LOOKBACK_DAYS) {
    if (next === null || -prev <= next) {
      tanggal = prevStr; selisih = prev; overdue = true;
    }
  }
  if (selisih === null) {
    if (next === null) return; // tidak ada TMT valid → tidak ada event
    tanggal = nextStr; selisih = next; overdue = next < 0;
  }

  events.push({
    ...base, kategori, kategoriLabel,
    tanggal, selisihHari: selisih,
    bucket: bucketOf(selisih), isOverdue: overdue,
  });
}

function pushBupEvent(
  events: PenjagaanEvent[],
  base: ReturnType<typeof baseOf>,
  pensionStr: string,
  today: Date,
) {
  if (!pensionStr) return;
  if (base.status === "PENSIUN") return; // sudah pensiun → tidak diagendakan
  const sel = diffDays(pensionStr, today);
  if (sel === null) return;
  const overdue = sel < 0;
  events.push({
    ...base,
    kategori: "BUP",
    kategoriLabel: "Batas Usia Pensiun (BUP)",
    tanggal: pensionStr,
    selisihHari: sel,
    bucket: bucketOf(sel),
    isOverdue: overdue,
    overdueLabel: overdue ? "Lewat BUP" : undefined,
  });
}

/**
 * Bangun seluruh agenda Buku Penjagaan dari daftar pegawai (data NYATA hasil
 * getPegawai). Memakai tgl_kgb/tgl_pangkat/tgl_pensiun yang sudah dihitung
 * service (maju) + perhitungan siklus mundur dari tgl_mulai_golongan.
 */
export function buildPenjagaanEvents(pegawaiList: any[], today: Date = startOfToday()): PenjagaanEvent[] {
  const events: PenjagaanEvent[] = [];
  for (const p of pegawaiList) {
    const base = baseOf(p);
    const policy = employmentAgendaPolicy(p);
    const kgbCycle = Number(p.kgb_cycle_years) || 2;
    const pangkatCycle = Number(p.pangkat_cycle_years) || 4;

    // ASN memperoleh seluruh agenda. PPPK penuh waktu hanya memperoleh KGB.
    // Data PPPK lama tanpa kategori mengikuti kebijakan kompatibilitas sebagai
    // PPPK penuh waktu; kategori paruh waktu selalu menghasilkan nol agenda.
    if (policy.kgb) {
      pushCycleEvent(events, base, "KGB", "KGB (Kenaikan Gaji Berkala)",
        String(p.tgl_kgb || ""), prevCycleDate(p.tgl_mulai_golongan, kgbCycle), today);
    }
    if (policy.pangkat) {
      pushCycleEvent(events, base, "PANGKAT", "Kenaikan Pangkat",
        String(p.tgl_pangkat || ""), prevCycleDate(p.tgl_mulai_golongan, pangkatCycle), today);
    }
    if (policy.bup) {
      pushBupEvent(events, base, String(p.tgl_pensiun || ""), today);
    }
  }
  return events;
}

/** Teks sisa waktu manusiawi. */
export function sisaWaktuLabel(ev: PenjagaanEvent): string {
  const d = ev.selisihHari;
  if (d < 0) {
    const n = Math.abs(d);
    const pre = ev.kategori === "BUP" ? "Lewat BUP" : "Terlewat";
    return `${pre} ${n} hari`;
  }
  if (d === 0) return "Tenggat waktu hari ini";
  if (d < 30) return `${d} hari lagi`;
  if (d < 365) {
    const bulan = Math.floor(d / 30);
    const sisa = d % 30;
    return sisa > 0 ? `${bulan} bln ${sisa} hr lagi` : `${bulan} bulan lagi`;
  }
  const tahun = Math.floor(d / 365);
  const sisaHari = d % 365;
  const bulan = Math.floor(sisaHari / 30);
  return bulan > 0 ? `${tahun} thn ${bulan} bln lagi` : `${tahun} tahun lagi`;
}

/** Label & warna bucket untuk UI. */
export function bucketMeta(bucket: BucketPenjagaan): {
  label: string;
  badge: "danger" | "warning" | "info" | "default";
  dot: string;
} {
  switch (bucket) {
    case "terlambat": return { label: "Terlewat", badge: "danger", dot: "bg-red-500" };
    case "le3":       return { label: "≤ 3 bulan", badge: "danger", dot: "bg-red-500" };
    case "le6":       return { label: "≤ 6 bulan", badge: "warning", dot: "bg-amber-500" };
    case "le12":      return { label: "≤ 12 bulan", badge: "info", dot: "bg-blue-500" };
    default:          return { label: "> 12 bulan", badge: "default", dot: "bg-gray-400" };
  }
}
