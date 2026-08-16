import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  ScanSearch, RefreshCw, CheckCircle2, AlertTriangle,
  ShieldAlert, Info, ChevronDown, ChevronUp, Zap, Check,
  UserCheck2, ExternalLink, Wrench, X, FilterX,
 Edit2, Search, Trash2,
} from "lucide-react";
import { dataService } from "@/services/dataService";
import { apiService } from "@/services/apiService";
import { AuthContext } from "@/components/layout/AppShell";
import { LoadingState } from "@/components/ui/LoadingState";
import { Card, CardContent } from "@/components/ui/Card";
import { ConfirmModal, CONFIRM_CLOSED, type ConfirmState } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { can } from "@/lib/rbac";
import {
  scanPegawai, buildCorrectionPayload, issueKey,
  ISSUE_META, LEVEL_META,
  scanAssetEmployeeLinks, type AssetNameIssue,
  type CleansingIssue, type IssueCode, type IssueLevel,
} from "@/lib/cleansing";
import { buildUnifiedAssets } from "@/lib/kelengkapan";
import type { Pegawai } from "@/types";
import { scanMissingAssetConditions, type MissingAssetConditionIssue } from "@/lib/assetCondition";
import { EmployeeAutocomplete } from "@/components/ui/EmployeeAutocomplete";
import { AssetDetailModal } from "@/components/ui/AssetDetailModal";
import { VehicleFormModal } from "@/components/ui/VehicleFormModal";
import { EquipmentFormModal } from "@/components/ui/EquipmentFormModal";
import { PegawaiFormModal } from "@/components/ui/PegawaiFormModal";

// ---------------------------------------------------------------------------
// Halaman Cleansing (Tahap 6)
// ---------------------------------------------------------------------------

// Urutan level untuk sorting isu
const LEVEL_ORDER: IssueLevel[] = ["kritis", "tinggi", "sedang", "info"];

// Tab filter
type FilterTab = "semua" | IssueCode;

const TABS: Array<{ id: FilterTab; label: string; short: string }> = [
  { id: "semua",              label: "Semua Masalah",      short: "Semua"    },
  { id: "NIP_KOSONG",         label: "NIP Kosong",         short: "NIP ⬚"   },
  { id: "NIP_BUKAN_18_DIGIT", label: "NIP Tidak 18 Digit", short: "NIP ≠18" },
  { id: "NIP_DUPLIKAT",       label: "NIP Duplikat",       short: "Duplikat" },
  { id: "FIELD_WAJIB_KOSONG", label: "Field Wajib Kosong", short: "Kosong"   },
  { id: "STATUS_TIDAK_VALID", label: "Status",             short: "Status"   },
  { id: "TANGGAL_TIDAK_STANDAR",label:"Format Tanggal",    short: "Tanggal"  },
  { id: "NAMA_SPASI_GANDA",   label: "Spasi Nama",         short: "Spasi"    },
  { id: "MATCH_ASET_NONE",    label: "Match Aset",         short: "Aset"     },
];

export default function Cleansing() {
  const { user } = useContext(AuthContext);
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const targetNip = String(searchParams.get("nip") || "").trim();

  const [pegawaiList, setPegawaiList]   = useState<Pegawai[]>([]);
  const [loading, setLoading]           = useState(true);
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const [activeTab, setActiveTab]       = useState<FilterTab>("semua");
  const [applied, setApplied]           = useState<Set<string>>(new Set());
  const [applyingKey, setApplyingKey]   = useState<string | null>(null);
  const [isApplyingAll, setIsApplyingAll] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(CONFIRM_CLOSED);
  const [expandedNip, setExpandedNip]   = useState<string | null>(null);

  const [filterAssetYear, setFilterAssetYear] = useState<string>("semua");
  const [rawVehicles, setRawVehicles] = useState<any[]>([]);
  const [rawEquipment, setRawEquipment] = useState<any[]>([]);
  const [viewingAsset, setViewingAsset] = useState<any | null>(null);

  // Search states for tables
  const [conditionSearch, setConditionSearch] = useState("");
  const [pegawaiSearch, setPegawaiSearch] = useState("");
  const [assetSearch, setAssetSearch] = useState("");

  // Kecocokan nama pegawai ↔ aset (Tahap 6 — fuzzy matching, validasi manual)
  const [assetIssues, setAssetIssues]       = useState<AssetNameIssue[]>([]);
  const [assetApplied, setAssetApplied]     = useState<Set<string>>(new Set());
  const [applyingAssetKey, setApplyingAssetKey] = useState<string | null>(null);
  const [assetScanLoading, setAssetScanLoading] = useState(true);
  const [conditionIssues, setConditionIssues] = useState<MissingAssetConditionIssue[]>([]);
  const [assetSelections, setAssetSelections] = useState<Record<string, Pegawai | undefined>>({});
  const [assetQueries, setAssetQueries] = useState<Record<string, string>>({});

  // Modal Update Kondisi diganti dengan Modal Form Utama
  const [editingVehicle, setEditingVehicle] = useState<any>(null);
  const [editingEquipment, setEditingEquipment] = useState<any>(null);
  const [editingPegawai, setEditingPegawai] = useState<Pegawai | null>(null);

  const handleEditAsset = (issue: MissingAssetConditionIssue) => {
    if (issue.kind === "vehicle") {
      const asset = rawVehicles.find(v => String(v.asset_id) === issue.assetId);
      if (asset) setEditingVehicle(asset);
    } else {
      const asset = rawEquipment.find(v => String(v.asset_id) === issue.assetId);
      if (asset) setEditingEquipment(asset);
    }
  };

  const handleEditAssetByNameIssue = (issue: AssetNameIssue) => {
    if (issue.sheet === "assets_vehicle") {
      const asset = rawVehicles.find(v => String(v.asset_id) === issue.assetId);
      if (asset) setEditingVehicle(asset);
    } else if (issue.sheet === "assets_equipment") {
      const asset = rawEquipment.find(v => String(v.asset_id) === issue.assetId);
      if (asset) setEditingEquipment(asset);
    }
  };

  const handleSaveAssetSuccess = async () => {
    await load(true);
    setEditingVehicle(null);
    setEditingEquipment(null);
  };

  const handleSavePegawaiSuccess = async () => {
    await load(true);
    setEditingPegawai(null);
  };

  // Peta NIP → Pegawai (untuk buildCorrectionPayload)
  const pegawaiByNip = useMemo(() => {
    const m = new Map<string, Pegawai>();
    for (const p of pegawaiList) {
      const k = String(p.nip ?? "").trim();
      if (k) m.set(k, p);
    }
    return m;
  }, [pegawaiList]);

  const resetFilters = () => {
    setFilterAssetYear("semua");
    setConditionSearch("");
    setPegawaiSearch("");
    setAssetSearch("");
  };

  async function load(force = false) {
    if (force) dataService.clearCache();
    setLoading(true);
    setAssetScanLoading(true);
    setErrorMsg(null);
    setApplied(new Set());     // reset applied saat scan ulang
    setAssetApplied(new Set());
    try {
      const result = await dataService.getPegawai();
      setPegawaiList(result as Pegawai[]);

      // Pindai kecocokan nama pegawai pada modul aktif V1.
      const [vehicles, equipment] = await Promise.all([
        dataService.getVehicles(),
        dataService.getEquipment(),
      ]);
      setRawVehicles(vehicles as any[]);
      setRawEquipment(equipment as any[]);
      // Bentuk baku baris aset — builder BERSAMA dengan halaman Pegawai &
      // getDashboardMetrics (@/lib/kelengkapan), satu definisi tanpa duplikasi.
      const unifiedAssets = buildUnifiedAssets(vehicles, equipment);

      const employeeRows = result as Pegawai[];
      const linkIssues = scanAssetEmployeeLinks(employeeRows, unifiedAssets);
      setAssetIssues(linkIssues);
      const initialSelections: Record<string, Pegawai | undefined> = {};
      const initialQueries: Record<string, string> = {};
      for (const issue of linkIssues) {
        const suggestion = employeeRows.find((employee) => String(employee.nip || "") === String(issue.matchedNip || ""));
        initialSelections[issue.id] = suggestion;
        initialQueries[issue.id] = suggestion?.nama || "";
      }
      setAssetSelections(initialSelections);
      setAssetQueries(initialQueries);
      setConditionIssues(scanMissingAssetConditions(vehicles, equipment));
    } catch (err: any) {
      setErrorMsg(err?.message || "Gagal memuat data pegawai.");
    } finally {
      setLoading(false);
      setAssetScanLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!targetNip || loading || assetScanLoading) return;
    const timer = window.setTimeout(() => {
      document.getElementById("asset-verification-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [assetScanLoading, loading, targetNip]);

  // Semua isu aktif (yang belum di-apply)
  const allIssues: CleansingIssue[] = useMemo(() => {
    if (pegawaiList.length === 0) return [];
    return scanPegawai(pegawaiList)
      .filter((i) => !applied.has(issueKey(i)))
      .sort((a, b) =>
        LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level)
      );
  }, [pegawaiList, applied]);

  // Isu yang ditampilkan per tab
  const visibleIssues = useMemo(() => {
    let base = activeTab === "semua" ? allIssues : allIssues.filter((i) => i.kode === activeTab);
    if (pegawaiSearch) {
       const q = pegawaiSearch.toLowerCase();
       base = base.filter(i => (i.nama || "").toLowerCase().includes(q) || (i.nip || "").toLowerCase().includes(q));
    }
    return base;
  }, [allIssues, activeTab, pegawaiSearch]);

  // Hitung statistik
  const stats = useMemo(() => {
    const auto   = allIssues.filter((i) => i.bisaAutoKoreksi).length;
    const manual = allIssues.filter((i) => !i.bisaAutoKoreksi && i.level !== "info").length;
    const info   = allIssues.filter((i) => i.level === "info").length;
    return { total: allIssues.length, auto, manual, info };
  }, [allIssues]);

  // Hitung per tab (untuk badge angka)
  const countByTab = useMemo(() => {
    const c: Record<string, number> = { semua: allIssues.length };
    for (const i of allIssues) c[i.kode] = (c[i.kode] ?? 0) + 1;
    return c;
  }, [allIssues]);

  // --- Apply satu isu ---
  async function applyOne(issue: CleansingIssue) {
    if (!can(user?.role, "pegawai.edit.any")) {
      toast.error("Akses Ditolak", "Hanya admin/pimpinan yang dapat menerapkan koreksi.");
      return;
    }
    const p = pegawaiByNip.get(issue.nip);
    if (!p) { toast.error("Data Tidak Ditemukan", "Pegawai tidak ditemukan di data lokal."); return; }
    const payload = buildCorrectionPayload(p, issue);
    if (!payload) return;
    const key = issueKey(issue);
    setApplyingKey(key);
    try {
      await apiService.savePegawai(payload as any, false);
      setApplied((prev) => new Set([...prev, key]));
      toast.success("Koreksi Diterapkan", `${issue.fieldLabel} untuk ${issue.nama} berhasil diperbaiki.`);
    } catch (err: any) {
      toast.error("Gagal", err?.message || "Gagal menerapkan koreksi.");
    } finally {
      setApplyingKey(null);
    }
  }

  // --- Terapkan satu koreksi nama aset (SELALU individual, tidak ada bulk) ---
  const visibleAssetIssues = useMemo(
    () => assetIssues.filter((a) => 
      !assetApplied.has(a.id) && 
      (!targetNip || String(a.matchedNip) === targetNip) &&
      (filterAssetYear === "semua" || String(a.tahun || "") === filterAssetYear) &&
      (!assetSearch || a.assetLabel.toLowerCase().includes(assetSearch.toLowerCase()) || a.currentHolder.toLowerCase().includes(assetSearch.toLowerCase()))
    ),
    [assetIssues, assetApplied, targetNip, filterAssetYear, assetSearch]
  );

  const assetYears = useMemo(() => {
    const years = new Set(assetIssues.map(a => String(a.tahun || "")).filter(t => t && t !== "-" && t.trim() !== ""));
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [assetIssues]);

  const filteredConditionIssues = useMemo(() => {
    let issues = conditionIssues;
    if (filterAssetYear !== "semua") {
      issues = issues.filter(i => String(i.tahun || "") === filterAssetYear);
    }
    if (!conditionSearch) return issues;
    const q = conditionSearch.toLowerCase();
    return issues.filter(i => i.assetLabel.toLowerCase().includes(q) || String(i.assetId).toLowerCase().includes(q) || (i.holderName || "").toLowerCase().includes(q));
  }, [conditionIssues, conditionSearch, filterAssetYear]);

  function handleViewAsset(sheet: string, assetId: string) {
    let asset = null;
    if (sheet === "assets_vehicle") asset = rawVehicles.find(v => String(v.asset_id) === assetId);
    else if (sheet === "assets_equipment") asset = rawEquipment.find(eq => String(eq.asset_id) === assetId);
    if (asset) setViewingAsset(asset);
  }

  // --- Terapkan satu koreksi nama aset (SELALU individual, tidak ada bulk) ---
  async function applyAssetFix(issue: AssetNameIssue) {
    if (!can(user?.role, "pegawai.edit.any")) {
      toast.error("Akses Ditolak", "Hanya admin/pimpinan yang dapat menerapkan koreksi.");
      return;
    }
    const selectedEmployee = assetSelections[issue.id];
    if (!selectedEmployee?.nip) {
      toast.warning("Pilih Pegawai", "Cari lalu pilih nama pegawai dari Data ASN / PPPK terlebih dahulu.");
      return;
    }
    setApplyingAssetKey(issue.id);
    try {
      await apiService.linkAssetEmployee(issue.sheet, issue.assetId, selectedEmployee.nip);
      setAssetApplied((prev) => new Set([...prev, issue.id]));
      dataService.clearCache();
      toast.success(
        "Nama Pengguna Aset Diperbarui",
        `"${issue.currentHolder}" → "${selectedEmployee.nama}" (NIP ${selectedEmployee.nip}) pada ${issue.sheetLabel}.`
      );
    } catch (err: any) {
      toast.error("Gagal", err?.message || "Gagal memperbarui nama pengguna aset.");
    } finally {
      setApplyingAssetKey(null);
    }
  }

  // --- Apply semua auto-koreksi (satu per satu, jeda 500ms) ---
  async function doApplyAll() {
    if (!can(user?.role, "pegawai.edit.any")) {
      toast.error("Akses Ditolak", "Hanya admin/pimpinan yang dapat menerapkan koreksi.");
      return;
    }
    const autoItems = allIssues.filter((i) => i.bisaAutoKoreksi);
    if (autoItems.length === 0) return;
    setIsApplyingAll(true);
    let berhasil = 0;
    let gagal = 0;
    for (const issue of autoItems) {
      const p = pegawaiByNip.get(issue.nip);
      if (!p) { gagal++; continue; }
      const payload = buildCorrectionPayload(p, issue);
      if (!payload) { gagal++; continue; }
      try {
        await apiService.savePegawai(payload as any, false);
        setApplied((prev) => new Set([...prev, issueKey(issue)]));
        berhasil++;
      } catch {
        gagal++;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    setIsApplyingAll(false);
    dataService.clearCache();
    if (berhasil > 0) {
      toast.success(
        "Selesai",
        `${berhasil} koreksi berhasil diterapkan${gagal > 0 ? `, ${gagal} gagal` : ""}.`
      );
    } else {
      toast.error("Semua Gagal", `${gagal} koreksi gagal diterapkan.`);
    }
  }

  const canEdit = can(user?.role, "pegawai.edit.any");
  const canEditAssets = can(user?.role, "asset.write");

  
  function executeDeleteAsset(table: "assets_vehicle" | "assets_equipment", assetId: string, assetLabel: string) {
    if (!canEditAssets) {
      toast.error("Akses Ditolak", "Anda tidak memiliki akses untuk menghapus aset.");
      return;
    }
    setConfirmState({
      open: true,
      title: "Hapus Aset Permanen",
      message: `Anda akan menghapus aset "${assetLabel}" (ID: ${assetId}) secara permanen.\n\nTindakan ini juga akan menghapus data di menu Kendaraan/Inventaris. Lanjutkan?`,
      confirmLabel: "Hapus Permanen",
      confirmClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        try {
          await apiService.deleteAsset(table, assetId);
          toast.success("Aset Dihapus", `Aset ${assetId} berhasil dihapus permanen.`);
          dataService.clearCache();
          load(true);
        } catch (err: any) {
          toast.error("Gagal Menghapus", err?.message || "Terjadi kesalahan sistem.");
        }
      }
    });
  }

  if (loading) return <LoadingState />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-6 space-y-6 min-h-screen bg-slate-50 dark:bg-slate-900/50 pb-24 font-sans"
    >
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <ScanSearch className="text-blue-600 w-6 h-6" /> Data Cleansing
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Sistem mendeteksi total <strong className="text-slate-800 dark:text-slate-200">{stats.total + conditionIssues.length + visibleAssetIssues.length} anomali</strong>: 
            <span className="text-orange-600 dark:text-orange-400 font-medium"> {conditionIssues.length} aset tanpa kondisi fisik</span>, 
            <span className="text-indigo-600 dark:text-indigo-400 font-medium"> {visibleAssetIssues.length} pengguna tidak sinkron</span>, dan 
            <span className="text-red-600 dark:text-red-400 font-medium"> {allIssues.length} inkonsistensi pegawai</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canEdit && stats.auto > 0 && (
            <button
              disabled={isApplyingAll}
              onClick={() =>
                setConfirmState({
                  open: true,
                  title: "Terapkan Semua Perbaikan Otomatis",
                  message: `Akan menerapkan ${stats.auto} koreksi otomatis pada data pegawai secara berurutan.\n\nProses ini tidak dapat diurungkan. Lanjutkan?`,
                  confirmLabel: "Ya, Terapkan Semua",
                  confirmClass: "bg-blue-600 hover:bg-blue-700",
                  onConfirm: doApplyAll,
                })
              }
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-60 transition-colors"
            >
              {isApplyingAll ? (
                <><RefreshCw size={14} className="animate-spin" /> Menerapkan...</>
              ) : (
                <><Zap size={14} className="text-yellow-300" /> Auto-Koreksi ({stats.auto})</>
              )}
            </button>
          )}
          <select
            value={filterAssetYear}
            onChange={e => setFilterAssetYear(e.target.value)}
            className="px-3 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="semua">Semua Tahun Aset</option>
            {assetYears.map(yr => <option key={yr} value={yr}>Tahun {yr}</option>)}
          </select>
          <button
            onClick={resetFilters}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            <FilterX size={14} /> Reset Filter
          </button>
          <button
            onClick={() => { dataService.clearCache(); load(true); }}
            disabled={loading || isApplyingAll}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Sinkronisasi Data
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle size={18} /> {errorMsg}
        </div>
      )}

      {/* KANBAN BOARD */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        
        {/* Kolom 1: Aset Tanpa Kondisi (Kritis) */}
        <div className="space-y-3 flex flex-col h-full max-h-[85vh]">
          <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm sticky top-0 z-10 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                Cek Fisik Aset
              </h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300">
                {filteredConditionIssues.length}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Cari aset..." 
                value={conditionSearch}
                onChange={e => setConditionSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          
          {filteredConditionIssues.length === 0 ? (
            <div className="p-6 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-center text-slate-400 text-sm bg-white dark:bg-slate-800">
              <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-500 opacity-50" />
              Bersih!
            </div>
          ) : (
            <div className="space-y-2.5 overflow-y-auto pr-1 pb-2 flex-1 scrollbar-thin">
              {filteredConditionIssues.map(issue => (
                <div key={issue.id} className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden flex flex-col">
                  <div className="absolute top-0 left-0 w-1 h-full bg-orange-400"></div>
                  <div className="flex justify-between items-start gap-2 mb-1.5 pl-1.5">
                    <span className="text-[10px] font-bold uppercase text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400 px-1.5 py-0.5 rounded">
                      {issue.kindLabel}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{issue.assetId}</span>
                  </div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm leading-snug mb-1 pl-1.5">{issue.assetLabel}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 pl-1.5 mb-3">Pengguna: {issue.holderName || "Belum diatur"}</p>
                  
                  <div className="mt-auto pl-1.5">
                    {canEdit ? (
                      <div className="flex gap-2">
                      <button onClick={() => handleEditAsset(issue)} className="flex-1 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5">
                        <Edit2 size={12} className="text-orange-500" /> Set Kondisi
                      </button>
                      <button onClick={() => executeDeleteAsset(issue.kind === 'vehicle' ? 'assets_vehicle' : 'assets_equipment', issue.assetId, issue.assetLabel)} title="Hapus Aset Permanen" className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic text-center">Butuh akses admin</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Kolom 2: Nama Pengguna Aset vs Data Kepegawaian (Tinggi) */}
        <div className="space-y-3 flex flex-col h-full max-h-[85vh]">
          <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm sticky top-0 z-10 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                Validasi Pengguna Aset
              </h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300">
                {visibleAssetIssues.length}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Cari nama aset / pengguna lama..." 
                value={assetSearch}
                onChange={e => setAssetSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {assetScanLoading ? (
            <div className="p-6 text-center text-slate-400 text-sm bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"><RefreshCw className="animate-spin mx-auto mb-2" size={20} /> Memindai...</div>
          ) : visibleAssetIssues.length === 0 ? (
            <div className="p-6 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-center text-slate-400 text-sm bg-white dark:bg-slate-800">
              <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-500 opacity-50" />
              Bersih!
            </div>
          ) : (
            <div className="space-y-2.5 overflow-y-auto pr-1 pb-2 flex-1 scrollbar-thin">
              {visibleAssetIssues.map(issue => {
                const confPct = Math.round(issue.similarity * 100);
                const selectedEmployee = assetSelections[issue.id];
                const isBusy = applyingAssetKey === issue.id;
                return (
                  <div key={issue.id} className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-400"></div>
                    <div className="pl-1.5 flex flex-col h-full">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase text-slate-500">{issue.sheetLabel}</span>
                        {issue.confidence !== "belum" && (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">{confPct}% AI Match</span>
                        )}
                      </div>
                      <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm leading-snug mb-2">{issue.assetLabel}</h4>
                      
                      <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg mb-3 border border-slate-100 dark:border-slate-800">
                        <p className="text-[9px] text-slate-500 font-bold uppercase mb-0.5">Riwayat Sebelumnya:</p>
                        <p className="text-xs font-semibold text-red-600 dark:text-red-400">{issue.currentHolder}</p>
                      </div>

                      <div className="mb-3 relative z-20 mt-auto">
                        <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">Hubungkan ke Resmi:</p>
                        <EmployeeAutocomplete
                          label=""
                          value={assetQueries[issue.id] || ""}
                          selectedNip={selectedEmployee?.nip || ""}
                          employees={pegawaiList}
                          onChange={(value) => {
                            setAssetQueries((previous) => ({ ...previous, [issue.id]: value }));
                            setAssetSelections((previous) => ({ ...previous, [issue.id]: undefined }));
                          }}
                          onSelect={(employee) => {
                            setAssetSelections((previous) => ({ ...previous, [issue.id]: employee || undefined }));
                            if (employee) setAssetQueries((previous) => ({ ...previous, [issue.id]: employee.nama }));
                          }}
                          placeholder="Ketik nama / NIP..."
                        />
                      </div>
                      
                      <div className="mt-1 flex gap-2">
                        {canEditAssets ? (
                          <>
                            <button disabled={isBusy || !selectedEmployee} onClick={() => applyAssetFix(issue)} className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 disabled:opacity-50">
                              {isBusy ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />} Simpan Relasi
                            </button>
                            <button onClick={() => handleEditAssetByNameIssue(issue)} title="Edit Data Aset Langsung" className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 rounded-lg transition-colors border border-slate-200 dark:border-slate-600">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => executeDeleteAsset(issue.sheet as 'assets_vehicle' | 'assets_equipment', issue.assetId, issue.assetLabel)} title="Hapus Aset Permanen" className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 rounded-lg transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : (
                          <div className="text-[10px] text-slate-400 italic text-center w-full">Butuh akses admin</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Kolom 3: Isu Kepegawaian (Campuran Kritis/Tinggi/Sedang) */}
        <div className="space-y-3 flex flex-col h-full max-h-[85vh]">
          <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm sticky top-0 z-10 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                Data Pegawai
              </h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">
                {visibleIssues.length}
              </span>
            </div>
            
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                  type="text" 
                  placeholder="Cari NIP / Nama..." 
                  value={pegawaiSearch}
                  onChange={e => setPegawaiSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <select
                value={activeTab}
                onChange={e => setActiveTab(e.target.value as FilterTab)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 dark:text-slate-200"
              >
                {TABS.map(tab => (
                  <option key={tab.id} value={tab.id}>{tab.label}</option>
                ))}
              </select>
            </div>
          </div>

          {visibleIssues.length === 0 ? (
            <div className="p-6 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-center text-slate-400 text-sm bg-white dark:bg-slate-800">
              <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-500 opacity-50" />
              Bersih!
            </div>
          ) : (
            <div className="space-y-2.5 overflow-y-auto pr-1 pb-2 flex-1 scrollbar-thin">
              {visibleIssues.slice(0, 50).map(issue => {
                const key = issueKey(issue);
                const isBusy = applyingKey === key || isApplyingAll;
                const lvl = LEVEL_META[issue.level];
                
                // Tentukan warna border berdasarkan level
                const barColor = issue.level === 'kritis' ? 'bg-red-500' : issue.level === 'tinggi' ? 'bg-orange-500' : 'bg-blue-500';

                return (
                  <div key={key} className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col">
                    <div className={`absolute top-0 left-0 w-1 h-full ${barColor}`}></div>
                    <div className="pl-1.5 flex flex-col h-full">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${lvl.badge}`}>
                          {lvl.label}
                        </span>
                        <span className="text-[9px] font-bold uppercase text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded truncate max-w-[120px]">{issue.fieldLabel}</span>
                      </div>
                      <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm leading-snug mb-0.5">{issue.nama || "Tanpa Nama"}</h4>
                      <p className="text-[10px] text-slate-400 font-mono mb-2">{issue.nip || "NIP Kosong"}</p>
                      
                      <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg mb-3 border border-slate-100 dark:border-slate-800">
                         <p className="text-[10px] text-slate-700 dark:text-slate-300 font-medium mb-1">{ISSUE_META[issue.kode].label}</p>
                         <p className="text-[10px] text-red-500 font-mono line-through mb-1 break-all">{issue.nilaiLama || "(Kosong)"}</p>
                         {issue.bisaAutoKoreksi && (
                           <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1 break-all"><Check size={10} className="shrink-0"/> {issue.saranPerbaikan}</p>
                         )}
                         {!issue.bisaAutoKoreksi && (
                           <p className="text-[10px] text-slate-500 italic mt-1">{issue.saranPerbaikan}</p>
                         )}
                      </div>
                      
                      <div className="mt-auto">
                        {canEdit ? (
                          issue.bisaAutoKoreksi ? (
                            <button disabled={isBusy} onClick={() => applyOne(issue)} className="w-full py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5">
                              {isBusy ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />} Auto Perbaiki
                            </button>
                          ) : (
                            <button onClick={() => {
                              const p = pegawaiByNip.get(issue.nip);
                              if (p) setEditingPegawai(p);
                            }} className="w-full py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5">
                              <Edit2 size={12} /> Buka Form Pegawai
                            </button>
                          )
                        ) : (
                          <div className="text-[10px] text-slate-400 italic text-center">Butuh akses admin</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {visibleIssues.length > 50 && (
                <div className="text-center text-xs text-slate-400 py-2">
                  + {visibleIssues.length - 50} isu lainnya...
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      <ConfirmModal state={confirmState} onClose={() => setConfirmState(CONFIRM_CLOSED)} />
      {viewingAsset && <AssetDetailModal asset={viewingAsset} isOpen={!!viewingAsset} onClose={() => setViewingAsset(null)} />}
      {editingVehicle && <VehicleFormModal isOpen={!!editingVehicle} onClose={() => setEditingVehicle(null)} initialData={editingVehicle || {}} employees={pegawaiList} onSaveSuccess={handleSaveAssetSuccess} />}
      {editingEquipment && <EquipmentFormModal isOpen={!!editingEquipment} onClose={() => setEditingEquipment(null)} initialData={editingEquipment || {}} employees={pegawaiList} onSaveSuccess={handleSaveAssetSuccess} />}
      {editingPegawai && <PegawaiFormModal isOpen={!!editingPegawai} onClose={() => setEditingPegawai(null)} initialData={editingPegawai} onSuccess={handleSavePegawaiSuccess} user={user} />}
    </motion.div>
  );
}
