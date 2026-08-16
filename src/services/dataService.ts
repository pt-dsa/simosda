import { normalizeData, parseAnyDate } from "@/lib/utils";
import { nextCycleDate, pensionDate, buildPenjagaanEvents } from "@/lib/penjagaan";
import { buildUnifiedAssets, buildFuzzyNipSet, rekapKelengkapan } from "@/lib/kelengkapan";
import type { DashboardMetrics, DistribusiItem } from "@/types";
import { apiService, onDataMutation } from "@/services/apiService";
import { supabase, PHOTO_BUCKET } from "@/lib/supabaseClient";
import { normalizeIndonesianPhoneNumber } from "@/lib/contact";
import { resolveVehicleItemCode } from "@/lib/assetIdentity";
import { coordinatePairFromRow } from "@/lib/coordinates";

// Navigasi antar-menu memakai snapshot sesi yang sama. Perubahan data dan tombol
// Sinkronisasi tetap menghapus cache secara eksplisit, sehingga pengguna tidak
// perlu membayar waktu muat ulang pada setiap perpindahan menu.
const CACHE_EXPIRY = 5 * 60 * 1000;
const DEFERRED_V2 = new Set(["assets_inventory", "vehicle_budget", "vehicle_maintenance", "equipment_maintenance", "maintenance", "loans"]);
const inFlight = new Map<string, Promise<any[]>>();

// ── Cache Invalidation ──────────────────────────────────────────────────────
// Hapus cache sessionStorage untuk tabel yang di-notify (atau semua bila
// `tables` kosong). Hanya berlaku untuk prefix key yang dikenal
// (supabase_v2_backend_, data_v5_, supabase_v1_); legacy keys tidak dihapus
// kecuali mode catch-all. Juga membatalkan promise inFlight agar tidak
// menulis data basi kembali ke cache setelah invalidation.
function invalidateCache(tables?: string[]) {
  const targetSet = tables && tables.length > 0 ? new Set(tables) : null;
  const derivedTables = ["pegawai", "assets_vehicle", "assets_equipment", "asset_locations"];

  if (typeof sessionStorage !== "undefined") {
    Object.keys(sessionStorage).forEach((key) => {
      const isKnown =
        key.startsWith("supabase_v2_backend_") ||
        key.startsWith("data_v5_") ||
        key.startsWith("supabase_v1_");
      if (!isKnown) return;

      if (targetSet) {
        const tableName = key.replace(/^(supabase_v2_backend_|data_v5_|supabase_v1_)/, "");
        if (!targetSet.has(tableName)) return;
      }

      sessionStorage.removeItem(key);
    });
    // Dashboard metrics derived dari pegawai + assets — invalidasi bila tabel terkait berubah
    if (!targetSet || derivedTables.some((t) => targetSet.has(t))) {
      sessionStorage.removeItem("simosda_dashboard_metrics_v1113");
    }
    sessionStorage.removeItem("data_last_updated");
  }

  // Batalkan promise in-flight agar tidak menulis data lama kembali ke cache.
  if (inFlight.size > 0) {
    if (targetSet) {
      for (const t of targetSet) {
        inFlight.delete(`supabase_v2_backend_${t}`);
      }
    } else {
      inFlight.clear();
    }
  }
}

// ── Event Deduplication ─────────────────────────────────────────────────────
// Beberapa invalidation dapat terjadi dalam microtask yang sama (clearCache
// + notifyMutation). Dispatch hanya sekali per event loop untuk menghindari
// loadAlerts/penjagaan recomputation berulang.
let dataChangedScheduled = false;
function scheduleDataChanged() {
  if (dataChangedScheduled) return;
  dataChangedScheduled = true;
  if (typeof window === "undefined") { dataChangedScheduled = false; return; }
  Promise.resolve().then(() => {
    dataChangedScheduled = false;
    window.dispatchEvent(new CustomEvent("simosda:data-changed"));
  });
}

// Setiap operasi tulis dari apiService (tambah/edit/hapus pegawai, aset, akun,
// config) otomatis membatalkan cache — data selalu segar di SEMUA menu.
onDataMutation((tables) => {
  try {
    invalidateCache(tables);
    scheduleDataChanged();
  } catch (e) {
    console.error("[dataService] cache invalidation error:", e);
  }
});

function cacheTableRows(table: string, rows: any[], timestamp = Date.now()) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(`supabase_v2_backend_${table}`, JSON.stringify({ timestamp, data: rows || [] }));
  sessionStorage.setItem("data_last_updated", new Date(timestamp).toISOString());
}

// primeDashboardSnapshot dihilangkan karena Supabase menggunakan individual fetch

// ---------------------------------------------------------------------------
// Core fetch — Supabase Integration
// ---------------------------------------------------------------------------
async function fetchTableData(
  tableName: string,
  options: { allowDeferredPhotos?: boolean } = {},
): Promise<any[]> {
  if (DEFERRED_V2.has(tableName)) return [];
  const cacheKey = `supabase_v2_backend_${tableName}`;

  try {
    const cached = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(cacheKey) : null;
    if (cached) {
      const parsed = JSON.parse(cached);
      const fresh = Date.now() - parsed.timestamp < CACHE_EXPIRY;
      const photoUrlsDeferred = tableName === "pegawai"
        && Array.isArray(parsed.data)
        && parsed.data.some((row: any) => row?._photo_urls_deferred === true);
      if (fresh && (!photoUrlsDeferred || options.allowDeferredPhotos)) return parsed.data;
    }

    let request = inFlight.get(cacheKey);
    if (!request) {
      request = (async () => {
        const { data, error } = await supabase.from(tableName).select('*');
        if (error) throw error;
        return data || [];
      })();
      inFlight.set(cacheKey, request);
      request.finally(() => inFlight.delete(cacheKey));
    }
    const resultData = await request;

    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: resultData }));
        sessionStorage.setItem("data_last_updated", new Date().toISOString());
      }
    } catch (e) {
      console.warn("Storage full", e);
    }

    return normalizeData(resultData || []);
  } catch (error: any) {
    console.error(`[SIMOSDA] ❌ Gagal fetch data ${tableName}:`, error.message);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Name-matching helpers
// ---------------------------------------------------------------------------
function exactKey(name: string): string {
  return String(name || "").toUpperCase().trim().replace(/\s+/g, " ");
}
function fuzzyKey(name: string): string {
  return exactKey(String(name || "").split(",")[0]);
}
function buildNameLookup(assets: any[]): Map<string, any[]> {
  const byExact = new Map<string, any[]>();
  for (const a of assets) {
    if (a.pengguna_nip) continue; // Sudah ada NIP, relasi langsung via NIP
    const holder = a.pengguna || a.holder_name || "";
    if (!holder || holder === "-") continue;
    const ek = exactKey(holder);
    if (!byExact.has(ek)) byExact.set(ek, []);
    byExact.get(ek)!.push(a);
  }
  return byExact;
}

function buildNipLookup(assets: any[]): Map<string, any[]> {
  const byNip = new Map<string, any[]>();
  for (const asset of assets) {
    const nip = String(asset.pengguna_nip || "").trim();
    if (!nip) continue;
    const rows = byNip.get(nip) || [];
    rows.push(asset);
    byNip.set(nip, rows);
  }
  return byNip;
}

function matchAssetsByNip(nip: string, byNip: Map<string, any[]>) {
  const key = String(nip || "").trim();
  return key && byNip.has(key)
    ? { items: byNip.get(key)!, via: "exact" as const }
    : { items: [] as any[], via: "none" as const };
}

function locationTypeMatches(value: unknown, expected: "vehicle" | "equipment"): boolean {
  const type = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!type) return true;
  return expected === "vehicle"
    ? type.includes("kendaraan") || type.includes("vehicle")
    : type.includes("alat") || type.includes("mesin") || type.includes("equipment");
}

function buildAssetLocationLookup(rows: any[], expected: "vehicle" | "equipment"): Map<string, any> {
  const lookup = new Map<string, any>();
  for (const row of rows) {
    const assetId = String(row.asset_id || row.id_aset || "").trim();
    if (!assetId || !locationTypeMatches(row.type || row.asset_type || row.jenis_aset, expected)) continue;
    const coordinates = coordinatePairFromRow(row);
    if (coordinates.latitude !== undefined && coordinates.longitude !== undefined) lookup.set(assetId, row);
  }
  return lookup;
}

// ---------------------------------------------------------------------------
// Photo URL — signed Supabase URL dipertahankan; Google Drive hanya fallback legacy
// ---------------------------------------------------------------------------
function convertGDriveUrl(rawUrl: string): string {
  const url = String(rawUrl || "").trim();
  if (url) {
    // https://drive.google.com/file/d/<id>/view  →  direct view
    const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
    // https://drive.google.com/uc?...&id=<id>
    const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w400`;
    if (url.startsWith("http")) return url;
  }
  // Tidak ada foto asli → kembalikan kosong (UI memakai avatar inisial, bukan foto palsu).
  return "";
}

// ---------------------------------------------------------------------------
// Unit kerja extraction (fallback when no vehicle match)
// ---------------------------------------------------------------------------
function extractUnitKerja(jabatan: string): string {
  if (!jabatan) return "";
  const j = jabatan.toUpperCase().trim();
  if (j.includes("KEPALA DINAS")) return "DINAS CIPTA KARYA DAN TATA RUANG";
  if (j.includes("SEKRETARIS DINAS")) return "SEKRETARIAT DINAS";
  if (j.includes("KEPALA BIDANG")) return `BIDANG ${jabatan.replace(/kepala bidang\s*/i, "").trim().toUpperCase()}`;
  if (j.includes("KEPALA UPTD")) return `UPTD ${jabatan.replace(/kepala uptd\s*/i, "").trim().toUpperCase()}`;
  if (j.includes("KEPALA SUB BAGIAN")) return "SUB BAGIAN";
  if (j.includes("UPTD")) return "UPTD";
  if (j.includes("BIDANG")) {
    const m = j.match(/BIDANG\s+([A-Z\s]+?)(?:\s+AHLI|\s+MUDA|\s+PERTAMA|$)/);
    return m ? `BIDANG ${m[1].trim()}` : "BIDANG";
  }
  return "";
}

// ---------------------------------------------------------------------------
// SDM distribution builders
// ---------------------------------------------------------------------------
function buildGolonganDistribusi(list: any[]): DistribusiItem[] {
  const counts: Record<string, number> = {};
  for (const p of list) {
    const level = String(p.golongan || "").split("/")[0].trim();
    if (level) counts[level] = (counts[level] || 0) + 1;
  }
  const ORDER = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII"];
  return Object.entries(counts)
    .sort(([a], [b]) => {
      const ai = ORDER.indexOf(a);
      const bi = ORDER.indexOf(b);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.localeCompare(b, "id", { numeric: true });
    })
    .map(([name, value]) => ({ name, value }));
}

function buildPendidikanDistribusi(list: any[]): DistribusiItem[] {
  const LABEL: Record<string, string> = {
    "STRATA II": "S-2/STRATA II", "STRATA I": "S-1/STRATA I",
    "DIPLOMA IV": "D-IV", "DIPLOMA III": "D-III", "DIPLOMA II": "D-II", "DIPLOMA I": "D-I",
    "SEKOLAH LANJUTAN TINGKAT ATAS": "SMA/SMK/SLTA",
    "SMA": "SMA/SMK/SLTA", "SMK": "SMA/SMK/SLTA", "SLTA": "SMA/SMK/SLTA",
    "SEKOLAH MENENGAH PERTAMA": "SMP", "SMP": "SMP",
    "SEKOLAH DASAR": "SD", "SD": "SD",
    "S2": "S-2/STRATA II", "S1": "S-1/STRATA I", "S-2": "S-2/STRATA II", "S-1": "S-1/STRATA I",
  };
  const counts: Record<string, number> = {};
  for (const p of list) {
    const raw = String(p.tingkat || "").trim().toUpperCase();
    const label = LABEL[raw] || (raw || "Lainnya");
    counts[label] = (counts[label] || 0) + 1;
  }
  // Urutan dari jenjang terendah ke tertinggi (SMP → S-2)
  const ORDER = ["SD", "SMP", "SMA/SMK/SLTA", "D-I", "D-II", "D-III", "D-IV", "S-1/STRATA I", "S-2/STRATA II", "Lainnya"];
  return Object.entries(counts)
    .sort(([a], [b]) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99))
    .map(([name, value]) => ({ name, value }));
}

function buildMasaKerjaDistribusi(list: any[]): DistribusiItem[] {
  const b = { "0–5 Thn": 0, "5–10 Thn": 0, "10–20 Thn": 0, "20+ Thn": 0 };
  for (const p of list) {
    const y = Number(p.masa_kerja_tahun) || 0;
    if (y < 5) b["0–5 Thn"]++;
    else if (y < 10) b["5–10 Thn"]++;
    else if (y < 20) b["10–20 Thn"]++;
    else b["20+ Thn"]++;
  }
  return Object.entries(b).map(([name, value]) => ({ name, value }));
}

// ---------------------------------------------------------------------------
// Main service object
// ---------------------------------------------------------------------------
export const dataService = {
  clearCache() {
    invalidateCache();
    scheduleDataChanged();
  },

  getLastUpdated() {
    return typeof sessionStorage !== "undefined" ? sessionStorage.getItem("data_last_updated") : null;
  },

  
  // --- MUTATIONS ---
  
  _sanitizeData(data: any, allowedKeys: string[]) {
    const sanitized: any = {};
    for (const key of allowedKeys) {
      if (data[key] !== undefined) {
        sanitized[key] = data[key];
      }
    }
    return sanitized;
  },

  async savePegawai(data: Partial<any>, isNew: boolean) {
    const allowed = ['nip', 'nama', 'jabatan', 'unit_kerja', 'golongan', 'status', 'kategori_pppk', 'tgl_lahir', 'tgl_mulai_golongan', 'tgl_mulai_jabatan', 'masa_kerja_tahun', 'masa_kerja_bulan', 'tingkat', 'pendidikan_jurusan', 'universitas', 'tahun_lulus', 'riwayat_diklat', 'tahun_diklat', 'usia', 'kontak', 'email', 'keterangan', 'catatan_mutasi_masuk', 'catatan_mutasi_keluar', 'is_active'];
    const sanitized = this._sanitizeData(data, allowed);
    await apiService.savePegawai(sanitized, isNew);
  },

  async deletePegawai(nip: string) {
    await apiService.deletePegawai(nip);
  },

  async saveVehicle(data: Partial<any>, isNew: boolean) {
    const allowed = [
      'asset_id', 'kode_barang', 'nama_aset', 'merk', 'tahun', 'pengguna',
      'pengguna_nip', 'pengguna_raw', 'pengguna_match_status', 'penanggung_jawab', 'penanggung_jawab_nip', 'lokasi', 'kondisi', 'foto', 'latitude', 'longitude',
      'no_polisi', 'tipe', 'jenis_kendaraan', 'km_kendaraan', 'unit_kerja',
      'kapasitas_mesin', 'no_bpkb', 'no_rangka', 'no_mesin',
      'harga_pembelian', 'qr_url'
    ];
    const sanitized = this._sanitizeData(data, allowed);

    const result = await apiService.saveAsset('assets_vehicle', sanitized, isNew);
    return result;
  },

  async deleteVehicle(asset_id: string) {
    await apiService.deleteAsset('assets_vehicle', asset_id);
  },

  async saveEquipment(data: Partial<any>, isNew: boolean) {
    const allowed = [
      'asset_id', 'kode_barang', 'nama_aset', 'merk', 'tahun', 'pengguna',
      'pengguna_nip', 'pengguna_raw', 'pengguna_match_status', 'penanggung_jawab', 'penanggung_jawab_nip', 'lokasi', 'kondisi', 'foto', 'latitude', 'longitude',
      'jenis', 'jumlah', 'satuan', 'harga_pembelian', 'qr_url', 'opd',
      'kib_index', 'unit_indexes', 'register_barang', 'spesifikasi', 'bidang',
      'mutasi', 'dokumentasi', 'dokumentasi_primary_id'
    ];
    const sanitized = this._sanitizeData(data, allowed);
    
    const result = await apiService.saveAsset('assets_equipment', sanitized, isNew);
    return result;
  },

  async deleteEquipment(asset_id: string) {
    await apiService.deleteAsset('assets_equipment', asset_id);
  },

  async saveInventory(data: Partial<any>, isNew: boolean) {
    void data; void isNew;
    throw new Error('Menu dalam pengembangan, nantikan pada SIMOSDA Versi 2.');
  },

  async deleteInventory(asset_id: string) {
    void asset_id;
    throw new Error('Menu dalam pengembangan, nantikan pada SIMOSDA Versi 2.');
  },

  async getSystemSettings(): Promise<{ bup: number; kgbCycle: number; pangkatCycle: number }> {
    try {
      const rows = await fetchTableData("system_config");
      const values: Record<string, string> = {};
      rows.forEach((r: any) => {
        const key = String(r.key ?? r.config_key ?? '').toUpperCase();
        if (key) values[key] = String(r.value ?? r.config_value ?? '');
      });
      const numberOr = (key: string, fallback: number) => {
        const n = parseInt(values[key] || '', 10);
        return Number.isFinite(n) ? n : fallback;
      };
      return { bup: numberOr('BUP_USIA', 58), kgbCycle: numberOr('KGB_CYCLE_YEARS', 2), pangkatCycle: numberOr('PANGKAT_CYCLE_YEARS', 4) };
    } catch {
      return { bup: 58, kgbCycle: 2, pangkatCycle: 4 };
    }
  },

  /** Direktori ringan untuk suggestion/pemetaan nama tanpa menghitung relasi aset. */
  async getEmployeeDirectory() {
    const rows = await fetchTableData("pegawai");
    return rows.map((item: any) => {
      const nama = String(item.nama_pegawai || item.nama || item.nama_lengkap || "").trim();
      const aktif = String(item.is_active ?? "TRUE").trim().toUpperCase();
      if (!nama || ["FALSE", "0", "TIDAK"].includes(aktif)) return null;
      const statusSource = String(item.status || "").trim().toUpperCase();
      return {
        nip: String(item.nip || item.nomer_induk_pegawai || "").trim(),
        nama,
        jabatan: String(item.jabatan || "").trim(),
        unit_kerja: String(item.unit_kerja || "").trim(),
        status: statusSource.startsWith("PPPK") ? "PPPK" : (["PNS", "CPNS"].includes(statusSource) ? "ASN" : statusSource),
        kategori_pppk: String(item.kategori_pppk || "").trim(),
        email: String(item.email || "").trim(),
        tgl_lahir: String(item.tgl_lahir || item.tanggal_lahir || "").trim(),
        is_active: true,
      };
    }).filter(Boolean);
  },

  async getVehicles() {
    const [data, locationRows] = await Promise.all([
      fetchTableData("assets_vehicle"),
      fetchTableData("asset_locations"),
    ]);
    const locationLookup = buildAssetLocationLookup(locationRows, "vehicle");
    return data.map((item: any) => {
      // Nomor polisi dan kode barang adalah dua identitas berbeda. Jangan
      // menyalin kode barang ke nomor polisi ketika data nomor polisi kosong.
      let no_polisi = item.plate_number || item.no_polisi || "";
      let foto = "";
      const fotoStoragePath = String(item.foto_storage_path || "").trim();
      if (fotoStoragePath) {
        foto = supabase.storage.from('asset-photos').getPublicUrl(fotoStoragePath).data.publicUrl;
      } else {
        foto = item.photo_legacy || item.foto || item.photo;
        if (no_polisi === "B 6590 WAQ" || no_polisi === "B 6590 MAQ")
          foto = "Kendaraan_Images/B 6590 WAQ.jpg";
        else if (no_polisi === "B 6924 NQA.")
          foto = "Kendaraan_Images/B 6924 NQA..jpg";
      }
      const assetId = String(item.asset_id || item.id || "").trim();
      const ownCoordinates = coordinatePairFromRow(item);
      const coordinates = ownCoordinates.latitude !== undefined
        ? ownCoordinates
        : coordinatePairFromRow(locationLookup.get(assetId) || {});
      return {
        asset_id: assetId,
        kode_barang: String(resolveVehicleItemCode(item) || ""),
        nama_aset: item.asset_name || item.nama_aset || item.asset_category || "Kendaraan Dinas",
        no_polisi,
        merk: item.brand || item.merk || "",
        tipe: item.vehicle_type || item.tipe || "",
        tahun: item.purchase_year || item.tahun || "",
        jenis_kendaraan: item.asset_category || item.jenis_kendaraan || item.nama_aset,
        pengguna: item.holder_name || item.pengguna || "",
        pengguna_nip: String(item.pengguna_nip || ""),
        pengguna_raw: item.pengguna_raw || item.holder_name || item.pengguna || "",
        pengguna_match_status: item.pengguna_match_status || (item.pengguna_nip ? "matched" : "unmatched"),
        penanggung_jawab: item.person_in_charge || item.penanggung_jawab || "",
        penanggung_jawab_nip: String(item.penanggung_jawab_nip || ""),
        lokasi: item.usage || item.lokasi || item.unit_kerja || "",
        unit_kerja: item.usage || item.unit_kerja || item.lokasi || "",
        // Jangan pernah menganggap kondisi kosong sebagai BAIK. Data legacy kosong
        // harus tetap kosong agar dapat diaudit dan diverifikasi pengguna.
        kondisi: String(item.kondisi || item.condition || "").trim().toUpperCase(),
        kapasitas_mesin: item.engine_capacity_cc ?? item.kapasitas_mesin ?? item.cc ?? "",
        no_bpkb: item.bpkb_number || item.no_bpkb || "",
        no_rangka: item.chassis_number || item.no_rangka || "",
        no_mesin: item.engine_number || item.no_mesin || "",
        harga_pembelian: item.acquisition_price ?? item.harga_pembelian ?? "",
        km_kendaraan: item.current_km ?? item.km_kendaraan ?? "",
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        foto,
        qr_url: item.qr_legacy_url || item.qr_url,
        opd: item.opd || "",
        kib_index: String(item.kib_index || ""),
        unit_indexes: Array.isArray(item.unit_indexes) ? item.unit_indexes.map((value: unknown) => String(value)) : [],
        register_barang: String(item.register_barang || ""),
        spesifikasi: item.spesifikasi || "",
        bidang: item.bidang || "",
        mutasi: item.mutasi || "",
        dokumentasi: Array.isArray(item.dokumentasi) ? item.dokumentasi : [],
        dokumentasi_primary_id: item.dokumentasi_primary_id || "",
      };
    });
  },

  async getEquipment() {
    const [data, locationRows] = await Promise.all([
      fetchTableData("assets_equipment"),
      fetchTableData("asset_locations"),
    ]);
    const locationLookup = buildAssetLocationLookup(locationRows, "equipment");
    return data.map((item: any) => {
      const assetId = String(item.asset_id || item.id || "").trim();
      const ownCoordinates = coordinatePairFromRow(item);
      const coordinates = ownCoordinates.latitude !== undefined
        ? ownCoordinates
        : coordinatePairFromRow(locationLookup.get(assetId) || {});
      return {
        ...item,
        asset_id: assetId,
        kode_barang: String(item.asset_code || item.kode_barang || ""),
        nama_aset: item.asset_name || item.nama_aset || "",
        merk: item.brand || item.merk || "",
        jenis: item.asset_category || item.jenis || "",
        jumlah: item.quantity || item.jumlah || 1,
        satuan: item.unit || item.satuan || "Unit",
        tahun: item.purchase_year ?? item.tahun ?? "",
        pengguna: item.holder_name || item.pengguna || "",
        pengguna_nip: String(item.pengguna_nip || ""),
        pengguna_raw: item.pengguna_raw || item.holder_name || item.pengguna || "",
        pengguna_match_status: item.pengguna_match_status || (item.pengguna_nip ? "matched" : "unmatched"),
        penanggung_jawab: item.person_in_charge || item.penanggung_jawab || "",
        penanggung_jawab_nip: String(item.penanggung_jawab_nip || ""),
        lokasi: item.location || item.lokasi || "",
        kondisi: String(item.condition || item.kondisi || "").trim().toUpperCase(),
        harga_pembelian: item.acquisition_price ?? item.harga_pembelian ?? "",
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        foto: String(item.foto_storage_path || "").trim() 
          ? supabase.storage.from('asset-photos').getPublicUrl(String(item.foto_storage_path || "").trim()).data.publicUrl 
          : (item.photo_legacy || item.foto || item.photo),
        qr_url: item.qr_legacy_url || item.qr_url,
        kib_index: String(item.kib_index || item.index || ""),
        unit_indexes: Array.isArray(item.unit_indexes) ? item.unit_indexes.map((value: unknown) => String(value)) : [],
        register_barang: String(item.register_barang || ""),
      };
    });
  },

  async getInventory() { return []; },

  async getBudgets() { return []; },
  async getMaintenance() { return []; },
  async getEquipmentMaintenance() { return []; },
  async getLoans() { return []; },
  async getLocations() { return fetchTableData("asset_locations"); },

  async getMaintenanceForecast() { return { avgMonthlyCost: 0, sixMonthTotal: 0, forecastData: [] }; },

  // ---------------------------------------------------------------------------
  // getPegawai — with robust column detection
  // ---------------------------------------------------------------------------
  async getPegawai(options: { allowDeferredPhotos?: boolean } = {}) {
    try {
      const [rawPegawai, vehicles, equipment, settings] = await Promise.all([
        fetchTableData("pegawai", options),
        this.getVehicles(),
        this.getEquipment(),
        this.getSystemSettings(),
      ]);

      if (rawPegawai.length === 0) {
        return [];
      }

      const vehiclesByEmployeeNip = buildNipLookup(vehicles);
      const equipmentByEmployeeNip = buildNipLookup(equipment);
      const vehiclesByName = buildNameLookup(vehicles);
      const equipmentByName = buildNameLookup(equipment);

      const mapped = rawPegawai.map((item: any) => {
        // ── ROBUST: coba beberapa varian nama kolom ──
        const nama = String(
          item.nama_pegawai ||   // "NAMA PEGAWAI" → normalizeKey
          item.nama ||           // fallback: "NAMA"
          item.nama_lengkap ||   // fallback: "NAMA LENGKAP"
          ""
        ).trim();

        if (!nama) return null; // skip baris kosong

        // Soft delete: lewati baris yang dinonaktifkan (is_active=FALSE).
        const aktifRaw = String(item.is_active ?? "").trim().toUpperCase();
        if (aktifRaw === "FALSE" || aktifRaw === "0" || aktifRaw === "TIDAK") return null;

        // Pertahanan terhadap data uji yang sengaja ditandai.
        if (String(item.keterangan || "").trim().toUpperCase() === "DATA DUMMY") return null;

        const nip = String(
          item.nip ||
          item.nomer_induk_pegawai ||
          ""
        ).trim();

        const vMatch = matchAssetsByNip(nip, vehiclesByEmployeeNip);
        const eMatch = matchAssetsByNip(nip, equipmentByEmployeeNip);

        // Fallback pencocokan nama eksak untuk aset tanpa NIP
        const ek = exactKey(nama);
        const vFallback = vMatch.items.length === 0 && vehiclesByName.has(ek) ? vehiclesByName.get(ek)! : [];
        const eFallback = eMatch.items.length === 0 && equipmentByName.has(ek) ? equipmentByName.get(ek)! : [];

        const vItems = [...vMatch.items, ...vFallback];
        const eItems = [...eMatch.items, ...eFallback];
        const allAssets = [...vItems, ...eItems];
        const bestQ = (vMatch.items.length > 0 || eMatch.items.length > 0 || vFallback.length > 0 || eFallback.length > 0)
          ? "exact" as const
          : "none" as const;

        let unit_kerja = "";
        if (vMatch.items.length > 0)
          unit_kerja = String(vMatch.items[0].unit_kerja || "").replace("-", "").trim();
        if (!unit_kerja)
          unit_kerja = extractUnitKerja(String(item.jabatan || ""));

        const tglMulaiGolongan = String(item.terhitung_mulai_tanggal_golongan || item.tgl_mulai_golongan || "").trim();
        const tglLahir = String(item.tanggal_lahir || item.tgl_lahir || "").trim();
        const fotoStoragePath = String(item.foto_storage_path || "").trim();
        const foto = fotoStoragePath 
          ? supabase.storage.from(PHOTO_BUCKET).getPublicUrl(fotoStoragePath).data.publicUrl
          : convertGDriveUrl(String(item.foto || "").trim());
        
        const jabatanRaw = String(item.jabatan || "").trim();
        const golonganRaw = String(item.golongan || "").trim();
        const statusSource = String(item.status || "").trim().toUpperCase();
        const statusRaw = statusSource.startsWith("PPPK") ? "PPPK" : (["PNS", "CPNS"].includes(statusSource) ? "ASN" : statusSource);
        const kategoriPppkRaw = String(item.kategori_pppk || item.pppk_category || "").trim().toLowerCase();
        const kategori_pppk = kategoriPppkRaw.includes('paruh') || kategoriPppkRaw.includes('part') || statusSource.includes('PARUH')
          ? 'paruh_waktu' as const
          : statusRaw === 'PPPK' || kategoriPppkRaw.includes('penuh') || kategoriPppkRaw.includes('full') || statusSource.includes('PENUH')
            ? 'penuh_waktu' as const
            : '' as const;
        const isIncomplete = !nip || !jabatanRaw || !golonganRaw || !statusRaw;

        return {
          nip,
          nama,
          jabatan: jabatanRaw,
          unit_kerja,
          golongan: golonganRaw,
          status: statusRaw,
          kategori_pppk,
          tgl_lahir: tglLahir,
          tgl_mulai_golongan: tglMulaiGolongan,
          tgl_mulai_jabatan: String(item.terhitung_mulai_tanggal_jabatan || item.tgl_mulai_jabatan || "").trim(),
          tgl_kgb: nextCycleDate(tglMulaiGolongan, settings.kgbCycle),
          tgl_pangkat: nextCycleDate(tglMulaiGolongan, settings.pangkatCycle),
          tgl_pensiun: pensionDate(tglLahir, settings.bup),
          kgb_cycle_years: settings.kgbCycle,
          pangkat_cycle_years: settings.pangkatCycle,
          bup_usia: settings.bup,
          masa_kerja_tahun: parseInt(String(item.masa_kerja_tahun || "0")) || 0,
          masa_kerja_bulan: parseInt(String(item.masa_kerja_bulan || "0")) || 0,
          tingkat: String(item.tingkat || "").trim(),
          pendidikan_jurusan: String(item.pendidikan_jurusan || "").trim(),
          universitas: String(item.universitas || "").trim(),
          tahun_lulus: String(item.tahun_lulus || "").trim(),
          riwayat_diklat: String(item.riwayat_diklat || "").trim(),
          tahun_diklat: String(item.tahun_diklat || "").trim(),
          usia: String(item.usia || "").trim(),
          kontak: normalizeIndonesianPhoneNumber(item.kontak),
          email: String(item.email || "").trim(),
          keterangan: String(item.keterangan || "").trim(),
          catatan_mutasi_masuk: String(item.catatan_mutasi_masuk || "").trim(),
          catatan_mutasi_keluar: String(item.catatan_mutasi_keluar || "").trim(),
          foto,
          foto_storage_path: String(item.foto_storage_path || "").trim(),
          foto_provider: String(item.foto_provider || (item.foto_storage_path ? "supabase" : (item.foto ? "drive" : ""))).trim(),
          foto_migration_status: String(item.foto_migration_status || "").trim(),
          foto_migrated_at: String(item.foto_migrated_at || "").trim(),
          assets: allAssets,
          assets_kendaraan: vMatch.items,
          assets_alat_mesin: eMatch.items,
          assets_inventaris: [],
          match_quality: bestQ,
          is_incomplete: isIncomplete,
          is_active: true,
        };
      }).filter(Boolean) as any[];

      // Satu-satunya sumber status "Perlu Verifikasi" adalah pemindaian yang
      // juga dipakai menu Data Cleansing. Ini mencegah badge mengarah ke daftar
      // kosong akibat dua algoritme pencocokan yang berbeda.
      const unifiedAssets = buildUnifiedAssets(vehicles, equipment);
      const reviewNips = buildFuzzyNipSet(mapped, unifiedAssets);
      return mapped.map((pegawai: any) => {
        const nip = String(pegawai.nip || "").trim();
        if (reviewNips.has(nip)) return { ...pegawai, match_quality: "fuzzy" as const };
        if (pegawai.match_quality !== "fuzzy") return pegawai;

        // Pencocokan singkat yang ambigu tidak boleh dianggap sebagai relasi
        // sah dan tidak boleh menempelkan aset ke pegawai yang salah.
        return {
          ...pegawai,
          assets: [],
          assets_kendaraan: [],
          assets_alat_mesin: [],
          match_quality: "none" as const,
        };
      });

    } catch (error: any) {
      // Propagate error — biarkan halaman Pegawai/Dashboard tampilkan pesan
      console.error("[SIMOSDA] ❌ getPegawai error:", error?.message);
      throw error;
    }
  },

  // ---------------------------------------------------------------------------
  // getDashboardMetrics — robust: isolasi error pegawai dari error aset
  // ---------------------------------------------------------------------------
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    // Jalankan semua fetch paralel; isolasi error per grup
    const [
      pegawaiResult,
      vehiclesResult,
      equipmentResult
    ] = await Promise.allSettled([
      this.getPegawai({ allowDeferredPhotos: true }),
      this.getVehicles(),
      this.getEquipment(),
    ]);
    const inventoryResult = { status: "fulfilled", value: [] } as PromiseSettledResult<any[]>;
    const forecastResult = { status: "fulfilled", value: { avgMonthlyCost: 0, sixMonthTotal: 0, forecastData: [] } } as PromiseSettledResult<any>;

    // Ambil nilai; jika gagal, log warning dan gunakan array/default kosong
    const safeArray = (r: PromiseSettledResult<any[]>) => r.status === "fulfilled" ? r.value : [];
    const safeForecast = (r: PromiseSettledResult<any>) =>
      r.status === "fulfilled" ? r.value : { avgMonthlyCost: 0, sixMonthTotal: 0, forecastData: [] };

    // Jika getPegawai gagal, lempar error agar Dashboard menampilkan pesan setup
    if (pegawaiResult.status === "rejected") {
      throw pegawaiResult.reason;
    }

    const pegawai = pegawaiResult.value;
    const vehicles = safeArray(vehiclesResult);
    const equipment = safeArray(equipmentResult);
    const inventory = safeArray(inventoryResult);
    const forecast = safeForecast(forecastResult);

    const currentYear = new Date().getFullYear();
    const trendYears = Array.from({ length: 5 }, (_, i) => String(currentYear - 4 + i));
    const trendsMap: Record<string, any> = {};
    trendYears.forEach((y) => { trendsMap[y] = { name: y, Vehicles: 0, Equipment: 0, Inventory: 0 }; });
    const addTrend = (items: any[], type: "Vehicles" | "Equipment" | "Inventory") =>
      items.forEach((item) => { const y = String(item.purchase_year || item.tahun || "").substring(0, 4); if (trendsMap[y]) trendsMap[y][type]++; });
    addTrend(vehicles, "Vehicles");
    addTrend(equipment, "Equipment");
    addTrend(inventory, "Inventory");

    const pegawaiASN = pegawai.filter((p: any) => p.status === "ASN").length;
    const pegawaiPPPK = pegawai.filter((p: any) => String(p.status || '').startsWith("PPPK")).length;
    const pegawaiPPPKParuhWaktu = pegawai.filter((p: any) => String(p.status || '').startsWith("PPPK") && p.kategori_pppk === 'paruh_waktu').length;
    const pegawaiPPPKPenuhWaktu = pegawaiPPPK - pegawaiPPPKParuhWaktu;

    // ---------------------------------------------------------------------------
    // Hitung agenda kepegawaian via buildPenjagaanEvents (SAMA dengan Buku
    // Penjagaan, agar tidak ada divergensi hasil):
    //   - peringatan{KGB,Pangkat,Pensiun} = HANYA akan datang, ≤ 12 bulan
    //     (TIDAK termasuk yang sudah terlambat — itu dihitung terpisah)
    //   - peringatanTerlambat = total terlambat dari SEMUA kategori sekaligus
    // ---------------------------------------------------------------------------
    // ---------------------------------------------------------------------------
    // Kelengkapan Data (Core Value) — 9 kriteria via @/lib/kelengkapan (sumber
    // tunggal, sama dengan kolom "Kelengkapan" di halaman Data ASN/PPPK).
    // Kriteria ke-9 (relasi nama aset bersih) memerlukan pemindaian Levenshtein
    // terhadap holder_name; data aset sudah tersedia di scope ini.
    // ---------------------------------------------------------------------------
    const unifiedAssets = buildUnifiedAssets(vehicles, equipment);
    const fuzzyNipSet = buildFuzzyNipSet(pegawai as any[], unifiedAssets);
    const kelengkapan = rekapKelengkapan(pegawai as any[], fuzzyNipSet);
    const pegawaiDenganInventaris = pegawai.filter((p: any) => Array.isArray(p.assets) && p.assets.length > 0).length;

    const eventsAll = buildPenjagaanEvents(pegawai);
    const isUpcomingLe12 = (e: any) => !e.isOverdue && e.selisihHari <= 365;
    const peringatanKGB        = eventsAll.filter((e: any) => e.kategori === "KGB"     && isUpcomingLe12(e)).length;
    const peringatanPangkat    = eventsAll.filter((e: any) => e.kategori === "PANGKAT" && isUpcomingLe12(e)).length;
    const peringatanPensiun    = eventsAll.filter((e: any) => e.kategori === "BUP"     && isUpcomingLe12(e)).length;
    const peringatanTerlambat  = eventsAll.filter((e: any) => e.isOverdue).length;

    return {
      totalPegawai: pegawai.length,
      pegawaiAktif: pegawai.length,
      pegawaiPensiun: 0,
      pegawaiASN,
      pegawaiPPPK,
      pegawaiPPPKPenuhWaktu,
      pegawaiPPPKParuhWaktu,
      peringatanKGB,
      peringatanPangkat,
      peringatanPensiun,
      peringatanTerlambat,
      kelengkapanLengkap: kelengkapan.lengkap,
      kelengkapanBelum: kelengkapan.belum,
      kelengkapanRata: kelengkapan.rataRata,
      kelengkapanFieldKosong: kelengkapan.fieldKosong,
      pegawaiDenganInventaris,
      pegawaiTanpaInventaris: Math.max(0, pegawai.length - pegawaiDenganInventaris),
      distribusiGolongan: buildGolonganDistribusi(pegawai),
      distribusiPendidikan: buildPendidikanDistribusi(pegawai),
      distribusiMasaKerja: buildMasaKerjaDistribusi(pegawai),
      totalKendaraan: vehicles.length,
      totalAlatMesin: equipment.length,
      totalInventaris: inventory.length,
      totalAset: vehicles.length + equipment.length + inventory.length,
      totalPeminjaman: 0,
      totalPemeliharaan: 0,
      totalPagu: 0,
      totalRealisasi: 0,
      persenRealisasi: 0,
      lastUpdated: this.getLastUpdated(),
      assetTrends: trendYears.map((y) => trendsMap[y]),
      maintenanceForecast: forecast,
    };
  },

  // ---------------------------------------------------------------------------
  // getNotificationFeed — Client-side generated feed
  // ---------------------------------------------------------------------------
  async getNotificationFeed(): Promise<any> {
    const pegawai = await this.getPegawai();
    const eventsAll = buildPenjagaanEvents(pegawai);
    
    // Batasi notifikasi ke 6 bulan mendatang (180 hari)
    const isUpcomingLe6 = (e: any) => !e.isOverdue && e.selisihHari <= 180;
    // Batasi notifikasi terlewat maksimal 60 hari yang lalu
    const isRecentOverdue = (e: any) => e.isOverdue && e.selisihHari >= -60;
    
    const mapEvent = (e: any) => ({
      nip: e.nip, nama: e.nama, jabatan: e.jabatan,
      kategori: e.kategori, kategoriLabel: e.kategoriLabel,
      tanggal: e.tanggal, selisihHari: e.selisihHari
    });

    const overdue = eventsAll.filter(isRecentOverdue).map(mapEvent);
    const kgb = eventsAll.filter((e: any) => e.kategori === "KGB" && isUpcomingLe6(e)).map(mapEvent);
    const pangkat = eventsAll.filter((e: any) => e.kategori === "PANGKAT" && isUpcomingLe6(e)).map(mapEvent);
    const bup = eventsAll.filter((e: any) => e.kategori === "BUP" && isUpcomingLe6(e)).map(mapEvent);

    const birthdays: Array<{ nip: string; nama: string; jabatan: string; tanggal: string; daysUntil: number }> = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const p of pegawai) {
      if (!p.tgl_lahir) continue;
      const parsedBirthDate = parseAnyDate(p.tgl_lahir);
      if (!parsedBirthDate) continue;
      
      const bMonth = parsedBirthDate.getMonth();
      const bDate = parsedBirthDate.getDate();
      
      let bThisYear = new Date(today.getFullYear(), bMonth, bDate);
      if (bThisYear < today) {
        bThisYear = new Date(today.getFullYear() + 1, bMonth, bDate);
      }
      
      const diffTime = bThisYear.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 7) {
        birthdays.push({
          nip: String(p.nip || ""),
          nama: String(p.nama || ""),
          jabatan: String(p.jabatan || ""),
          tanggal: String(p.tgl_lahir || ""),
          daysUntil: diffDays
        });
      }
    }
    birthdays.sort((a, b) => a.daysUntil - b.daysUntil);

    return {
      ok: true,
      generated_at: new Date().toISOString(),
      birthdays,
      overdue,
      kgb,
      pangkat,
      bup
    };
  },
};
