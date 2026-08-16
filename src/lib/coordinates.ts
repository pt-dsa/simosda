export type CoordinateKind = "latitude" | "longitude";

export interface CoordinatePairResult {
  valid: boolean;
  empty: boolean;
  latitude?: number;
  longitude?: number;
  error?: string;
}

const EMPTY_COORDINATE_VALUES = new Set(["", "-", "NULL", "UNDEFINED", "N/A", "NA"]);

function coordinateText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function isEmptyCoordinateValue(value: unknown): boolean {
  return EMPTY_COORDINATE_VALUES.has(coordinateText(value).toUpperCase());
}

function parseCoordinateNumber(value: unknown): number | undefined {
  if (isEmptyCoordinateValue(value)) return undefined;
  const normalized = coordinateText(value).replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function validateCoordinatePair(latitudeValue: unknown, longitudeValue: unknown): CoordinatePairResult {
  const latitudeEmpty = isEmptyCoordinateValue(latitudeValue);
  const longitudeEmpty = isEmptyCoordinateValue(longitudeValue);

  if (latitudeEmpty && longitudeEmpty) return { valid: true, empty: true };
  if (latitudeEmpty !== longitudeEmpty) {
    return {
      valid: false,
      empty: false,
      error: "Jika digunakan, latitude dan longitude harus diisi berpasangan. Kosongkan keduanya untuk menyimpan tanpa koordinat.",
    };
  }

  const latitude = parseCoordinateNumber(latitudeValue);
  const longitude = parseCoordinateNumber(longitudeValue);
  if (latitude === undefined || longitude === undefined) {
    return {
      valid: false,
      empty: false,
      error: "Koordinat harus berupa angka. Gunakan titik atau koma sebagai pemisah desimal.",
    };
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return {
      valid: false,
      empty: false,
      error: "Latitude harus berada pada rentang -90–90 dan longitude pada rentang -180–180.",
    };
  }
  return { valid: true, empty: false, latitude, longitude };
}

function firstCoordinateValue(row: Record<string, any>, candidates: string[]): unknown {
  for (const key of candidates) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const value = row[key];
    if (!isEmptyCoordinateValue(value)) return value;
  }
  return undefined;
}

/**
 * Membaca koordinat dari skema aktif maupun nama kolom legacy. Nilai rusak
 * diperlakukan sebagai data kosong agar record lama tetap dapat diperbarui.
 */
export function coordinatePairFromRow(row: Record<string, any>): Pick<CoordinatePairResult, "latitude" | "longitude"> {
  const latitudeValue = firstCoordinateValue(row, ["latitude", "lat", "gps_latitude", "location_latitude"]);
  const longitudeValue = firstCoordinateValue(row, ["longitude", "lng", "lon", "gps_longitude", "location_longitude"]);
  const pair = validateCoordinatePair(latitudeValue, longitudeValue);
  return pair.valid && !pair.empty
    ? { latitude: pair.latitude, longitude: pair.longitude }
    : { latitude: undefined, longitude: undefined };
}

/**
 * Koordinat opsional hanya masuk payload bila keduanya valid. Untuk pasangan
 * kosong, key tidak dikirim sehingga update tidak menghapus data lama secara
 * tidak sengaja dan record tanpa koordinat tetap dapat disimpan.
 */
export function optionalCoordinatePayload(latitudeValue: unknown, longitudeValue: unknown): {
  pair: CoordinatePairResult;
  payload: { latitude?: number; longitude?: number };
} {
  const pair = validateCoordinatePair(latitudeValue, longitudeValue);
  if (!pair.valid || pair.empty) return { pair, payload: {} };
  return { pair, payload: { latitude: pair.latitude, longitude: pair.longitude } };
}

export function osmMiniMapUrl(latitude: number, longitude: number): string {
  const delta = 0.004;
  const bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta]
    .map((value) => value.toFixed(7))
    .join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${latitude.toFixed(7)},${longitude.toFixed(7)}`)}`;
}
