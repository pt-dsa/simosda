// ---------------------------------------------------------------------------
// SIMOSDA — HELPER RINGKASAN KARTU (sumber tunggal untuk kartu klikable)
// ---------------------------------------------------------------------------
// Dipakai oleh modul aset/transaksi (Kendaraan, Inventaris, Alat & Mesin,
// Pagu Anggaran, Pemeliharaan, Peminjaman) agar:
//   1. Kartu ringkasan DIBANGUN dari nilai NYATA yang ada di data (bukan
//      bucket hardcoded yang bisa salah hitung bila string kondisi/status
//      bervariasi antar sheet — mis. "RUSAK RINGAN" vs "KURANG BAIK").
//   2. Angka pada kartu DIJAMIN identik dengan jumlah baris setelah filter,
//      karena keduanya memakai kunci normalisasi yang SAMA (trim + UPPERCASE)
//      dan filter membandingkan secara case-insensitive.
//
// Aturan A (integritas data): tidak ada angka fabrikasi; setiap kartu = hitung
// nyata atas field sumber. Klik kartu menyetel filter ke nilai kanonik yang
// sama sehingga "angka kartu === jumlah tabel".
// ---------------------------------------------------------------------------

export interface SummaryBucket {
  /** Nilai kanonik (trim + UPPERCASE) — dipakai sebagai value filter. */
  key: string;
  /** Label tampil (memakai bentuk kanonik agar konsisten). */
  label: string;
  /** Jumlah baris nyata pada bucket ini. */
  count: number;
}

/** Normalisasi kunci: trim + UPPERCASE. Kosong → "". */
export function canonKey(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

/**
 * Ringkas daftar berdasarkan satu field, mengelompokkan dengan kunci kanonik.
 * Hanya nilai non-kosong yang dihitung. Hasil terurut menurun (count) lalu
 * alfabet untuk stabilitas.
 */
export function summarizeBy<T>(rows: T[], getField: (row: T) => unknown): SummaryBucket[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = canonKey(getField(r));
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label, "id"));
}

/**
 * Warna kontekstual untuk nilai KONDISI aset. Mengembalikan kelas latar/teks
 * Tailwind. Klasifikasi berbasis kata kunci agar tahan variasi penulisan.
 */
export function toneForKondisi(canon: string): { bg: string; text: string } {
  const k = canonKey(canon);
  if (k.includes("BERAT")) return { bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-700 dark:text-red-400" };
  if (k.includes("RINGAN") || k.includes("KURANG") || k.includes("SEDANG"))
    return { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400" };
  if (k.includes("RUSAK")) return { bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-700 dark:text-red-400" };
  if (k.includes("BAIK")) return { bg: "bg-green-50 dark:bg-green-900/20", text: "text-green-700 dark:text-green-400" };
  return { bg: "bg-gray-50 dark:bg-gray-800/40", text: "text-gray-600 dark:text-gray-300" };
}

/**
 * Warna kontekstual untuk nilai STATUS transaksi (peminjaman/pemeliharaan).
 */
export function toneForStatus(canon: string): { bg: string; text: string } {
  const k = canonKey(canon);
  if (k.includes("TOLAK") || k.includes("BATAL") || k.includes("KRITIS"))
    return { bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-700 dark:text-red-400" };
  if (k.includes("PROSES") || k.includes("DIPINJAM") || k.includes("PENDING") || k.includes("MENUNGGU") || k.includes("MONITOR"))
    return { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400" };
  if (k.includes("SELESAI") || k.includes("KEMBALI") || k.includes("SETUJU") || k.includes("APPROV") || k.includes("AMAN"))
    return { bg: "bg-green-50 dark:bg-green-900/20", text: "text-green-700 dark:text-green-400" };
  return { bg: "bg-gray-50 dark:bg-gray-800/40", text: "text-gray-600 dark:text-gray-300" };
}

// ── Pagu Anggaran: klasifikasi status serapan (ambang IDENTIK dgn tabel) ──
export type PaguStatus = "aman" | "monitoring" | "kritis";

/** Ambang sama persis dengan kolom Realisasi(%) di tabel: >90 kritis, >70 monitoring. */
export function paguStatusOf(pct: number): PaguStatus {
  if (pct > 90) return "kritis";
  if (pct > 70) return "monitoring";
  return "aman";
}

export function paguStatusLabel(s: PaguStatus): string {
  return s === "kritis" ? "Kritis" : s === "monitoring" ? "Perlu Monitoring" : "Aman";
}

export function toneForPaguStatus(s: PaguStatus): { bg: string; text: string } {
  if (s === "kritis") return { bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-700 dark:text-red-400" };
  if (s === "monitoring") return { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400" };
  return { bg: "bg-green-50 dark:bg-green-900/20", text: "text-green-700 dark:text-green-400" };
}
