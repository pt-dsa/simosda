import type { Equipment, Vehicle } from "@/types";

export const ASSET_CONDITIONS = [
  "BAIK",
  "KURANG BAIK",
  "RUSAK RINGAN",
  "RUSAK BERAT",
] as const;

export const ASSET_CONDITION_UNSET = "BELUM DIISI";

/**
 * Definisi tunggal untuk kartu kondisi aset. Urutannya sengaja tetap agar
 * Kendaraan dan Inventaris selalu menampilkan lima indikator utama yang
 * sama (Total + empat kondisi), termasuk ketika hitungannya nol.
 *
 * Kelas Tailwind ditulis sebagai literal agar ikut terdeteksi saat build.
 */
export const ASSET_CONDITION_CARD_DEFINITIONS = [
  {
    key: "BAIK",
    label: "Kondisi Baik",
    tone: {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      text: "text-emerald-700 dark:text-emerald-300",
    },
  },
  {
    key: "KURANG BAIK",
    label: "Kurang Baik",
    tone: {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      text: "text-amber-700 dark:text-amber-300",
    },
  },
  {
    key: "RUSAK RINGAN",
    label: "Rusak Ringan",
    tone: {
      bg: "bg-orange-50 dark:bg-orange-950/30",
      text: "text-orange-700 dark:text-orange-300",
    },
  },
  {
    key: "RUSAK BERAT",
    label: "Rusak Berat",
    tone: {
      bg: "bg-red-50 dark:bg-red-950/30",
      text: "text-red-700 dark:text-red-300",
    },
  },
] as const;

const EMPTY_MARKERS = new Set(["", "-", "NULL", "UNDEFINED", "N/A", "NA"]);

/** Menormalkan nilai kondisi tanpa mengarang nilai pengganti. */
export function normalizeAssetCondition(value: unknown): string {
  const normalized = String(value ?? "").trim().toUpperCase();
  return EMPTY_MARKERS.has(normalized) ? "" : normalized;
}

/** Label aman untuk UI/laporan; nilai kosong tetap dibedakan dari BAIK. */
export function assetConditionLabel(value: unknown): string {
  return normalizeAssetCondition(value) || ASSET_CONDITION_UNSET;
}

export function isValidAssetCondition(value: unknown): boolean {
  const normalized = normalizeAssetCondition(value);
  return ASSET_CONDITIONS.includes(normalized as (typeof ASSET_CONDITIONS)[number]);
}

export interface AssetConditionSummaryRow {
  kondisi?: unknown;
}

/**
 * Menghitung empat kondisi resmi tanpa mengubah data sumber. Data kosong
 * dikembalikan terpisah supaya dapat ditampilkan sebagai peringatan kualitas
 * data dan tidak pernah disamarkan sebagai kondisi BAIK.
 */
export function summarizeAssetConditions(rows: AssetConditionSummaryRow[]) {
  const counts = new Map<string, number>(ASSET_CONDITIONS.map((key) => [key, 0]));
  let unset = 0;

  rows.forEach((row) => {
    const normalized = normalizeAssetCondition(row.kondisi);
    if (!normalized) {
      unset += 1;
      return;
    }
    if (counts.has(normalized)) {
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
  });

  return {
    items: ASSET_CONDITION_CARD_DEFINITIONS.map((definition) => ({
      ...definition,
      count: counts.get(definition.key) || 0,
    })),
    unset,
  };
}

export interface MissingAssetConditionIssue {
  id: string;
  assetId: string;
  assetLabel: string;
  holderName: string;
  kind: "vehicle" | "equipment";
  kindLabel: "Kendaraan" | "Inventaris";
  editPath: string;
  tahun: string;
}

/** Audit baca-saja. Fungsi ini tidak pernah menulis atau mengisi kondisi otomatis. */
export function scanMissingAssetConditions(
  vehicles: Vehicle[],
  equipment: Equipment[]
): MissingAssetConditionIssue[] {
  const vehicleIssues = vehicles
    .filter((item) => !normalizeAssetCondition(item.kondisi))
    .map((item) => ({
      id: `vehicle:${item.asset_id}`,
      assetId: String(item.asset_id || ""),
      assetLabel: [item.no_polisi, item.merk || item.nama_aset].filter(Boolean).join(" · ") || "Kendaraan tanpa nama",
      holderName: String(item.pengguna || "").trim(),
      kind: "vehicle" as const,
      kindLabel: "Kendaraan" as const,
      editPath: `/kendaraan?edit=${encodeURIComponent(String(item.asset_id || ""))}`,
      tahun: String(item.tahun || ""),
    }));

  const equipmentIssues = equipment
    .filter((item) => !normalizeAssetCondition(item.kondisi))
    .map((item) => ({
      id: `equipment:${item.asset_id}`,
      assetId: String(item.asset_id || ""),
      assetLabel: [item.nama_aset, item.merk].filter(Boolean).join(" · ") || "Alat/mesin tanpa nama",
      holderName: String(item.pengguna || "").trim(),
      kind: "equipment" as const,
      kindLabel: "Inventaris" as const,
      editPath: `/inventaris?edit=${encodeURIComponent(String(item.asset_id || ""))}`,
      tahun: String(item.tahun || ""),
    }));

  return [...vehicleIssues, ...equipmentIssues];
}
