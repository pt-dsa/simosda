// ---------------------------------------------------------------------------
// SIMOSDA — Modul Deteksi Data Cleansing (Tahap 6)
// ---------------------------------------------------------------------------
// Semua fungsi di sini MURNI (no side effects): hanya membaca data pegawai
// dan menghasilkan daftar masalah. Penulisan koreksi dilakukan lewat
// apiService.savePegawai() di halaman Cleansing.tsx.
//
// Format tanggal standar SIMOSDA: "D Month YYYY" Indonesia (mis. "8 September 1979").
// Fungsi formatDate() di utils.ts menghasilkan format ini — dipakai sebagai referensi.
// ---------------------------------------------------------------------------

import { parseAnyDate } from "@/lib/utils";
import type { Pegawai } from "@/types";

// ---------------------------------------------------------------------------
// Sheet aset yang didukung untuk auto-koreksi holder_name (lihat Code.gs
// action `asset_fix_holder`). Nama harus PERSIS sama dengan nama sheet asli.
// ---------------------------------------------------------------------------
export type AssetSheetName = "assets_vehicle" | "assets_equipment";

export const ASSET_SHEET_LABEL: Record<AssetSheetName, string> = {
  assets_vehicle: "Kendaraan",
  assets_equipment: "Inventaris",
};

// ---------------------------------------------------------------------------
// Fuzzy name matching — Levenshtein distance based similarity (0..1).
// Dipakai khusus untuk mendeteksi kemiripan nama pegawai vs holder_name aset
// (typo, beda spasi, beda urutan gelar) dengan akurasi terukur, BUKAN sekadar
// pencocokan token sederhana seperti exactKey/fuzzyKey di dataService.
// ---------------------------------------------------------------------------
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prevDiag = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, dp[j], dp[j - 1]);
      prevDiag = tmp;
    }
  }
  return dp[n];
}

/** Similarity 0..1 (1 = identik). */
export function nameSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

/** Normalisasi nama untuk pembanding: uppercase, buang gelar setelah koma, rapikan spasi. */
export function normalizeNamaForMatch(s: string): string {
  return String(s || "")
    .toUpperCase()
    .split(",")[0]            // "ADE SUPRIZAL, ST, MT" → "ADE SUPRIZAL"
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNamaPenuh(s: string): string {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// Ambang kemiripan: di bawah ini dianggap tidak berhubungan sama sekali.
const SIMILARITY_MIN_RELEVANT = 0.70;
// Di atas/sama ambang ini: kemiripan "Tinggi" (kemungkinan typo/format kecil).
const SIMILARITY_HIGH = 0.90;

export interface AssetNameIssue {
  id: string;                  // kunci unik: sheet|asset_id
  sheet: AssetSheetName;
  sheetLabel: string;
  assetId: string;
  assetLabel: string;          // label tampilan aset (merk/tipe/no.polisi atau nama_aset)
  currentHolder: string;       // holder_name SAAT INI di sheet aset (mengandung typo/beda format)
  matchedNip: string;
  matchedNama: string;         // nama BAKU dari sheet pegawai (sumber kebenaran)
  similarity: number;          // 0..1
  confidence: "tinggi" | "sedang" | "belum";
  currentNip?: string;
  currentRaw?: string;
  reason?: "missing_nip" | "name_mismatch" | "employee_missing" | "unmatched";
  tahun?: string;
}

export interface AssetEmployeeSource {
  sheet: AssetSheetName;
  assetId: string;
  assetLabel: string;
  holderName: string;
  holderNip?: string;
  holderRaw?: string;
  holderStatus?: string;
  tahun?: string;
}

/**
 * Pindai semua relasi pengguna aset. Baris dianggap bersih hanya bila NIP
 * menunjuk pegawai aktif dan nama tampil sudah sama dengan nama resminya.
 * Nama hasil impor/legacy yang belum bertaut tetap ditampilkan walaupun tidak
 * memiliki saran fuzzy, sehingga admin dapat mencari pegawai secara manual.
 */
export function scanAssetEmployeeLinks(
  pegawaiList: Pegawai[],
  assets: AssetEmployeeSource[],
): AssetNameIssue[] {
  const employees = pegawaiList
    .map((employee) => ({
      employee,
      nip: String(employee.nip || "").trim(),
      nama: String(employee.nama || "").trim(),
      normalized: normalizeNamaPenuh(employee.nama),
      fuzzy: normalizeNamaForMatch(employee.nama),
    }))
    .filter((row) => row.nip && row.nama && employeeIsActive(row.employee));
  const byNip = new Map(employees.map((row) => [row.nip, row]));
  const byExact = new Map<string, typeof employees>();
  for (const row of employees) {
    const list = byExact.get(row.normalized) || [];
    list.push(row);
    byExact.set(row.normalized, list);
  }

  return assets.flatMap((asset): AssetNameIssue[] => {
    const currentNip = String(asset.holderNip || "").trim();
    const currentName = String(asset.holderName || "").trim();
    const currentRaw = String(asset.holderRaw || currentName || "").trim();
    const linked = currentNip ? byNip.get(currentNip) : undefined;
    if (linked && normalizeNamaPenuh(currentName) === linked.normalized) return [];

    let candidate = linked;
    let similarity = linked ? 1 : 0;
    let reason: AssetNameIssue["reason"] = linked ? "name_mismatch" : "missing_nip";
    const sourceForMatch = currentRaw || currentName;
    const exact = sourceForMatch ? (byExact.get(normalizeNamaPenuh(sourceForMatch)) || []) : [];
    if (!candidate && exact.length === 1) {
      candidate = exact[0];
      similarity = 1;
    }
    if (!candidate && sourceForMatch) {
      const sourceNorm = normalizeNamaForMatch(sourceForMatch);
      const ranked = employees
        .map((row) => ({ row, score: nameSimilarity(sourceNorm, row.fuzzy) }))
        .sort((left, right) => right.score - left.score);
      if (ranked[0] && ranked[0].score >= SIMILARITY_MIN_RELEVANT
        && (!ranked[1] || ranked[0].score - ranked[1].score >= 0.06 || ranked[0].row.fuzzy === ranked[1].row.fuzzy)) {
        candidate = ranked[0].row;
        similarity = ranked[0].score;
      }
    }
    if (!candidate) reason = currentNip ? "employee_missing" : "unmatched";

    return [{
      id: `${asset.sheet}|${asset.assetId}`,
      sheet: asset.sheet,
      sheetLabel: ASSET_SHEET_LABEL[asset.sheet],
      assetId: asset.assetId,
      assetLabel: asset.assetLabel,
      currentHolder: currentRaw || currentName || "Belum diisi",
      currentNip,
      currentRaw,
      matchedNip: candidate?.nip || "",
      matchedNama: candidate?.nama || "",
      similarity,
      confidence: candidate ? (similarity >= SIMILARITY_HIGH ? "tinggi" : "sedang") : "belum",
      reason,
      tahun: asset.tahun,
    }];
  }).sort((left, right) => {
    if (left.confidence === "belum" && right.confidence !== "belum") return 1;
    if (right.confidence === "belum" && left.confidence !== "belum") return -1;
    return right.similarity - left.similarity || left.assetLabel.localeCompare(right.assetLabel, "id-ID");
  });
}

function employeeIsActive(employee: Pegawai): boolean {
  return employee.is_active !== false && String(employee.keterangan || "").trim().toUpperCase() !== "DATA DUMMY";
}

/**
 * Bandingkan setiap holder_name aset terhadap seluruh nama pegawai, cari
 * kecocokan TERBAIK yang BUKAN exact match (exact match berarti sudah benar,
 * tidak perlu dikoreksi). Hanya kandidat dengan similarity >= 0.70 disertakan;
 * di bawah itu dianggap tidak berhubungan (hindari salah-gabung nama berbeda).
 */
export function scanAssetNameMismatches(
  pegawaiList: Pegawai[],
  assets: Array<{ sheet: AssetSheetName; assetId: string; assetLabel: string; holderName: string; holderNip?: string; holderStatus?: string }>
): AssetNameIssue[] {
  const pegawaiNorm = pegawaiList
    .map((p) => ({
      nip: String(p.nip || "").trim(),
      nama: String(p.nama || "").trim(),
      norm: normalizeNamaForMatch(p.nama),
    }))
    .filter((p) => p.nip && p.norm);

  const issues: AssetNameIssue[] = [];

  for (const a of assets) {
    // Jika aset sudah secara eksplisit ditautkan ke NIP pegawai aktif atau statusnya 'matched', tidak perlu saran perbaikan
    if (a.holderStatus === 'matched') continue;
    if (a.holderNip && pegawaiNorm.some((p) => p.nip === a.holderNip)) continue;

    const holder = String(a.holderName || "").trim();
    if (!holder || holder === "-") continue;
    const holderNorm = normalizeNamaForMatch(holder);
    if (!holderNorm) continue;

    // Exact berarti ejaan nama lengkap (termasuk gelar) sudah sama dengan
    // database pegawai. Nama dasar yang sama tetapi gelarnya berbeda tetap
    // disarankan menuju nama baku database pegawai.
    if (pegawaiNorm.some((p) => normalizeNamaPenuh(p.nama) === normalizeNamaPenuh(holder))) continue;

    const ranked: Array<{ nip: string; nama: string; score: number }> = [];
    for (const p of pegawaiNorm) {
      const score = nameSimilarity(holderNorm, p.norm);
      ranked.push({ nip: p.nip, nama: p.nama, score });
    }
    ranked.sort((x, y) => y.score - x.score);
    const best = ranked[0] || null;
    if (!best || best.score < SIMILARITY_MIN_RELEVANT) continue;
    // Jangan memberi saran otomatis bila dua pegawai berbeda sama-sama
    // sangat mungkin. Ini mencegah pemetaan nama kepada orang yang keliru.
    if (ranked[1] && best.score - ranked[1].score < 0.06 && normalizeNamaForMatch(ranked[1].nama) !== normalizeNamaForMatch(best.nama)) continue;

    issues.push({
      id: `${a.sheet}|${a.assetId}`,
      sheet: a.sheet,
      sheetLabel: ASSET_SHEET_LABEL[a.sheet],
      assetId: a.assetId,
      assetLabel: a.assetLabel,
      currentHolder: holder,
      matchedNip: best.nip,
      matchedNama: best.nama,
      similarity: best.score,
      confidence: best.score >= SIMILARITY_HIGH ? "tinggi" : "sedang",
    });
  }

  // Urutkan: kemiripan tertinggi dulu (paling layak ditinjau pertama).
  return issues.sort((x, y) => y.similarity - x.similarity);
}

// Kode masalah — dipakai sebagai ID filter di UI
export type IssueCode =
  | "NIP_KOSONG"
  | "NIP_BUKAN_18_DIGIT"
  | "NIP_DUPLIKAT"
  | "FIELD_WAJIB_KOSONG"
  | "STATUS_TIDAK_VALID"
  | "TANGGAL_TIDAK_STANDAR"
  | "NAMA_SPASI_GANDA"
  | "MATCH_ASET_NONE";

export type IssueLevel = "kritis" | "tinggi" | "sedang" | "info";

export interface CleansingIssue {
  nip: string;          // NIP pegawai (string eksak)
  nama: string;         // Nama untuk tampilan
  kode: IssueCode;
  field: string;        // Kunci field yang bermasalah (sesuai Pegawai interface)
  fieldLabel: string;   // Label tampilan
  nilaiLama: string;    // Nilai asli dari database (untuk konfirmasi)
  saranPerbaikan: string; // Nilai yang disarankan (untuk auto-koreksi: ini yang ditulis)
  bisaAutoKoreksi: boolean; // true → tombol Terapkan aktif
  level: IssueLevel;
}

// Kunci unik per isu (untuk tracking status "applied")
export function issueKey(i: CleansingIssue): string {
  return `${i.nip}|${i.kode}|${i.field}`;
}

// ---------------------------------------------------------------------------
// scanPegawai — fungsi utama: pindai seluruh daftar pegawai, kembalikan isu
// ---------------------------------------------------------------------------
export function scanPegawai(list: Pegawai[]): CleansingIssue[] {
  const issues: CleansingIssue[] = [];

  // -- Hitung kemunculan NIP untuk deteksi duplikat --
  const nipCount = new Map<string, number>();
  for (const p of list) {
    const nip = String(p.nip ?? "").trim();
    if (nip) nipCount.set(nip, (nipCount.get(nip) ?? 0) + 1);
  }

  for (const p of list) {
    const nip   = String(p.nip  ?? "").trim();
    const nama  = String(p.nama ?? "").trim();

    // ── 1. NIP KOSONG ────────────────────────────────────────────────────────
    if (!nip) {
      issues.push({
        nip, nama, kode: "NIP_KOSONG",
        field: "nip", fieldLabel: "NIP",
        nilaiLama: "-",
        saranPerbaikan: "Isi NIP 18 digit numerik",
        bisaAutoKoreksi: false,
        level: "kritis",
      });
      continue; // tanpa NIP, cek duplikat & spasi tidak bermakna
    }

    // ── 2. NIP BUKAN 18 DIGIT ───────────────────────────────────────────────
    if (!/^\d{18}$/.test(nip)) {
      issues.push({
        nip, nama, kode: "NIP_BUKAN_18_DIGIT",
        field: "nip", fieldLabel: "NIP",
        nilaiLama: nip,
        saranPerbaikan: `NIP harus tepat 18 digit numerik (sekarang: ${nip.length} karakter)`,
        bisaAutoKoreksi: false,
        level: "kritis",
      });
    }

    // ── 3. NIP DUPLIKAT ──────────────────────────────────────────────────────
    if ((nipCount.get(nip) ?? 0) > 1) {
      issues.push({
        nip, nama, kode: "NIP_DUPLIKAT",
        field: "nip", fieldLabel: "NIP",
        nilaiLama: nip,
        saranPerbaikan: "NIP ini muncul di lebih dari satu baris — periksa dan perbaiki secara manual",
        bisaAutoKoreksi: false,
        level: "kritis",
      });
    }

    // ── 4. FIELD WAJIB KOSONG ────────────────────────────────────────────────
    const REQUIRED: Array<{ key: keyof Pegawai; label: string }> = [
      { key: "jabatan",           label: "Jabatan" },
      { key: "golongan",          label: "Golongan" },
      { key: "tgl_mulai_golongan",label: "TMT Golongan" },
      { key: "tgl_lahir",         label: "Tanggal Lahir" },
    ];
    for (const { key, label } of REQUIRED) {
      const val = String((p as any)[key] ?? "").trim();
      if (!val) {
        issues.push({
          nip, nama, kode: "FIELD_WAJIB_KOSONG",
          field: key as string, fieldLabel: label,
          nilaiLama: "-",
          saranPerbaikan: `Isi kolom ${label}`,
          bisaAutoKoreksi: false,
          level: "kritis",
        });
      }
    }

    // ── 5. STATUS TIDAK VALID ────────────────────────────────────────────────
    const status = String(p.status ?? "").trim().toUpperCase();
    const VALID_STATUS = ["ASN", "PPPK", "HONORER", "PENSIUN"];
    if (!VALID_STATUS.includes(status)) {
      issues.push({
        nip, nama, kode: "STATUS_TIDAK_VALID",
        field: "status", fieldLabel: "Status",
        nilaiLama: status || "-",
        saranPerbaikan: "Status harus salah satu dari: ASN, PPPK, HONORER, PENSIUN",
        bisaAutoKoreksi: false,
        level: "tinggi",
      });
    }

    // ── 6. TANGGAL TIDAK VALID ───────────────────────────────────────────────
    // PostgreSQL lazim mengembalikan kolom DATE dalam ISO (YYYY-MM-DD),
    // sedangkan input SIMOSDA dapat berupa Indonesia/Inggris. Semuanya valid
    // bila parser mengenalinya; cleansing tidak boleh membuat false positive
    // hanya karena perbedaan representasi tampilan.
    const DATE_CHECKS: Array<{ key: keyof Pegawai; label: string }> = [
      { key: "tgl_lahir",          label: "Tanggal Lahir" },
      { key: "tgl_mulai_golongan", label: "TMT Golongan" },
      { key: "tgl_mulai_jabatan",  label: "TMT Jabatan" },
    ];
    for (const { key, label } of DATE_CHECKS) {
      const raw = String((p as any)[key] ?? "").trim();
      if (!raw) continue; // kosong → sudah ditangani FIELD_WAJIB_KOSONG

      // Hanya nilai yang benar-benar tidak dapat dibaca yang menjadi isu.
      const parsed = parseAnyDate(raw);
      if (!parsed) {
        issues.push({
          nip, nama, kode: "TANGGAL_TIDAK_STANDAR",
          field: key as string, fieldLabel: label,
          nilaiLama: raw,
          saranPerbaikan: "Masukkan tanggal sah, misalnya 13 Juli 1992 atau 1992-07-13",
          bisaAutoKoreksi: false,
          level: "tinggi",
        });
      }
    }

    // ── 7. NAMA SPASI GANDA / TRAILING ───────────────────────────────────────
    // Spasi ganda dapat mengganggu name-matching dengan data aset.
    const namaRaw    = String(p.nama ?? "");
    const namaBersih = namaRaw.trim().replace(/\s+/g, " ");
    if (namaBersih !== namaRaw) {
      issues.push({
        nip, nama, kode: "NAMA_SPASI_GANDA",
        field: "nama", fieldLabel: "Nama Lengkap",
        nilaiLama: namaRaw,
        saranPerbaikan: namaBersih,
        bisaAutoKoreksi: true,
        level: "sedang",
      });
    }

    // Pegawai tanpa aset bukan kesalahan cleansing. Informasi relasi aset
    // tetap tersedia pada Data ASN/PPPK, tetapi tidak masuk daftar masalah.
  }

  return issues;
}

// ---------------------------------------------------------------------------
// buildCorrectionPayload — bangun payload untuk apiService.savePegawai()
// Hanya untuk isu yang bisaAutoKoreksi=true.
// ---------------------------------------------------------------------------
export function buildCorrectionPayload(
  p: Pegawai,
  issue: CleansingIssue
): Partial<Pegawai> | null {
  if (!issue.bisaAutoKoreksi) return null;
  const payload: any = { nip: p.nip };
  payload[issue.field] = issue.saranPerbaikan;
  return payload as Partial<Pegawai>;
}

// ---------------------------------------------------------------------------
// Metadata UI per IssueCode (label tab, warna, ikon)
// ---------------------------------------------------------------------------
export const ISSUE_META: Record<
  IssueCode,
  { label: string; short: string; color: string }
> = {
  NIP_KOSONG:          { label: "NIP Kosong",          short: "NIP",      color: "text-red-600 dark:text-red-400" },
  NIP_BUKAN_18_DIGIT:  { label: "NIP Tidak 18 Digit",  short: "NIP",      color: "text-red-600 dark:text-red-400" },
  NIP_DUPLIKAT:        { label: "NIP Duplikat",         short: "Duplikat", color: "text-red-600 dark:text-red-400" },
  FIELD_WAJIB_KOSONG:  { label: "Field Wajib Kosong",  short: "Kosong",   color: "text-red-600 dark:text-red-400" },
  STATUS_TIDAK_VALID:  { label: "Status Tidak Valid",   short: "Status",   color: "text-orange-600 dark:text-orange-400" },
  TANGGAL_TIDAK_STANDAR:{ label: "Format Tanggal",     short: "Tanggal",  color: "text-amber-600 dark:text-amber-400" },
  NAMA_SPASI_GANDA:    { label: "Spasi Nama",           short: "Spasi",    color: "text-yellow-600 dark:text-yellow-400" },
  MATCH_ASET_NONE:     { label: "Tidak Match Aset",    short: "Aset",     color: "text-blue-600 dark:text-blue-400" },
};

export const LEVEL_META: Record<
  IssueLevel,
  { label: string; badge: string }
> = {
  kritis: { label: "Kritis", badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  tinggi: { label: "Tinggi", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  sedang: { label: "Sedang", badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  info:   { label: "Info",   badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
};
