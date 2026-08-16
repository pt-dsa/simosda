import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("id-ID").format(num);
}

/**
 * Nilai database dapat bertipe string, number, null, atau boolean. Seluruh
 * pencarian wajib melewati fungsi ini agar identifier numerik (mis. INDEX,
 * NIP, dan Kode Barang) tidak menyebabkan runtime crash.
 */
export function toSearchText(value: unknown): string {
  return String(value ?? "").toLocaleLowerCase("id-ID");
}

// ---------------------------------------------------------------------------
// DATE HANDLING (SIMOSDA standard: simpan ISO "YYYY-MM-DD", tampil "13 Juni 1968")
// ---------------------------------------------------------------------------
const MONTHS_MAP: Record<string, number> = {
  JANUARI: 0, JANUARY: 0, JAN: 0,
  FEBRUARI: 1, FEBRUARY: 1, FEB: 1, PEBRUARI: 1,
  MARET: 2, MARCH: 2, MAR: 2,
  APRIL: 3, APR: 3,
  MEI: 4, MAY: 4,
  JUNI: 5, JUNE: 5, JUN: 5,
  JULI: 6, JULY: 6, JUL: 6,
  AGUSTUS: 7, AUGUST: 7, AGU: 7, AUG: 7,
  SEPTEMBER: 8, SEP: 8, SEPT: 8,
  OKTOBER: 9, OCTOBER: 9, OKT: 9, OCT: 9,
  NOVEMBER: 10, NOV: 10, NOPEMBER: 10,
  DESEMBER: 11, DECEMBER: 11, DES: 11, DEC: 11,
};

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function makeDate(y: number, m: number, d: number): Date | null {
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  if (y < 1900 || y > 2200) return null;
  if (m < 0 || m > 11) return null;
  if (d < 1 || d > 31) return null;
  const dt = new Date(y, m, d);
  // guard against JS auto-rollover (e.g. 31 Feb)
  if (dt.getFullYear() !== y || dt.getMonth() !== m || dt.getDate() !== d) return null;
  return dt;
}

/**
 * Parse tanggal dari berbagai format (termasuk format legacy):
 *  - Teks bulan Indonesia/Inggris: "13 JUNE 1968", "1 April 2019"
 *  - ISO: "1968-06-13"
 *  - Indonesia numerik: "13-06-1968", "13/06/1968", "03-02-25"
 *  - Objek Date (saat sel benar-benar bertipe tanggal)
 * Untuk format numerik yang ambigu, urutan dianggap HARI-BULAN-TAHUN (Indonesia).
 */
export function parseAnyDate(input: unknown): Date | null {
  if (input == null) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;

  const raw = String(input).trim();
  if (!raw) return null;

  // 1) "DD MMMM YYYY" (teks bulan)
  const parts = raw.toUpperCase().split(/[\s,]+/).filter(Boolean);
  if (parts.length >= 3 && MONTHS_MAP[parts[1]] !== undefined) {
    const d = makeDate(parseInt(parts[parts.length - 1]), MONTHS_MAP[parts[1]], parseInt(parts[0]));
    if (d) return d;
  }

  // 2) ISO "YYYY-MM-DD" / "YYYY/MM/DD"
  let m = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const d = makeDate(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    if (d) return d;
  }

  // 3) Numerik Indonesia "DD-MM-YYYY" / "DD/MM/YYYY" / "DD-MM-YY"
  m = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    let day = parseInt(m[1]);
    let mon = parseInt(m[2]);
    let year = parseInt(m[3]);
    if (m[3].length === 2) year += year >= 70 ? 1900 : 2000;
    // jika "bulan" > 12 tapi "hari" <= 12 → kemungkinan format MM-DD, tukar
    if (mon > 12 && day <= 12) { const t = day; day = mon; mon = t; }
    const d = makeDate(year, mon - 1, day);
    if (d) return d;
  }

  return null;
}

// Alias backward-compat (dipakai service lama)
export function parseIndonesianDate(dateStr: string): Date | null {
  return parseAnyDate(dateStr);
}

/** Kanonik penyimpanan database: "YYYY-MM-DD" (atau "" jika tidak terbaca). */
export function toStorageDate(input: unknown): string {
  const d = parseAnyDate(input);
  if (!d) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

/** Untuk <input type="date"> butuh "YYYY-MM-DD". */
export function toInputDate(input: unknown): string {
  const d = parseAnyDate(input);
  if (!d) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Tampilan ramah: "13 Juni 1968". */
export function formatDate(input: string | null | undefined): string {
  const d = parseAnyDate(input);
  if (!d) return input ? String(input) : "-";
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

export const formatTanggalIndo = formatDate;

/**
 * Tanggal yang dapat dibaca oleh parser adalah tanggal sah, walaupun database
 * PostgreSQL mengembalikannya sebagai ISO. Jangan gunakan perbedaan tampilan
 * sebagai indikator kesalahan data.
 */
export function isValidSimosdaDate(input: unknown): boolean {
  return !!parseAnyDate(input);
}

/** Nilai teks Indonesia untuk input manual dan audit pengguna. */
export function toIndonesianDateText(input: unknown): string {
  const parsed = parseAnyDate(input);
  return parsed ? formatDate(String(input)) : "";
}

// ---------------------------------------------------------------------------
// KEY / DATA NORMALIZATION
// ---------------------------------------------------------------------------
export function normalizeKey(key: string): string {
  if (!key) return "";
  return key
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function parseMoneyString(val: any): number {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const strValue = String(val).trim();
  const cleaned = strValue.replace(/[^0-9,.-]+/g, "");
  if (!cleaned) return 0;
  if (/,\d{1,2}$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
  } else if (/\.\d{1,2}$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/,/g, "")) || 0;
  } else {
    return parseFloat(cleaned.replace(/[,.]/g, "")) || 0;
  }
}

// STRING-ONLY KEYS — never coerce these to numbers even if they look numeric.
// NIP is 18-digit and exceeds MAX_SAFE_INTEGER; converting to float destroys precision.
const STRING_ONLY_KEYS = new Set([
  "no_polisi", "id", "nip", "pengguna_nip", "penanggung_jawab_nip",
  "kode", "kode_barang", "asset_code", "kib_index", "index", "register_barang",
  "no", "nomer", "kontak", "phone", "telepon", "no_rangka", "no_mesin", "no_bpkb",
]);

export function normalizeData(data: any[]): any[] {
  return data.map((row) => {
    const normalizedRow: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      const normKey = normalizeKey(key);

      // Alias handling for asset identification
      if (["nomor_polisi", "nopol", "plate"].includes(normKey)) {
        normalizedRow["no_polisi"] = value;
      }
      if (["asset_name", "name", "nama_barang"].includes(normKey)) {
        normalizedRow["nama_aset"] = value;
      }
      if (["id_asset", "assetid"].includes(normKey)) {
        normalizedRow["asset_id"] = value;
      }

      // Value coercions — skip keys that must stay as strings
      let finalValue: any = value;
      if (typeof finalValue === "string" && !STRING_ONLY_KEYS.has(normKey)) {
        const valTrim = finalValue.trim();
        if (/^-?\d+(\.\d+)?$/.test(valTrim)) {
          finalValue = parseFloat(valTrim);
        }
      }

      // FIX: jangan jatuh ke nilai asli saat hasil parse sah bernilai 0 / "".
      normalizedRow[normKey] = finalValue;
    }
    return normalizedRow;
  });
}

// ---------------------------------------------------------------------------
// DATA MASKING
// ---------------------------------------------------------------------------
export function maskSensitiveData(
  type: "nip" | "tanggal_lahir" | "kontak", 
  value: string | null | undefined, 
  role?: string, 
  currentUserNip?: string, 
  profileNip?: string
): string {
  if (!value) return "";
  const strValue = String(value);
  // Jika bukan role pegawai, tidak perlu dimasker
  if (role !== "pegawai") return strValue;
  // Jika ini adalah profil milik user sendiri, jangan dimasker
  if (currentUserNip && profileNip && String(currentUserNip).trim() === String(profileNip).trim()) {
    return strValue;
  }

  switch (type) {
    case "nip":
      return strValue.substring(0, 4) + "x".repeat(Math.max(strValue.length - 4, 14));
    case "tanggal_lahir":
      return "XX - XX - XXXX";
    case "kontak":
      return strValue.substring(0, 4) + "X".repeat(Math.max(strValue.length - 4, 4));
    default:
      return strValue;
  }
}
