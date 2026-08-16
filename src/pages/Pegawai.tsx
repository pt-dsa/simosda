import React, { useEffect, useState, useMemo, useContext } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { dataService } from "@/services/dataService";
import { apiService } from "@/services/apiService";
import { AuthContext } from "@/components/layout/AppShell";
import { can, canEditPegawaiRow } from "@/lib/rbac";
import { Pegawai } from "@/types";
import { Card, CardContent } from "@/components/ui/Card";
import {
  Search, Info, Briefcase, UserCircle, Calendar, AlertTriangle,
  Package, ZoomIn, ImageOff, Phone, GraduationCap, Clock,
  CheckCircle2, CircleDot, Car, Wrench, Archive, ChevronDown, RefreshCw, Plus, Edit2, X, Save, Trash2,
  Download,
} from "lucide-react";
import Papa from "papaparse";
import { motion, AnimatePresence } from "motion/react";
import { LoadingState } from "@/components/ui/LoadingState";
import { PegawaiFormModal } from "@/components/ui/PegawaiFormModal";
import { ConfirmModal, CONFIRM_CLOSED, type ConfirmState } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { formatDate, maskSensitiveData } from "@/lib/utils";
import {
  buildUnifiedAssets, buildFuzzyNipSet, hitungKelengkapan, type KelengkapanResult,
} from "@/lib/kelengkapan";
import {
  PegawaiDetailModal, PegawaiAvatar, MatchBadge, KGBStatus, PensiunStatus,
} from "@/components/ui/PegawaiDetailModal";
import { AssetDetailModal } from "@/components/ui/AssetDetailModal";
import { employmentStatusLabel, matchesEmploymentStatus } from "@/lib/employmentStatus";
import { whatsappChatUrl } from "@/lib/contact";

// ---------------------------------------------------------------------------
// Badge Kelengkapan Data (Core Value) — 9 kriteria via @/lib/kelengkapan.
// Di module scope (bukan di dalam render) sesuai aturan komponen helper.
// Tooltip (title) merinci kriteria yang belum terpenuhi.
// ---------------------------------------------------------------------------
function KelengkapanBadge({ hasil, size = "sm" }: { hasil: KelengkapanResult; size?: "sm" | "xs" }) {
  const cls =
    hasil.persen >= 100
      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border-green-200 dark:border-green-800/50"
      : hasil.persen >= 70
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/50"
        : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 border-red-200 dark:border-red-800/50";
  const title = hasil.lengkap
    ? "Semua 9 kriteria kelengkapan terpenuhi"
    : `Kurang (${hasil.missing.length}): ${hasil.missing.join(", ")}`;
  const Icon = hasil.lengkap ? CheckCircle2 : AlertTriangle;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border font-bold ${cls} ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-[9px]"
      }`}
    >
      <Icon size={size === "sm" ? 11 : 9} />
      {hasil.persen}%
    </span>
  );
}

function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fill="currentColor" d="M12 2a9.72 9.72 0 0 0-8.42 14.58L2 22l5.58-1.46A9.93 9.93 0 1 0 12 2Zm0 17.92a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.31.87.89-3.22-.2-.32A8.02 8.02 0 1 1 12 19.92Zm4.44-6.07c-.24-.12-1.44-.71-1.66-.79-.22-.08-.38-.12-.54.12-.16.24-.62.79-.76.95-.14.16-.28.18-.52.06-.24-.12-1.02-.37-1.94-1.2-.72-.64-1.2-1.43-1.34-1.67-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.39 1.37.5.58.18 1.1.16 1.51.1.46-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  );
}

function WhatsAppButton({ pegawai, compact = false }: { pegawai: Pegawai; compact?: boolean }) {
  const url = whatsappChatUrl(pegawai.kontak);
  return (
    <button
      type="button"
      disabled={!url}
      title={url ? `Hubungi ${pegawai.nama} via WhatsApp` : "Nomor WhatsApp belum tersedia atau belum valid"}
      aria-label={url ? `Hubungi ${pegawai.nama} via WhatsApp` : `WhatsApp ${pegawai.nama} tidak tersedia`}
      onClick={(event) => {
        event.stopPropagation();
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }}
      className={`${compact ? "p-1.5" : "p-2"} inline-flex items-center justify-center rounded-full border transition-colors ${
        url
          ? "border-green-200 bg-green-50 text-green-600 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
          : "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-600"
      }`}
    >
      <WhatsAppIcon size={compact ? 16 : 18} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function PegawaiPage() {
  const { user } = useContext(AuthContext);
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<Pegawai[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterGolongan, setFilterGolongan] = useState("all");
  const [filterBidang, setFilterBidang] = useState("all");
  const [filterMatch, setFilterMatch] = useState<"all" | "exact" | "fuzzy" | "none">("all");
  const [filterAssetPresence, setFilterAssetPresence] = useState<"all" | "with" | "none">("all");
  const [filterIncomplete, setFilterIncomplete] = useState(false);
  // PENGUATAN KEPEGAWAIAN: filter berdasar kelengkapan 9 kriteria (core value).
  const [filterKelengkapan, setFilterKelengkapan] = useState<"all" | "lengkap" | "belum">("all");
  const [filterKriteria, setFilterKriteria] = useState("all");
  const [filterPendidikan, setFilterPendidikan] = useState("all");
  const [filterMasaKerja, setFilterMasaKerja] = useState("all");
  const [selectedPegawai, setSelectedPegawai] = useState<Pegawai | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingPegawai, setEditingPegawai] = useState<Pegawai | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(CONFIRM_CLOSED);
  // NIP yang punya temuan fuzzy Levenshtein nama ↔ holder_name aset
  // (kriteria ke-9 kelengkapan: relasi nama aset harus bersih).
  const [fuzzyNipSet, setFuzzyNipSet] = useState<Set<string>>(new Set());
  const canVerifyAssetMatch = can(user?.role, "pegawai.edit.any");

  function openMatchVerification(pegawai: Pegawai) {
    if (!canVerifyAssetMatch) return;
    setSelectedPegawai(null);
    navigate(`/cleansing?nip=${encodeURIComponent(String(pegawai.nip || "").trim())}`);
  }

  function handleDelete(p: Pegawai) {
    setConfirmState({
      open: true,
      title: "Nonaktifkan Pegawai",
      message: (
        <>
          Nonaktifkan "<strong>{p.nama}</strong>" (NIP {p.nip})?
          <br /><br />
          Data tidak dihapus permanen dan tetap dapat ditelusuri oleh administrator.
        </>
      ),
      confirmLabel: "Nonaktifkan",
      confirmClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        try {
          await apiService.deletePegawai(String(p.nip));
          dataService.clearCache();
          setSelectedPegawai(null);
          await load(true);
          toast.success("Berhasil", `Pegawai "${p.nama}" berhasil dinonaktifkan.`);
        } catch (err: any) {
          toast.error("Gagal", err?.message || "Gagal menonaktifkan pegawai.");
        }
      },
    });
  }

  // Listener untuk AI Voice Command (Event: ai-action)
  useEffect(() => {
    const handleAIAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { action, target } = customEvent.detail || {};
      if (action === "FILL_FORM" && target === "employee_form") {
        setEditingPegawai(null);
        setIsFormModalOpen(true);
      }
    };
    window.addEventListener('ai-action', handleAIAction);
    return () => window.removeEventListener('ai-action', handleAIAction);
  }, []);

  function handleHardDelete(p: Pegawai) {
    setConfirmState({
      open: true,
      title: "Hapus Permanen Pegawai",
      message: (
        <>
          <strong>PERINGATAN !</strong> Hapus permanen "<strong>{p.nama}</strong>" (NIP {p.nip}) dari database?
          <br /><br />
          Semua data, foto, riwayat aset, dan kredensial login pegawai ini akan dihapus. Tindakan ini <strong>TIDAK DAPAT DIBATALKAN</strong>.
        </>
      ),
      confirmLabel: "Ya, Hapus Permanen",
      confirmClass: "bg-red-700 hover:bg-red-800",
      onConfirm: async () => {
        try {
          await apiService.deletePegawai(String(p.nip), { hard: true });
          dataService.clearCache();
          setSelectedPegawai(null);
          await load(true);
          toast.success("Berhasil", `Pegawai "${p.nama}" beserta seluruh jejak datanya telah dihapus permanen.`);
        } catch (err: any) {
          toast.error("Gagal", err?.message || "Gagal menghapus pegawai secara permanen.");
        }
      },
    });
  }

  async function load(force = false) {
    if (force) {
      setIsRefreshing(true);
      dataService.clearCache();
    } else {
      setLoading(true);
    }
    setErrorMsg(null);
    try {
      const result = await dataService.getPegawai();
      setData(result);
      setLastSync(dataService.getLastUpdated());

      // Pindai relasi fuzzy nama ↔ aset untuk kolom Kelengkapan (data aset
      // sudah ter-cache oleh getPegawai — panggilan ini murah). Kegagalan
      // pemindaian TIDAK memblokir halaman: set kosong = kriteria 9 lolos
      // berdasarkan match_quality saja.
      try {
        const [vehicles, equipment] = await Promise.all([
          dataService.getVehicles(),
          dataService.getEquipment(),
        ]);
        const unified = buildUnifiedAssets(vehicles, equipment);
        setFuzzyNipSet(buildFuzzyNipSet(result as Pegawai[], unified));
      } catch {
        setFuzzyNipSet(new Set());
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal memuat data pegawai.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link notifikasi membuka profil pegawai yang tepat, bukan hanya hasil pencarian.
  useEffect(() => {
    const nip = String(searchParams.get("profile") || "").trim();
    if (!nip || data.length === 0) return;
    const found = data.find((pegawai) => String(pegawai.nip || "").trim() === nip);
    if (found) setSelectedPegawai(found);
  }, [data, searchParams]);

  // Deep-link dari Dashboard (KPI ASN/PPPK → /pegawai?status=ASN) dan filter aset.
  useEffect(() => {
    const s = (searchParams.get("status") || "").toUpperCase();
    if (["ASN", "PPPK_PENUH_WAKTU", "PPPK_PARUH_WAKTU", "PENSIUN"].includes(s)) setFilterStatus(s);
    const m = (searchParams.get("match") || "").toLowerCase();
    if (m === "exact" || m === "fuzzy" || m === "none") setFilterMatch(m as any);
    const asset = (searchParams.get("aset") || "").toLowerCase();
    if (asset === "with" || asset === "none") setFilterAssetPresence(asset);
    // Deep-link KPI Kelengkapan Dashboard → /pegawai?kelengkapan=lengkap|belum
    const k = (searchParams.get("kelengkapan") || "").toLowerCase();
    if (k === "lengkap" || k === "belum") setFilterKelengkapan(k as any);
    const krit = searchParams.get("kriteria");
    if (krit) setFilterKriteria(krit);
    // Deep-link Golongan, Pendidikan, Masa Kerja dari Chart Dashboard
    const gol = searchParams.get("golongan");
    if (gol) setFilterGolongan(gol);
    const pend = searchParams.get("pendidikan");
    if (pend) setFilterPendidikan(pend);
    const mk = searchParams.get("masaKerja");
    if (mk) setFilterMasaKerja(mk);
  }, [searchParams]);

  // Golongan level options for filter
  const golonganLevels = useMemo(() => {
    const levels = new Set(data.map((p) => (p.golongan || "").split("/")[0]).filter(Boolean));
    return Array.from(levels).sort();
  }, [data]);
  const bidangOptions = useMemo(() => Array.from(new Set(data.map((p) => String(p.unit_kerja || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "id")), [data]);
  const pegawaiFieldOptions = useMemo(() => ({
    golongan: data.map((p) => p.golongan),
    jabatan: data.map((p) => p.jabatan),
    jurusan: data.map((p) => p.pendidikan_jurusan),
    institusi: data.map((p) => p.universitas),
  }), [data]);

  const filteredData = useMemo(() => {
    return data.filter((p) => {
      const search = String(searchTerm || "").toLocaleLowerCase("id-ID");
      const matchSearch =
        !search ||
        [p.nama, p.nip, p.unit_kerja, p.jabatan, p.golongan]
          .some((value) => String(value ?? "").toLocaleLowerCase("id-ID").includes(search));

      const matchStatus = matchesEmploymentStatus(p, filterStatus);
      const matchBidang = filterBidang === "all" || (filterBidang === "__empty__" ? !String(p.unit_kerja || "").trim() : p.unit_kerja === filterBidang);
      // PERBAIKAN QA: bandingkan LEVEL golongan secara EKSAK (mis. "III/d" → "III"),
      // bukan startsWith. "III/d".startsWith("II") === true sehingga filter "II"
      // keliru ikut menarik semua golongan III. Level diambil identik dgn opsi dropdown.
      const matchGolongan =
        filterGolongan === "all" ||
        (p.golongan || "").split("/")[0].trim() === filterGolongan;

      const matchMatch = filterMatch === "all" || p.match_quality === filterMatch;
      const assetCount = p.assets?.length || 0;
      const matchAssetPresence = filterAssetPresence === "all" || (filterAssetPresence === "with" ? assetCount > 0 : assetCount === 0);

      const matchIncomplete = filterIncomplete ? p.is_incomplete : true;

      // Filter kelengkapan 9 kriteria — memakai definisi bersama hitungKelengkapan
      // agar angka filter SELALU identik dengan banner & KPI Dashboard.
      const kRes = hitungKelengkapan(p, fuzzyNipSet);
      const matchKelengkapan =
        filterKelengkapan === "all" ||
        (filterKelengkapan === "lengkap") === kRes.lengkap;
      const matchKriteria = filterKriteria === "all" || kRes.missing.includes(filterKriteria);

      // Filter Pendidikan (mengikuti logika Dashboard: buildPendidikanDistribusi)
      let matchPendidikan = true;
      if (filterPendidikan !== "all") {
        const LABEL: Record<string, string> = {
          "STRATA II": "S-2", "STRATA I": "S-1",
          "DIPLOMA IV": "D-IV", "DIPLOMA III": "D-III",
          "SEKOLAH LANJUTAN TINGKAT ATAS": "SLTA",
        };
        const raw = String(p.tingkat || "").trim().toUpperCase();
        const pLabel = LABEL[raw] || (raw || "Lainnya");
        matchPendidikan = pLabel === filterPendidikan;
      }

      // Filter Masa Kerja (mengikuti logika Dashboard: buildMasaKerjaDistribusi)
      let matchMasaKerja = true;
      if (filterMasaKerja !== "all") {
        const y = Number(p.masa_kerja_tahun) || 0;
        let mk = "20+ Thn";
        if (y < 5) mk = "0–5 Thn";
        else if (y < 10) mk = "5–10 Thn";
        else if (y < 20) mk = "10–20 Thn";
        matchMasaKerja = mk === filterMasaKerja;
      }

      return matchSearch && matchStatus && matchBidang && matchGolongan && matchMatch && matchAssetPresence && matchIncomplete && matchKelengkapan && matchKriteria && matchPendidikan && matchMasaKerja;
    }).sort((a, b) => (a.nama || "").localeCompare(b.nama || ""));
  }, [data, searchTerm, filterStatus, filterBidang, filterGolongan, filterMatch, filterAssetPresence, filterIncomplete, filterKelengkapan, filterKriteria, filterPendidikan, filterMasaKerja, fuzzyNipSet]);

  // Ringkasan kelengkapan (untuk kartu kecil di banner): dihitung dari SEMUA
  // data (bukan hasil filter). hitungKelengkapan murah (9 cek string per
  // pegawai) sehingga aman dihitung langsung per baris saat render.
  const kelengkapanStats = useMemo(() => {
    let lengkap = 0;
    for (const p of data) if (hitungKelengkapan(p, fuzzyNipSet).lengkap) lengkap++;
    return { lengkap, belum: data.length - lengkap };
  }, [data, fuzzyNipSet]);

  // ---------------------------------------------------------------------------
  // PENGUATAN KEPEGAWAIAN: Ekspor CSV data pegawai + kolom kelengkapan.
  // - Mengikuti HASIL FILTER aktif (apa yang tampil = apa yang terekspor).
  // - NIP dibungkus ="..." agar Excel tidak merusak presisi 18 digit.
  // - Nama berkas standar: SIMOSDA_Pegawai_YYYYMMDD.csv (komponen tanggal LOKAL).
  // ---------------------------------------------------------------------------
  const handleExportCSV = () => {
    if (!can(user?.role, "data.export")) {
      toast.error("Akses Ditolak", "Role Pegawai tidak memiliki izin mengunduh CSV.");
      return;
    }
    if (filteredData.length === 0) {
      toast.warning("Ekspor Kosong", "Tidak ada data pegawai pada filter saat ini.");
      return;
    }
    const rows = filteredData.map((p) => {
      const k = hitungKelengkapan(p, fuzzyNipSet);
      return {
        "NAMA PEGAWAI": p.nama || "",
        "NIP": p.nip ? `="${p.nip}"` : "",
        "GOLONGAN": p.golongan || "",
        "JABATAN": p.jabatan || "",
        "BIDANG": p.unit_kerja || "",
        "STATUS": employmentStatusLabel(p),
        "TMT GOLONGAN": p.tgl_mulai_golongan || "",
        "TANGGAL LAHIR": p.tgl_lahir || "",
        "EMAIL": p.email || "",
        "KONTAK": p.kontak ? `="${p.kontak}"` : "",
        "JUMLAH ASET DIAMPU": p.assets?.length || 0,
        "KELENGKAPAN (%)": k.persen,
        "STATUS KELENGKAPAN": k.lengkap ? "LENGKAP" : "BELUM LENGKAP",
        "KRITERIA BELUM TERPENUHI": k.missing.join("; "),
      };
    });
    const csv = Papa.unparse(rows);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `SIMOSDA_Pegawai_${ymd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Ekspor Berhasil", `${rows.length} data pegawai diekspor (sesuai filter aktif).`);
  };

  // Match summary stats
  const matchStats = useMemo(() => {
    const withAssets = data.filter((p) => (p.assets?.length || 0) > 0).length;
    const exact = data.filter((p) => p.match_quality === "exact").length;
    const fuzzy = data.filter((p) => p.match_quality === "fuzzy").length;
    const none = data.filter((p) => p.match_quality === "none").length;
    return { withAssets, exact, fuzzy, none };
  }, [data]);

  if (loading) return <LoadingState />;

  if (errorMsg) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="bg-red-50 text-red-600 p-6 rounded-xl max-w-md text-center border border-red-200">
          <AlertTriangle size={40} className="mx-auto mb-3 opacity-50" />
          <h2 className="font-bold mb-2">Gagal Memuat Data Pegawai</h2>
          <p className="text-sm">{errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 min-h-0 pb-28 md:pb-0 md:h-full md:flex md:flex-col md:overflow-hidden touch-pan-y">

      {/* Page header */}
      <div className="md:shrink-0 flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Data ASN / PPPK</h1>
          <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mt-0.5">
            Kelola profil, jabatan, dan tanggungan aset · {data.length} pegawai
            {" · "}
            <button
              onClick={() => setFilterKelengkapan(filterKelengkapan === "lengkap" ? "all" : "lengkap")}
              className={`text-green-600 dark:text-green-400 font-semibold hover:underline ${filterKelengkapan === "lengkap" ? "underline" : ""}`}
              title="Klik untuk memfilter pegawai berdata lengkap"
            >
              {kelengkapanStats.lengkap} data lengkap
            </button>
            {kelengkapanStats.belum > 0 && (
              <>
                {" · "}
                <button
                  onClick={() => setFilterKelengkapan(filterKelengkapan === "belum" ? "all" : "belum")}
                  className={`text-amber-600 dark:text-amber-400 font-semibold hover:underline ${filterKelengkapan === "belum" ? "underline" : ""}`}
                  title="Klik untuk memfilter pegawai berdata belum lengkap"
                >
                  {kelengkapanStats.belum} belum lengkap
                </button>
              </>
            )}
          </p>
          {lastSync && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Terakhir sinkronisasi: {new Date(lastSync).toLocaleString("id-ID")}
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Cari NIP, Nama, Jabatan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-10 py-2 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Hapus kata kunci pencarian"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {can(user?.role, "data.export") && (
            <button
              onClick={handleExportCSV}
              className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shrink-0 shadow-sm"
              title="Ekspor data pegawai (sesuai filter) beserta kolom kelengkapan"
            >
              <Download size={14} />
              Ekspor CSV
            </button>
          )}
          <button
            onClick={() => load(true)}
            disabled={isRefreshing}
            className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 shadow-sm"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
            {isRefreshing ? "Menyinkronkan..." : "Sinkronisasi"}
          </button>
          {can(user?.role, "pegawai.create") && (
            <button
              onClick={() => {
                setEditingPegawai(null);
                setIsFormModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm shrink-0"
            >
              <Plus size={16} />
              Tambah Pegawai
            </button>
          )}
        </div>
      </div>

      {/* Match analysis banner — kartu klikable → filter berdasarkan kualitas match aset */}
      <div className="md:shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: "all" as const, label: "Total Pegawai", val: data.length, color: "text-gray-800 dark:text-gray-200", bg: "bg-gray-100 dark:bg-gray-800" },
          { key: "exact" as const, label: "Pegawai dengan Aset Terverifikasi", val: matchStats.exact, color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20" },
          { key: "fuzzy" as const, label: "Pegawai dengan Aset Perlu Verifikasi", val: matchStats.fuzzy, color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-900/20" },
          { key: "none" as const, label: "Pegawai Tanpa Aset", val: matchStats.none, color: "text-gray-500", bg: "bg-gray-50 dark:bg-gray-800/30" },
        ].map((s) => {
          const active = filterMatch === s.key;
          return (
            <button
              key={s.label}
              onClick={() => setFilterMatch(s.key)}
              aria-pressed={active}
              className={`${s.bg} text-left rounded-3xl neu-raised p-4 border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                active ? "border-blue-500 ring-2 ring-blue-500/40" : "border-white/40 dark:border-white/5"
              }`}
            >
              <p className="text-sm font-extrabold leading-snug text-gray-700 dark:text-gray-200">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="md:shrink-0">
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-full neuglass-pressed text-gray-900 dark:text-gray-100 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="all">Semua Status</option>
            <option value="ASN">ASN</option>
            <option value="PPPK_PENUH_WAKTU">PPPK (Penuh Waktu)</option>
            <option value="PPPK_PARUH_WAKTU">PPPK (Paruh Waktu)</option>
            <option value="PENSIUN">PENSIUN</option>
            <option value="">Status Kosong</option>
          </select>
          <select
            value={filterAssetPresence}
            onChange={(e) => setFilterAssetPresence(e.target.value as "all" | "with" | "none")}
            className="rounded-full neuglass-pressed text-gray-900 dark:text-gray-100 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
            title="Filter kepemilikan inventaris/aset"
          >
            <option value="all">Inventaris: Semua</option>
            <option value="with">Dengan Inventaris</option>
            <option value="none">Tanpa Inventaris</option>
          </select>
          <select value={filterBidang} onChange={(e) => setFilterBidang(e.target.value)} className="rounded-full neuglass-pressed text-gray-900 dark:text-gray-100 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none max-w-[230px]">
            <option value="all">Semua Bidang</option><option value="__empty__">(Tanpa Bidang)</option>
            {bidangOptions.map((bidang) => <option key={bidang} value={bidang}>{bidang}</option>)}
          </select>
          <select
            value={filterGolongan}
            onChange={(e) => setFilterGolongan(e.target.value)}
            className="rounded-full neuglass-pressed text-gray-900 dark:text-gray-100 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="all">Semua Golongan</option>
            {golonganLevels.map((l) => (
              <option key={l} value={l}>Golongan {l}</option>
            ))}
          </select>
          <select
            value={filterKelengkapan}
            onChange={(e) => setFilterKelengkapan(e.target.value as any)}
            className="rounded-full neuglass-pressed text-gray-900 dark:text-gray-100 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
            title="Filter berdasar kelengkapan 9 kriteria"
          >
            <option value="all">Kelengkapan: Semua</option>
            <option value="lengkap">Data Lengkap (9 kriteria)</option>
            <option value="belum">Belum Lengkap</option>
          </select>
          <button
            onClick={() => setFilterIncomplete(!filterIncomplete)}
            className={`text-sm px-4 py-2 flex items-center gap-1.5 rounded-full transition-colors ${
              filterIncomplete
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                : "neuglass-pressed text-gray-700 dark:text-gray-300 hover:text-amber-700 dark:hover:text-amber-400"
            }`}
          >
            <AlertTriangle size={14} />
            Data Tidak Lengkap
          </button>
          {(filterStatus !== "all" || filterBidang !== "all" || filterGolongan !== "all" || filterMatch !== "all" || filterAssetPresence !== "all" || filterIncomplete || filterKelengkapan !== "all" || searchTerm) && (
            <button
              onClick={() => { setFilterStatus("all"); setFilterBidang("all"); setFilterGolongan("all"); setFilterMatch("all"); setFilterAssetPresence("all"); setFilterIncomplete(false); setFilterKelengkapan("all"); setSearchTerm(""); }}
              className="text-sm px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
            >
              Reset Filter
            </button>
          )}
          <span className="text-sm text-gray-400 self-center ml-auto">
            Menampilkan {filteredData.length} dari {data.length} pegawai
          </span>
        </CardContent>
      </Card>

      {/* Table — Desktop */}
      <div className="hidden md:flex md:flex-col md:flex-1 md:min-h-0 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-22rem)] flex-1 min-h-0">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20 shadow-sm border-b border-gray-200 dark:border-gray-700">
              <tr className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-extrabold text-xs uppercase tracking-wider">
                <th className="p-4 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20">NAMA PEGAWAI</th>
                <th className="p-4 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20">NIP</th>
                <th className="p-4 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20">Golongan</th>
                <th className="p-4 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20">Jabatan &amp; Unit Kerja</th>
                <th className="p-4 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20">Status</th>
                <th className="p-4 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20">KGB Berikutnya</th>
                <th className="p-4 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20">Aset</th>
                {can(user?.role, "pegawai.edit.any") && <th className="p-4 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 text-center">WhatsApp</th>}
                <th className="p-4 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20">Kelengkapan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredData.map((pegawai, index) => (
                <tr
                  key={pegawai.nip || index}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors ${
                    pegawai.is_incomplete ? "bg-amber-50/30 dark:bg-amber-900/10" : ""
                  }`}
                  onClick={() => setSelectedPegawai(pegawai)}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <PegawaiAvatar foto={pegawai.foto} nama={pegawai.nama} nip={pegawai.nip} size="sm" />
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight max-w-[180px] truncate">
                          {pegawai.nama}
                        </span>
                        {pegawai.is_incomplete && (
                          <span 
                            title="Data profil belum lengkap (NIP, Jabatan, Golongan, atau Status kosong)"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 text-[10px] font-bold border border-amber-200 dark:border-amber-800/50"
                          >
                            <AlertTriangle size={10} />
                            Tidak Lengkap
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {maskSensitiveData("nip", pegawai.nip, user?.role, user?.nip, pegawai.nip)}
                  </td>
                  <td className="p-4">
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{pegawai.golongan}</span>
                  </td>
                  <td className="p-4">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-1 max-w-[200px]">
                      {pegawai.jabatan}
                    </div>
                    {pegawai.unit_kerja && (
                      <div className="text-xs text-gray-500 line-clamp-1 mt-0.5">{pegawai.unit_kerja}</div>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full ${
                      pegawai.status === "ASN"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                        : pegawai.status === "PPPK"
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400"
                          : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                    }`}>
                      {employmentStatusLabel(pegawai)}
                    </span>
                  </td>
                  <td className="p-4">
                    <KGBStatus tglKgb={pegawai.tgl_kgb} />
                  </td>
                  <td className="p-4">
                    {(pegawai.assets?.length || 0) > 0 ? (
                      <div className="flex items-center gap-1">
                        <div className={`flex items-center gap-1 text-sm font-bold ${
                          pegawai.match_quality === "exact"
                            ? "text-green-600 dark:text-green-400"
                            : "text-yellow-600 dark:text-yellow-400"
                        }`}>
                          <Package size={13} />
                          <span>{pegawai.assets?.length}</span>
                        </div>
                        <MatchBadge
                          quality={pegawai.match_quality}
                          onVerify={canVerifyAssetMatch && pegawai.match_quality === "fuzzy" ? () => openMatchVerification(pegawai) : undefined}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  {can(user?.role, "pegawai.edit.any") && (
                    <td className="p-4 text-center">
                      <WhatsAppButton pegawai={pegawai} compact />
                    </td>
                  )}
                  <td className="p-4">
                    <KelengkapanBadge hasil={hitungKelengkapan(pegawai, fuzzyNipSet)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredData.length === 0 && (
            <div className="p-10 text-center text-gray-500">
              <Search size={32} className="mx-auto mb-3 opacity-30" />
              <p>Tidak ada pegawai yang sesuai dengan filter.</p>
            </div>
          )}
        </div>
      </div>

      {/* Cards — Mobile */}
      <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filteredData.map((pegawai, index) => (
          <div
            key={pegawai.nip || index}
            className="cursor-pointer transition-transform hover:scale-[1.01]"
            onClick={() => setSelectedPegawai(pegawai)}
          >
            <Card className="overflow-hidden hover:shadow-md transition-all">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <PegawaiAvatar foto={pegawai.foto} nama={pegawai.nama} nip={pegawai.nip} size="md" />
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-bold text-gray-900 dark:text-white leading-tight text-sm truncate">
                        {pegawai.nama}
                      </h3>
                      {pegawai.is_incomplete && (
                        <span 
                          title="Data profil belum lengkap (NIP, Jabatan, Golongan, atau Status kosong)"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 text-[10px] font-bold border border-amber-200 dark:border-amber-800/50"
                        >
                          <AlertTriangle size={10} />
                          Tidak Lengkap
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-gray-500 mt-0.5">{maskSensitiveData("nip", pegawai.nip, user?.role, user?.nip, pegawai.nip)}</p>
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-full ${
                        pegawai.status === "ASN"
                          ? "bg-blue-100 text-blue-700"
                          : pegawai.status === "PPPK"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                      }`}>
                        {employmentStatusLabel(pegawai)}
                      </span>
                      <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-gray-100 text-gray-700">
                        {pegawai.golongan || "-"}
                      </span>
                      <KelengkapanBadge hasil={hitungKelengkapan(pegawai, fuzzyNipSet)} size="xs" />
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <Briefcase size={11} className="shrink-0" />
                    <span className="truncate">{pegawai.jabatan}</span>
                  </div>
                  {pegawai.unit_kerja && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <UserCircle size={11} className="shrink-0" />
                      <span className="truncate">{pegawai.unit_kerja}</span>
                    </div>
                  )}
                  {(pegawai.assets?.length || 0) > 0 && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-1">
                      <Package size={11} className="shrink-0" />
                      <span>{pegawai.assets?.length} Aset</span>
                      <MatchBadge
                        quality={pegawai.match_quality}
                        onVerify={canVerifyAssetMatch && pegawai.match_quality === "fuzzy" ? () => openMatchVerification(pegawai) : undefined}
                      />
                    </div>
                  )}
                  {can(user?.role, "pegawai.edit.any") && (
                    <div className="pt-1">
                      <WhatsAppButton pegawai={pegawai} compact />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
        {filteredData.length === 0 && (
          <div className="col-span-full p-10 text-center text-gray-500">
            Tidak ada data yang sesuai.
          </div>
        )}
      </div>

      {/* Profile 360° Modal */}
      <AnimatePresence>
        {selectedPegawai && (
          <PegawaiDetailModal
            pegawai={selectedPegawai}
            onClose={() => setSelectedPegawai(null)}
            onSelectAsset={(a) => { setSelectedAsset(a); }}
            onVerifyMatch={
              canVerifyAssetMatch && selectedPegawai.match_quality === "fuzzy"
                ? () => openMatchVerification(selectedPegawai)
                : undefined
            }
            onEdit={
              canEditPegawaiRow(user, selectedPegawai.nip)
                ? () => {
                    setSelectedPegawai(null);
                    setEditingPegawai(selectedPegawai);
                    setIsFormModalOpen(true);
                  }
                : undefined
            }
            onDelete={
              can(user?.role, "pegawai.delete")
                ? () => handleDelete(selectedPegawai)
                : undefined
            }
            onHardDelete={
              user?.role === "admin" || user?.role === "pimpinan"
                ? () => handleHardDelete(selectedPegawai)
                : undefined
            }
          />
        )}
      </AnimatePresence>

      {/* Asset Detail Modal — komponen bersama (foto, peta, zoom internal) */}
      <AssetDetailModal
        asset={selectedAsset}
        isOpen={!!selectedAsset}
        onClose={() => setSelectedAsset(null)}
      />


      {/* Form Modal */}
      <AnimatePresence>
        {isFormModalOpen && (
          <PegawaiFormModal
            isOpen={isFormModalOpen}
            initialData={editingPegawai}
            user={user}
            bidangOptions={bidangOptions}
            fieldOptions={pegawaiFieldOptions}
            onClose={() => setIsFormModalOpen(false)}
            onSuccess={() => {
              setIsFormModalOpen(false);
              load(true);
            }}
          />
        )}
      </AnimatePresence>
      <ConfirmModal state={confirmState} onClose={() => setConfirmState(CONFIRM_CLOSED)} />
    </div>
  );
}
