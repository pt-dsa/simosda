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
  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  body { padding: 0; margin: 0; }
  html, body, #map { height: 100%; width: 100%; background: #f3f4f6; }
  .leaflet-control-attribution { font-size: 9px !important; background: rgba(255,255,255,0.7) !important; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', {
    center: [${latitude}, ${longitude}],
    zoom: 16,
    zoomControl: false,
    attributionControl: false
  });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 20
  }).addTo(map);
  L.control.attribution({position: 'bottomright', prefix: false})
    .addAttribution('&copy; <a href="https://osm.org/copyright" target="_blank">OSM</a>, &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>')
    .addTo(map);
  
  var svgIcon = L.divIcon({
    html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" style="fill:#ef4444;filter:drop-shadow(0px 4px 4px rgba(0,0,0,0.3));width:28px;height:28px;margin-top:-28px;margin-left:-14px;"><path d="M192 0C86 0 0 86 0 192c0 77.4 27 122.9 114.1 234.3 35.8 45.9 74.5 95.6 77.9 100.2 3.4-4.6 42.1-54.3 77.9-100.2C357 314.9 384 269.4 384 192 384 86 298 0 192 0zm0 272c-44.2 0-80-35.8-80-80s35.8-80 80-80 80 35.8 80 80-35.8 80-80 80z"/></svg>',
    className: '',
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  });
  L.marker([${latitude}, ${longitude}], {icon: svgIcon}).addTo(map);
</script>
</body>
</html>
  `;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html.trim())}`;
}
