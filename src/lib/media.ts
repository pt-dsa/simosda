const APPSHEET_APP = "SIMOSDA-845158139";

function cleanStoredValue(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  // Beberapa migrasi menyimpan URL sebagai string JSON satu nilai.
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("[") && value.endsWith("]"))) {
    try {
      const parsed = JSON.parse(value);
      return String(Array.isArray(parsed) ? parsed[0] || "" : parsed || "").trim();
    } catch {
      return value;
    }
  }
  return value;
}

export function driveFileId(raw: unknown): string {
  const value = cleanStoredValue(raw);
  const match = value.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || value.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return match?.[1] || "";
}

/** Kandidat berurutan untuk Drive, URL aplikasi lama, data URL, dan blob. */
export function resolveAssetPhotoCandidates(raw: unknown, assetType: "kendaraan" | "alat_mesin"): string[] {
  const value = cleanStoredValue(raw);
  if (!value || /^(javascript:|vbscript:)/i.test(value)) return [];
  if (/^(data:|blob:)/i.test(value)) return [value];

  const fileId = driveFileId(value);
  if (fileId) {
    return [
      `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`,
      `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`,
    ];
  }

  if (/^https?:\/\//i.test(value)) return [value];

  const tableNames = assetType === "kendaraan" ? ["Kendaraan"] : ["Alat & Mesin", "AlatMesin"];
  return tableNames.map((tableName) =>
    `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(APPSHEET_APP)}&tableName=${encodeURIComponent(tableName)}&fileName=${encodeURIComponent(value)}`
  );
}

/** URL utama untuk kompatibilitas pemanggil lama. */
export function resolveAssetPhotoUrl(raw: unknown, assetType: "kendaraan" | "alat_mesin"): string {
  return resolveAssetPhotoCandidates(raw, assetType)[0] || "";
}
