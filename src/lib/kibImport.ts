import Papa from "papaparse";
import type { Equipment } from "@/types";

export const KIB_B_HEADERS = [
  "OPD", "INDEX", "KODE BARANG", "NAMA BARANG", "REGISTER", "KONDISI", "TAHUN",
  "NAMA UMUM", "SPESIFIKASI", "HARGA PEROLEHAN", "KATEGORI", "BIDANG",
  "RUANG/LOKASI", "NAMA PEMEGANG", "MUTASI", "DOKUMENTASI",
] as const;

export interface KibImportRecord extends Partial<Equipment> {
  source_rows: number[];
  code_exists: boolean;
  exact_duplicate: boolean;
  dokumentasi_url?: string;
}

export interface KibImportResult {
  sourceRows: number;
  sourceUnits: number;
  records: KibImportRecord[];
  importable: KibImportRecord[];
  invalid: Array<{ row: number; message: string }>;
  codeWarnings: number;
  exactDuplicates: number;
  aggregatedRows: number;
}

const clean = (value: unknown) => String(value ?? "").replace(/\u0000/g, "").trim();
const normText = (value: unknown) => clean(value).replace(/\s+/g, " ").toUpperCase();
export const normalizeKibCode = (value: unknown) => clean(value).replace(/[^0-9A-Za-z]/g, "").toUpperCase();

export function parseIndonesianMoney(value: unknown): number | undefined {
  const raw = clean(value).replace(/\s/g, "").replace(/Rp/gi, "");
  if (!raw) return undefined;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw;
  if (lastComma > lastDot) normalized = raw.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && /,/.test(raw)) normalized = raw.replace(/,/g, "");
  else if ((raw.match(/\./g) || []).length > 1 || /^\d{1,3}(\.\d{3})+$/.test(raw)) normalized = raw.replace(/\./g, "");
  else normalized = raw.replace(/,/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function canonicalHeaders(fields: string[] = []) {
  return fields.map((field) => clean(field).replace(/^\ufeff/, "").replace(/\s+/g, " ").toUpperCase());
}

function aggregateKey(row: Record<string, string>) {
  return KIB_B_HEADERS.filter((header) => header !== "INDEX")
    .map((header) => normText(row[header])).join("\u001f");
}

function exactKey(item: Partial<Equipment>) {
  return [
    normalizeKibCode(item.kode_barang), normText(item.nama_aset), String(item.tahun || ""), normText(item.merk),
    normText(item.spesifikasi), normText(item.jenis), normText(item.bidang), normText(item.lokasi),
    normText(item.pengguna_raw || item.pengguna), String(item.harga_pembelian ?? ""),
    normText(item.register_barang), normText(item.mutasi), String(item.jumlah ?? 1),
  ].join("|");
}

export async function prepareKibImport(file: File | string, existing: Equipment[]): Promise<KibImportResult> {
  const parsed = await new Promise<Papa.ParseResult<Record<string, string>>>((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: "greedy", delimiter: "", transformHeader: (h) => clean(h).replace(/^\ufeff/, "").replace(/\s+/g, " ").toUpperCase(),
      complete: resolve, error: reject,
    });
  });
  const headers = canonicalHeaders(parsed.meta.fields);
  const missing = KIB_B_HEADERS.filter((header) => !headers.includes(header));
  const unexpected = headers.filter((header) => header && !KIB_B_HEADERS.includes(header as any));
  if (missing.length || unexpected.length) {
    throw new Error(`${missing.length ? `Kolom wajib tidak ditemukan: ${missing.join(", ")}. ` : ""}${unexpected.length ? `Kolom tidak dikenali: ${unexpected.join(", ")}.` : ""}`.trim());
  }
  if (parsed.errors.length) {
    const firstError = parsed.errors[0];
    throw new Error(`CSV tidak dapat dibaca pada baris ${(firstError?.row ?? 0) + 2}: ${firstError?.message ?? "format tidak valid"}`);
  }

  const invalid: Array<{ row: number; message: string }> = [];
  const grouped = new Map<string, { row: Record<string, string>; rows: number[]; indexes: string[] }>();
  const sourceIndexes = new Map<string, number>();
  parsed.data.forEach((raw, index) => {
    const rowNo = index + 2;
    const row = Object.fromEntries(KIB_B_HEADERS.map((header) => [header, clean(raw[header])])) as Record<string, string>;
    if (!row["KODE BARANG"] || !row["NAMA BARANG"] || !row["NAMA UMUM"] || !row.TAHUN) {
      invalid.push({ row: rowNo, message: "KODE BARANG, NAMA BARANG, NAMA UMUM, dan TAHUN wajib diisi." }); return;
    }
    const year = Number(row.TAHUN);
    if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1) { invalid.push({ row: rowNo, message: "TAHUN tidak valid." }); return; }
    const condition = normText(row.KONDISI);
    if (condition && !["BAIK", "KURANG BAIK", "RUSAK RINGAN", "RUSAK BERAT"].includes(condition)) { invalid.push({ row: rowNo, message: "KONDISI tidak dikenali." }); return; }
    if (parseIndonesianMoney(row["HARGA PEROLEHAN"]) === undefined && row["HARGA PEROLEHAN"]) { invalid.push({ row: rowNo, message: "HARGA PEROLEHAN tidak valid." }); return; }
    if (row.INDEX) {
      const indexKey = normText(row.INDEX);
      const firstRow = sourceIndexes.get(indexKey);
      if (firstRow) { invalid.push({ row: rowNo, message: `INDEX sama dengan baris ${firstRow}.` }); return; }
      sourceIndexes.set(indexKey, rowNo);
    }
    // INDEX adalah identitas per unit, bukan pembeda jenis barang. Baris yang
    // sama tetap digabung; INDEX yang tersedia disimpan sebagai daftar unit.
    const key = `GROUP:${aggregateKey(row)}`;
    const current = grouped.get(key);
    if (current) {
      current.rows.push(rowNo);
      if (row.INDEX) current.indexes.push(row.INDEX);
    } else {
      grouped.set(key, { row, rows: [rowNo], indexes: row.INDEX ? [row.INDEX] : [] });
    }
  });

  const existingCodes = new Set(existing.map((row) => normalizeKibCode(row.kode_barang)).filter(Boolean));
  const existingExact = new Set(existing.map(exactKey));
  const existingIndexes = new Set(existing.map((row) => normText(row.kib_index)).filter(Boolean));
  existing.forEach((row) => (row.unit_indexes || []).forEach((index) => {
    const key = normText(index);
    if (key) existingIndexes.add(key);
  }));
  const records: KibImportRecord[] = Array.from(grouped.values()).map(({ row, rows, indexes }) => {
    const record: KibImportRecord = {
      opd: row.OPD || undefined, kib_index: indexes[0] || undefined, unit_indexes: indexes.slice(1),
      kode_barang: row["KODE BARANG"], nama_aset: row["NAMA BARANG"],
      register_barang: row.REGISTER || undefined, kondisi: row.KONDISI || undefined,
      tahun: row.TAHUN, merk: row["NAMA UMUM"], spesifikasi: row.SPESIFIKASI || undefined,
      harga_pembelian: parseIndonesianMoney(row["HARGA PEROLEHAN"]), jenis: row.KATEGORI || undefined,
      bidang: row.BIDANG || undefined, lokasi: row["RUANG/LOKASI"] || undefined,
      pengguna: row["NAMA PEMEGANG"] || undefined, mutasi: row.MUTASI || undefined,
      dokumentasi_url: row.DOKUMENTASI || undefined, jumlah: rows.length, satuan: "Unit",
      source_rows: rows, code_exists: false, exact_duplicate: false,
    };
    record.code_exists = existingCodes.has(normalizeKibCode(record.kode_barang));
    const incomingIndexes = [record.kib_index, ...(record.unit_indexes || [])].map(normText).filter(Boolean);
    record.exact_duplicate = incomingIndexes.length
      ? incomingIndexes.some((index) => existingIndexes.has(index))
      : existingExact.has(exactKey(record));
    return record;
  });
  const importable = records.filter((record) => !record.exact_duplicate);
  return {
    sourceRows: parsed.data.length, sourceUnits: records.reduce((n, r) => n + Number(r.jumlah || 0), 0), records, importable, invalid,
    codeWarnings: records.filter((r) => r.code_exists && !r.exact_duplicate).length,
    exactDuplicates: records.filter((r) => r.exact_duplicate).length,
    aggregatedRows: records.reduce((n, r) => n + Math.max(0, Number(r.jumlah || 0) - 1), 0),
  };
}
