import React, { useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Papa from "papaparse";
import { dataService } from "@/services/dataService";
import { apiService } from "@/services/apiService";
import { AuthContext } from "@/components/layout/AppShell";
import { useToast } from "@/components/ui/Toast";
import { LoadingState } from "@/components/ui/LoadingState";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { PegawaiDetailModal } from "@/components/ui/PegawaiDetailModal";
import { AssetDetailModal } from "@/components/ui/AssetDetailModal";
import { ConfirmModal, CONFIRM_CLOSED, type ConfirmState } from "@/components/ui/ConfirmModal";
import { formatDate } from "@/lib/utils";
import { can } from "@/lib/rbac";
import {
  buildPenjagaanEvents,
  bucketMeta,
  sisaWaktuLabel,
  type PenjagaanEvent,
  type KategoriPenjagaan,
  type BucketPenjagaan,
} from "@/lib/penjagaan";
import type { Pegawai } from "@/types";
import {
  CalendarCheck, Search, RefreshCw, Download,
  TrendingUp, CalendarClock, Clock, Mail,
  LayoutList, Users, Bell, Send,
  Settings, X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// ---------------------------------------------------------------------------
// Tipe & konstanta
// ---------------------------------------------------------------------------
type RentangFilter = "le3" | "le6" | "le12" | "terlambat" | "semua";
type ViewMode = "agenda" | "ringkasan";

const KATEGORI_LABEL: Record<KategoriPenjagaan, string> = {
  KGB:    "KGB (Kenaikan Gaji Berkala)",
  PANGKAT:"Kenaikan Pangkat",
  BUP:    "Pensiun / BUP",
};

// Urutan bucket dari terburuk ke terbaik (untuk menentukan status terburuk per pegawai)
const BUCKET_ORDER: BucketPenjagaan[] = ["terlambat", "le3", "le6", "le12", "jauh"];

// Ringkasan per pegawai (view "per pegawai")
interface PegawaiRingkasan {
  nip:        string;
  nama:       string;
  golongan:   string;
  jabatan:    string;
  bidang:     string;
  status:     string;
  tmt_golongan: string;
  kgb:    PenjagaanEvent | null;
  pangkat:PenjagaanEvent | null;
  bup:    PenjagaanEvent | null;
  worstBucket: BucketPenjagaan;
}

// ---------------------------------------------------------------------------
// Komponen EventBadge — badge status pendek untuk view ringkasan
// ---------------------------------------------------------------------------
function EventBadge({ ev }: { ev: PenjagaanEvent | null }) {
  if (!ev) return <span className="text-xs text-gray-300 dark:text-gray-600">—</span>;
  const meta = bucketMeta(ev.bucket);
  return (
    <div className="text-xs">
      <div className={`font-medium ${ev.selisihHari < 0 ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`}>
        {sisaWaktuLabel(ev)}
      </div>
      <div className="text-gray-400">{formatDate(ev.tanggal)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Halaman BukuPenjagaan
// ---------------------------------------------------------------------------
export default function BukuPenjagaan() {
  const { user }   = useContext(AuthContext);
  const toast      = useToast();
  const [searchParams] = useSearchParams();

  const [data, setData]           = useState<Pegawai[]>([]);
  const [loading, setLoading]     = useState(true);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSync, setLastSync]   = useState<string | null>(null);
  const [viewMode, setViewMode]   = useState<ViewMode>("agenda");

  const [searchTerm,    setSearchTerm]    = useState("");
  const [filterKategori,setFilterKategori]= useState<"all" | KategoriPenjagaan>("all");
  const [filterRentang, setFilterRentang] = useState<RentangFilter>("le12");
  const [filterBidang,  setFilterBidang]  = useState("all");
  const [filterStatus,  setFilterStatus]  = useState("all");

  const [selectedPegawai,setSelectedPegawai] = useState<Pegawai | null>(null);
  const [selectedAsset,  setSelectedAsset]   = useState<any | null>(null);

  // Notifikasi
  const [confirmState,    setConfirmState]    = useState<ConfirmState>(CONFIRM_CLOSED);
  const [isSendingNotif,  setIsSendingNotif]  = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    KGB_CYCLE_YEARS: "2", PANGKAT_CYCLE_YEARS: "4", BUP_USIA: "58",
  });

  const canNotifikasi = can(user?.role, "config.write"); // true untuk admin & pimpinan

  // Deep-link dari Dashboard (?kategori=KGB&rentang=le6)
  useEffect(() => {
    const k = (searchParams.get("kategori") || "").toUpperCase();
    if (k === "KGB" || k === "PANGKAT" || k === "BUP") setFilterKategori(k as KategoriPenjagaan);
    const r = (searchParams.get("rentang") || "") as RentangFilter;
    if (["le3","le6","le12","terlambat","semua"].includes(r)) setFilterRentang(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(force = false) {
    if (force) { setIsRefreshing(true); dataService.clearCache(); }
    else setLoading(true);
    setErrorMsg(null);
    try {
      const result = await dataService.getPegawai();
      setData(result as Pegawai[]);
      setLastSync(dataService.getLastUpdated());
    } catch (err: any) {
      setErrorMsg(err?.message || "Gagal memuat data pegawai.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Seluruh agenda dari data nyata
  const events = useMemo(() => buildPenjagaanEvents(data), [data]);

  // Peta NIP → Pegawai (untuk buka profil & ambil TMT Golongan)
  const pegawaiByNip = useMemo(() => {
    const m = new Map<string, Pegawai>();
    for (const p of data) {
      const key = String(p.nip || "").trim();
      if (key) m.set(key, p);
    }
    return m;
  }, [data]);

  function openProfil(nip: string) {
    const key = String(nip || "").trim();
    if (!key) return;
    const p = pegawaiByNip.get(key);
    if (p) setSelectedPegawai(p);
  }

  // Opsi bidang untuk filter
  const bidangOptions = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => set.add(e.bidang));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "id"));
  }, [events]);

  // Ringkasan ≤12 bulan (kartu summary atas) — bersumber dari `events` yang
  // SAMA dipakai tabel, agar tidak ada divergensi hasil dgn perhitungan lain.
  // Terlambat dihitung TERPISAH (tidak tumpang tindih dengan ≤12 bulan).
  const summary = useMemo(() => {
    const isUpcomingLe12 = (e: PenjagaanEvent) => !e.isOverdue && e.selisihHari <= 365;
    const kgb       = events.filter((e) => e.kategori === "KGB"     && isUpcomingLe12(e)).length;
    const pangkat   = events.filter((e) => e.kategori === "PANGKAT" && isUpcomingLe12(e)).length;
    const pensiun   = events.filter((e) => e.kategori === "BUP"     && isUpcomingLe12(e)).length;
    const terlambat = events.filter((e) => e.isOverdue).length;
    return { kgb, pangkat, pensiun, terlambat };
  }, [events]);

  // --- VIEW "PER AGENDA" (filtered) ---
  const filteredEvents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const inRentang = (e: PenjagaanEvent) => {
      switch (filterRentang) {
        case "le3":       return e.selisihHari >= 0 && e.selisihHari <= 90;
        case "le6":       return e.selisihHari >= 0 && e.selisihHari <= 182;
        case "le12":      return e.selisihHari >= 0 && e.selisihHari <= 365;
        case "terlambat": return e.selisihHari < 0;
        case "semua":     return true;
      }
    };
    return events
      .filter((e) => {
        if (filterKategori !== "all" && e.kategori !== filterKategori) return false;
        if (filterBidang !== "all" && e.bidang !== filterBidang) return false;
        if (filterStatus !== "all" && e.status !== filterStatus) return false;
        if (!inRentang(e)) return false;
        if (q && !(`${e.nama} ${e.nip} ${e.jabatan} ${e.bidang}`.toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a, b) => a.selisihHari - b.selisihHari);
  }, [events, searchTerm, filterKategori, filterRentang, filterBidang, filterStatus]);

  // --- VIEW "PER PEGAWAI" (ringkasan) ---
  // Gabungkan KGB, PANGKAT, BUP dalam satu baris per pegawai.
  // Filter pencarian + bidang + status diterapkan. filterKategori & filterRentang
  // diabaikan (view ini selalu menampilkan ketiga event sekaligus).
  const ringkasanList = useMemo<PegawaiRingkasan[]>(() => {
    const q = searchTerm.trim().toLowerCase();

    // Kelompokkan events per NIP
    const byNip = new Map<string, { kgb?: PenjagaanEvent; pangkat?: PenjagaanEvent; bup?: PenjagaanEvent }>();
    for (const e of events) {
      if (!e.nip) continue;
      if (!byNip.has(e.nip)) byNip.set(e.nip, {});
      const entry = byNip.get(e.nip)!;
      if (e.kategori === "KGB")    entry.kgb    = e;
      else if (e.kategori === "PANGKAT") entry.pangkat = e;
      else if (e.kategori === "BUP")    entry.bup    = e;
    }

    const result: PegawaiRingkasan[] = [];
    for (const [nip, evts] of byNip.entries()) {
      const anyEv = evts.kgb || evts.pangkat || evts.bup;
      if (!anyEv) continue;
      if (filterBidang !== "all" && anyEv.bidang !== filterBidang) continue;
      if (filterStatus !== "all" && anyEv.status !== filterStatus) continue;
      if (q && !(`${anyEv.nama} ${nip} ${anyEv.jabatan} ${anyEv.bidang}`).toLowerCase().includes(q)) continue;

      // Tentukan bucket terburuk dari ketiga event yang ada
      const allBuckets = [evts.kgb, evts.pangkat, evts.bup]
        .filter(Boolean)
        .map((e) => e!.bucket);
      const worstBucket = allBuckets.reduce<BucketPenjagaan>(
        (worst, b) => BUCKET_ORDER.indexOf(b) > BUCKET_ORDER.indexOf(worst) ? b : worst,
        "jauh"
      );

      const p = pegawaiByNip.get(nip);
      result.push({
        nip,
        nama:        anyEv.nama,
        golongan:    anyEv.golongan,
        jabatan:     anyEv.jabatan,
        bidang:      anyEv.bidang,
        status:      anyEv.status,
        tmt_golongan: p?.tgl_mulai_golongan || "",
        kgb:    evts.kgb    ?? null,
        pangkat:evts.pangkat ?? null,
        bup:    evts.bup    ?? null,
        worstBucket,
      });
    }

    // Urutkan: bucket terburuk di atas
    return result.sort(
      (a, b) => BUCKET_ORDER.indexOf(b.worstBucket) - BUCKET_ORDER.indexOf(a.worstBucket)
    );
  }, [events, pegawaiByNip, searchTerm, filterBidang, filterStatus]);

  const hasActiveFilter =
    filterKategori !== "all" || filterRentang !== "le12" ||
    filterBidang !== "all" || filterStatus !== "all" || !!searchTerm;

  function resetFilters() {
    setFilterKategori("all"); setFilterRentang("le12");
    setFilterBidang("all"); setFilterStatus("all"); setSearchTerm("");
  }

  function exportCSV() {
    if (!can(user?.role, "data.export")) {
      toast.error("Akses Ditolak", "Role Pegawai tidak memiliki izin mengunduh CSV.");
      return;
    }
    const rows =
      viewMode === "agenda"
        ? filteredEvents.map((e) => ({
            "NAMA PEGAWAI":   e.nama,
            "NIP":            e.nip,
            "GOLONGAN":       e.golongan,
            "JABATAN":        e.jabatan,
            "BIDANG":         e.bidang,
            "TMT GOLONGAN":   formatDate(pegawaiByNip.get(e.nip)?.tgl_mulai_golongan || ""),
            "KATEGORI":       KATEGORI_LABEL[e.kategori],
            "TENGGAT WAKTU":  formatDate(e.tanggal),
            "SISA WAKTU":     sisaWaktuLabel(e),
            "STATUS AGENDA":  e.isOverdue ? "Terlewat" : "Akan Datang",
          }))
        : ringkasanList.map((r) => ({
            "NAMA PEGAWAI":   r.nama,
            "NIP":            r.nip,
            "GOLONGAN":       r.golongan,
            "JABATAN":        r.jabatan,
            "BIDANG":         r.bidang,
            "STATUS":         r.status,
            "TMT GOLONGAN":   formatDate(r.tmt_golongan),
            "KGB — TENGGAT WAKTU": r.kgb ? formatDate(r.kgb.tanggal) : "-",
            "KGB — SISA WAKTU":    r.kgb ? sisaWaktuLabel(r.kgb) : "-",
            "PANGKAT — TENGGAT WAKTU": r.pangkat ? formatDate(r.pangkat.tanggal) : "-",
            "PANGKAT — SISA WAKTU":    r.pangkat ? sisaWaktuLabel(r.pangkat) : "-",
            "BUP — TENGGAT WAKTU": r.bup ? formatDate(r.bup.tanggal) : "-",
            "BUP — SISA WAKTU":    r.bup ? sisaWaktuLabel(r.bup) : "-",
          }));

    if (rows.length === 0) { toast.warning("Ekspor Kosong", "Tidak ada data."); return; }
    const csv  = Papa.unparse(rows as Record<string, string>[]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const mode = viewMode === "agenda" ? "BukuPenjagaan" : "RingkasanPegawai";
    a.href     = url;
    a.download = `SIMOSDA_${mode}_${new Date().toISOString().slice(0,10).replace(/-/g,"")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doKirimNotifikasi() {
    setIsSendingNotif(true);
    try {
      const res = await apiService.runNotifikasi() as any;
      toast.success(
        "Proses Notifikasi Selesai",
        `${res.agenda ?? 0} agenda berada dalam 1 bulan sebelum tenggat; ${res.email_pegawai_terkirim ?? 0} email pegawai dan ${res.email_rekap_terkirim ?? 0} rekap Administrator dikirim minggu ini.`
      );
    } catch (err: any) {
      toast.error("Gagal Mengirim", err?.message || "Terjadi kesalahan saat mengirim notifikasi.");
    } finally {
      setIsSendingNotif(false);
    }
  }

  async function openSettings() {
    // Buka modal langsung tanpa menunggu fetch agar tidak ada delay lag tampil
    setSettingsOpen(true);
    try {
      const res = await apiService.getConfig();
      setSettingsForm((prev) => ({
        ...prev,
        ...Object.fromEntries(Object.keys(prev).map((key) => [key, String(res.config?.[key] ?? prev[key as keyof typeof prev])])),
      }));
    } catch (err: any) {
      toast.error("Gagal Memuat Pengaturan", err?.message || "Pengaturan tidak dapat dimuat.");
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      for (const [key, value] of Object.entries(settingsForm)) await apiService.setConfig(key, value);
      dataService.clearCache();
      setSettingsOpen(false);
      await load(true);
      toast.success("Pengaturan Tersimpan", "Perhitungan agenda telah diperbarui.");
    } catch (err: any) {
      toast.error("Gagal Menyimpan", err?.message || "Pengaturan tidak dapat disimpan.");
    } finally {
      setSavingSettings(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-6 space-y-5 h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CalendarCheck size={24} className="text-blue-600" /> Buku Penjagaan
          </h1>
          {lastSync && (
            <p className="text-xs text-gray-400 mt-0.5">
              Data per: {new Date(lastSync).toLocaleString("id-ID")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canNotifikasi && (
            <button
              onClick={openSettings}
              className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
              <Settings size={15} /> Pengaturan Agenda
            </button>
          )}
          {canNotifikasi && (
            <button
              onClick={() =>
                setConfirmState({
                  open: true,
                  title: "Kirim Notifikasi Sekarang",
                  message:
                    "Kirim pengingat untuk agenda yang sudah memasuki satu bulan sebelum tenggat waktu. Pengingat dikirim 1 kali seminggu dan tidak akan dikirim berulang pada minggu yang sama. Rekap otomatis juga dikirim ke akun Administrator/Pimpinan aktif.",
                  confirmLabel: "Kirim Notifikasi",
                  confirmClass: "bg-emerald-600 hover:bg-emerald-700",
                  onConfirm: doKirimNotifikasi,
                })
              }
              disabled={isSendingNotif}
              className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-50 transition-colors"
            >
              {isSendingNotif ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
              Kirim Notifikasi
            </button>
          )}
          {can(user?.role, "data.export") && (
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Download size={15} /> Ekspor CSV
            </button>
          )}
          <button
            onClick={() => load(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} /> Sinkronisasi
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "KGB ≤12 Bln",    value: summary.kgb,       icon: TrendingUp,    color: "text-blue-600 dark:text-blue-400",   click: () => { setViewMode("agenda"); setFilterKategori("KGB"); setFilterRentang("le12"); } },
          { label: "Pangkat ≤12 Bln", value: summary.pangkat,   icon: CalendarClock, color: "text-purple-600 dark:text-purple-400",click: () => { setViewMode("agenda"); setFilterKategori("PANGKAT"); setFilterRentang("le12"); } },
          { label: "Pensiun ≤12 Bln", value: summary.pensiun,   icon: Clock,         color: "text-orange-600 dark:text-orange-400",click: () => { setViewMode("agenda"); setFilterKategori("BUP"); setFilterRentang("le12"); } },
          { label: "Terlewat",        value: summary.terlambat, icon: Mail,          color: "text-red-600 dark:text-red-400",     click: () => { setViewMode("agenda"); setFilterKategori("all"); setFilterRentang("terlambat"); } },
        ].map(({ label, value, icon: Icon, color, click }) => (
          <Card key={label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={click}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className={`text-2xl font-bold ${color}`}>{value}</div>
                  <div className="text-sm font-extrabold leading-snug text-gray-700 dark:text-gray-200 mt-1">{label}</div>
                </div>
                <Icon size={20} className={`${color} opacity-60 mt-1`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* View toggle + Filter bar — div polos (BUKAN <Card>) karena toolbar filter
          tidak boleh memakai efek hover-scale/overflow-hidden milik kartu KPI;
          kombinasi keduanya berisiko membuat toolbar terpotong saat jumlah
          elemen berubah (toggle Agenda/Pegawai menambah-hapus 2 dropdown). */}
      <div className="rounded-3xl neuglass">
        <div className="flex flex-wrap gap-2 p-3 items-center">
          {/* Toggle view */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-full p-1 gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("agenda")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${
                viewMode === "agenda" ? "bg-white dark:bg-gray-700 text-blue-600 shadow-sm" : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <LayoutList size={14} /> Per Agenda
            </button>
            <button
              type="button"
              onClick={() => setViewMode("ringkasan")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${
                viewMode === "ringkasan" ? "bg-white dark:bg-gray-700 text-blue-600 shadow-sm" : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <Users size={14} /> Per Pegawai
            </button>
          </div>

          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nama, NIP, jabatan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-10 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full focus:ring-2 focus:ring-blue-500 outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Hapus kata kunci pencarian"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {viewMode === "agenda" && (
            <>
              <select value={filterKategori} onChange={(e) => setFilterKategori(e.target.value as any)}
                className="rounded-full neuglass-pressed text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none">
                <option value="all">Semua Kategori</option>
                <option value="KGB">KGB</option>
                <option value="PANGKAT">Pangkat</option>
                <option value="BUP">Pensiun/BUP</option>
              </select>
              <select value={filterRentang} onChange={(e) => setFilterRentang(e.target.value as RentangFilter)}
                className="rounded-full neuglass-pressed text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none">
                <option value="le3">≤ 3 bulan</option>
                <option value="le6">≤ 6 bulan</option>
                <option value="le12">≤ 12 bulan</option>
                <option value="terlambat">Terlewat</option>
                <option value="semua">Semua waktu</option>
              </select>
            </>
          )}

          <select value={filterBidang} onChange={(e) => setFilterBidang(e.target.value)}
            className="rounded-full neuglass-pressed text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none max-w-[200px]">
            <option value="all">Semua Bidang</option>
            {bidangOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-full neuglass-pressed text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none">
            <option value="all">Semua Status</option>
            <option value="ASN">ASN</option>
            <option value="PPPK (Penuh Waktu)">PPPK (Penuh Waktu)</option>
            <option value="PPPK (Paruh Waktu)">PPPK (Paruh Waktu)</option>
          </select>
          {hasActiveFilter && (
            <button onClick={resetFilters}
              className="rounded-full neuglass-pressed px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors">
              Reset Filter
            </button>
          )}
          <span className="text-sm text-gray-400 self-center ml-auto whitespace-nowrap">
            {viewMode === "agenda"
              ? `${filteredEvents.length} agenda`
              : `${ringkasanList.length} pegawai`}
          </span>
        </div>
      </div>

      {/* ── VIEW PER AGENDA ── */}
      {viewMode === "agenda" && (
        <>
          {/* Tabel — Desktop */}
          <div className="hidden md:flex md:flex-col md:flex-1 md:min-h-0 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-22rem)] md:flex-1 md:min-h-0">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-20 shadow-sm border-b border-gray-200 dark:border-gray-700">
                  <tr className="bg-gray-100 dark:bg-gray-800 text-xs uppercase tracking-wider text-gray-700 dark:text-gray-200 font-extrabold">
                    <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 w-[220px]">Pegawai</th>
                    <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 w-[80px]">Gol.</th>
                    <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 w-[220px]">Jabatan &amp; Bidang</th>
                    <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 w-[130px]">TMT Golongan</th>
                    <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 w-[150px]">Kategori</th>
                    <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 w-[130px]">Tenggat Waktu</th>
                    <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 w-[120px]">Sisa Waktu</th>
                    <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 w-[120px]">Indikator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {filteredEvents.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">
                      Tidak ada agenda yang cocok dengan filter.
                    </td></tr>
                  ) : filteredEvents.map((e, i) => {
                    const meta = bucketMeta(e.bucket);
                    const tmtGolongan = pegawaiByNip.get(e.nip)?.tgl_mulai_golongan || "";
                    return (
                      <tr key={`${e.nip}-${e.kategori}-${i}`}
                        onClick={() => openProfil(e.nip)}
                        className={`transition-colors ${e.nip ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30" : "hover:bg-gray-50 dark:hover:bg-gray-700/30"}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-gray-100">{e.nama || "-"}</div>
                          <div className="text-xs text-gray-400 font-mono">{e.nip || "-"}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{e.golongan || "-"}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-800 dark:text-gray-200 line-clamp-1">{e.jabatan || "-"}</div>
                          <div className="text-xs text-gray-400 uppercase line-clamp-1">{e.bidang}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {tmtGolongan ? formatDate(tmtGolongan) : "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{KATEGORI_LABEL[e.kategori]}</td>
                        <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap">{formatDate(e.tanggal)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-sm font-medium ${e.selisihHari < 0 ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`}>
                            {sisaWaktuLabel(e)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                            <Badge variant={meta.badge}>{e.isOverdue && e.kategori === "BUP" ? "Lewat BUP" : meta.label}</Badge>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Kartu — Mobile */}
          <div className="md:hidden space-y-3">
            {filteredEvents.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-10">Tidak ada agenda yang cocok dengan filter.</div>
            ) : filteredEvents.map((e, i) => {
              const meta = bucketMeta(e.bucket);
              const tmtGolongan = pegawaiByNip.get(e.nip)?.tgl_mulai_golongan || "";
              return (
                <div key={`${e.nip}-${e.kategori}-${i}`}
                  onClick={() => openProfil(e.nip)}
                  className={`bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm ${e.nip ? "cursor-pointer active:bg-gray-50 dark:active:bg-gray-700/30" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">{e.nama || "-"}</div>
                      <div className="text-xs text-gray-400 font-mono">{e.nip || "-"}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                      <Badge variant={meta.badge}>{e.isOverdue && e.kategori === "BUP" ? "Lewat BUP" : meta.label}</Badge>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{e.jabatan || "-"} · {e.bidang}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div><div className="text-[11px] text-gray-400">Kategori</div><div className="text-gray-800 dark:text-gray-200">{KATEGORI_LABEL[e.kategori]}</div></div>
                    <div><div className="text-[11px] text-gray-400">Golongan</div><div className="text-gray-800 dark:text-gray-200">{e.golongan || "-"}</div></div>
                    <div><div className="text-[11px] text-gray-400">TMT Golongan</div><div className="text-gray-700 dark:text-gray-300">{tmtGolongan ? formatDate(tmtGolongan) : "-"}</div></div>
                    <div><div className="text-[11px] text-gray-400">Tenggat Waktu</div><div className="text-gray-800 dark:text-gray-200">{formatDate(e.tanggal)}</div></div>
                    <div className="col-span-2"><div className="text-[11px] text-gray-400">Sisa Waktu</div>
                      <div className={e.selisihHari < 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-gray-800 dark:text-gray-200"}>
                        {sisaWaktuLabel(e)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── VIEW PER PEGAWAI (RINGKASAN) ── */}
      {viewMode === "ringkasan" && (
        <>
          {/* Tabel — Desktop */}
          <div className="hidden md:flex md:flex-col md:flex-1 md:min-h-0 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-22rem)] md:flex-1 md:min-h-0">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead className="sticky top-0 z-20 shadow-sm border-b border-gray-200 dark:border-gray-700">
                  <tr className="bg-gray-100 dark:bg-gray-800 text-xs uppercase tracking-wider text-gray-700 dark:text-gray-200 font-extrabold">
                    <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 w-[220px]">Pegawai</th>
                    <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 w-[80px]">Gol.</th>
                    <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 w-[130px]">TMT Golongan</th>
                    <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 w-[140px]">KGB</th>
                    <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 w-[140px]">Kenaikan Pangkat</th>
                    <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 w-[140px]">Pensiun / BUP</th>
                    <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 w-[120px]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {ringkasanList.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">Tidak ada data.</td></tr>
                  ) : ringkasanList.map((r) => {
                    const worstMeta = bucketMeta(r.worstBucket);
                    return (
                      <tr key={r.nip}
                        onClick={() => openProfil(r.nip)}
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{r.nama}</div>
                          <div className="text-xs text-gray-400 font-mono">{r.nip}</div>
                          <div className="text-xs text-gray-400 uppercase line-clamp-1">{r.jabatan}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{r.golongan || "-"}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {r.tmt_golongan ? formatDate(r.tmt_golongan) : "-"}
                        </td>
                        <td className="px-4 py-3"><EventBadge ev={r.kgb} /></td>
                        <td className="px-4 py-3"><EventBadge ev={r.pangkat} /></td>
                        <td className="px-4 py-3"><EventBadge ev={r.bup} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${worstMeta.dot}`} />
                            <Badge variant={worstMeta.badge}>{worstMeta.label}</Badge>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Kartu — Mobile (per pegawai) */}
          <div className="md:hidden space-y-3">
            {ringkasanList.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-10">Tidak ada data.</div>
            ) : ringkasanList.map((r) => {
              const worstMeta = bucketMeta(r.worstBucket);
              return (
                <div key={r.nip} onClick={() => openProfil(r.nip)}
                  className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm cursor-pointer active:bg-gray-50 dark:active:bg-gray-700/30">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{r.nama}</div>
                      <div className="text-xs text-gray-400 font-mono">{r.nip}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{r.golongan} · TMT: {r.tmt_golongan ? formatDate(r.tmt_golongan) : "-"}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`w-2 h-2 rounded-full ${worstMeta.dot}`} />
                      <Badge variant={worstMeta.badge}>{worstMeta.label}</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[
                      { label: "KGB", ev: r.kgb },
                      { label: "Pangkat", ev: r.pangkat },
                      { label: "BUP", ev: r.bup },
                    ].map(({ label, ev }) => (
                      <div key={label} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                        <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">{label}</div>
                        {ev ? (
                          <>
                            <div className="text-gray-500 dark:text-gray-400">{formatDate(ev.tanggal)}</div>
                            <div className={`font-medium mt-0.5 ${ev.selisihHari < 0 ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`}>
                              {sisaWaktuLabel(ev)}
                            </div>
                          </>
                        ) : (
                          <div className="text-gray-300 dark:text-gray-600">—</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modals */}
      <AnimatePresence>
        {selectedPegawai && (
          <PegawaiDetailModal pegawai={selectedPegawai} onClose={() => setSelectedPegawai(null)} onSelectAsset={(a) => setSelectedAsset(a)} />
        )}
      </AnimatePresence>
      <AssetDetailModal asset={selectedAsset} isOpen={!!selectedAsset} onClose={() => setSelectedAsset(null)} />
      <ConfirmModal state={confirmState} onClose={() => setConfirmState(CONFIRM_CLOSED)} />
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60" onClick={() => !savingSettings && setSettingsOpen(false)}>
          <form onSubmit={saveSettings} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 p-4 sm:p-5 shadow-2xl border border-gray-200 dark:border-gray-700 space-y-4 max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Pengaturan Buku Penjagaan</h2>
              <p className="text-xs text-gray-500 mt-1">Berlaku untuk perhitungan seluruh pegawai aktif.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ["KGB_CYCLE_YEARS", "Siklus KGB (tahun)", 1, 10],
                ["PANGKAT_CYCLE_YEARS", "Siklus Pangkat (tahun)", 1, 10],
                ["BUP_USIA", "Usia BUP", 50, 70],
              ].map(([key, label, min, max]) => (
                <label key={String(key)} className="text-xs font-bold text-gray-700 dark:text-gray-300">
                  {String(label)}
                  <input type="number" min={Number(min)} max={Number(max)} required value={settingsForm[key as keyof typeof settingsForm]}
                    onChange={(e) => setSettingsForm((p) => ({ ...p, [String(key)]: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800" />
                </label>
              ))}
            </div>
            <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
              Default resmi: KGB 2 tahun, pangkat 4 tahun, dan BUP 58 tahun. Email pegawai mulai dikirim saat tenggat masuk 1 bulan ke depan dan diulang paling banyak satu kali setiap minggu; rekap dikirim ke akun Administrator/Pimpinan aktif. Perubahan konfigurasi tercatat dalam audit.
            </div>
            <div className="safe-area-bottom grid grid-cols-2 sm:flex sm:justify-end gap-2">
              <button type="button" disabled={savingSettings} onClick={() => setSettingsOpen(false)} className="min-h-11 px-4 py-2 text-sm font-bold rounded-xl border border-gray-200 dark:border-gray-700">Batal</button>
              <button type="submit" disabled={savingSettings} className="min-h-11 px-4 py-2 text-sm font-bold rounded-xl bg-blue-600 text-white disabled:opacity-50">{savingSettings ? "Menyimpan…" : "Simpan"}</button>
            </div>
          </form>
        </div>
      )}
    </motion.div>
  );
}
