function compactIdentity(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Memilih kode barang kendaraan tanpa pernah menduplikasi nomor polisi.
 * Data lama dapat memiliki asset_code yang keliru berisi plate_number; nilai
 * tersebut dianggap belum diisi supaya UI tidak menampilkan identitas palsu.
 */
export function resolveVehicleItemCode(item: Record<string, unknown>): string {
  const plate = compactIdentity(item.plate_number || item.no_polisi);
  const candidates = [
    item.kode_barang,
    item.item_code,
    item.goods_code,
    item.asset_code,
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (!value) continue;
    if (plate && compactIdentity(value) === plate) continue;
    return value;
  }
  return "";
}

