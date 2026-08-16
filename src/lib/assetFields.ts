const EMPTY_ASSET_MARKERS = new Set(["", "-", "NULL", "UNDEFINED", "N/A", "NA"]);

export function isEmptyAssetField(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return EMPTY_ASSET_MARKERS.has(String(value).trim().toUpperCase());
}

/**
 * Data impor lama memakai tanda "-" untuk nilai kosong. Nilai tampilan itu
 * tidak boleh dikirim kembali ke Supabase sebagai isi field database.
 */
export function normalizeAssetText(value: unknown): string {
  return isEmptyAssetField(value) ? "" : String(value).trim();
}

/**
 * Mengubah input angka aset menjadi number yang aman untuk kolom numeric.
 * Mendukung angka biasa, desimal koma, serta format ribuan Indonesia.
 */
export function optionalAssetNumber(value: unknown): number | undefined {
  if (isEmptyAssetField(value)) return undefined;
  let text = String(value).trim().replace(/\s+/g, "").replace(/^Rp/i, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    text = text.replace(",", ".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(text)) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function validOptionalAssetNumber(
  value: unknown,
  options: { integer?: boolean; min?: number; max?: number } = {},
): boolean {
  if (isEmptyAssetField(value)) return true;
  const parsed = optionalAssetNumber(value);
  if (parsed === undefined) return false;
  if (options.integer && !Number.isInteger(parsed)) return false;
  if (options.min !== undefined && parsed < options.min) return false;
  if (options.max !== undefined && parsed > options.max) return false;
  return true;
}


/**
 * Foreign Key (NIP) tidak boleh dikirim sebagai string kosong ke Supabase,
 * karena akan melanggar foreign key constraint. Gunakan null jika kosong.
 */
export function normalizeAssetNip(value: unknown): string | null {
  return isEmptyAssetField(value) ? null : String(value).trim();
}
