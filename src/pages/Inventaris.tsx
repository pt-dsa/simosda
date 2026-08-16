import React, { useContext, useEffect, useState, useMemo, useRef } from "react";
import { dataService } from "@/services/dataService";
import { Equipment, Pegawai } from "@/types";
import { StatusBadge } from "@/components/ui/Badge";
import { SearchInput } from "@/components/ui/SearchInput";
import { Card, CardContent } from "@/components/ui/Card";
import { QrCode, MapPin, ImageOff, ZoomIn, X, Plus, Edit2, Trash2, CheckSquare, RefreshCw, AlertCircle, FileUp, Paperclip, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { DetailModal } from '@/components/ui/DetailModal';
import { DataTable, ColumnDef } from "@/components/ui/DataTable";
import { SummaryCards } from "@/components/ui/SummaryCards";
import { canonKey } from "@/lib/summary";
import { LoadingState } from "@/components/ui/LoadingState";
import { useLocation } from "react-router-dom";
import { useToast } from "@/components/ui/Toast";
import { ConfirmModal, CONFIRM_CLOSED, type ConfirmState } from "@/components/ui/ConfirmModal";
import { EmployeeAutocomplete, isOfficialEmployeeSelection } from "@/components/ui/EmployeeAutocomplete";
import { KibImportModal } from "@/components/equipment/KibImportModal";
import { AssetMediaFields } from "@/components/ui/AssetMediaFields";
import { apiService, fileToBase64 } from "@/services/apiService";
import { SafeImage } from "@/components/ui/SafeImage";
import { resolveAssetPhotoCandidates, resolveAssetPhotoUrl } from "@/lib/media";
import { AuthContext } from "@/components/layout/AppShell";
import { can } from "@/lib/rbac";
import { toSearchText } from "@/lib/utils";
import { optionalCoordinatePayload } from "@/lib/coordinates";
import { normalizeAssetText, optionalAssetNumber, validOptionalAssetNumber } from "@/lib/assetFields";
import { EquipmentFormModal } from "@/components/ui/EquipmentFormModal";
import {
  ASSET_CONDITIONS,
  ASSET_CONDITION_UNSET,
  assetConditionLabel,
  isValidAssetCondition,
  normalizeAssetCondition,
  summarizeAssetConditions,
} from "@/lib/assetCondition";

export default function Inventaris() {
  const { user } = useContext(AuthContext);
  const canWriteAssets = can(user?.role, "asset.write");
  const location = useLocation();
  const toast = useToast();
  const [confirmState, setConfirmState] = useState<ConfirmState>(CONFIRM_CLOSED);
  const [data, setData] = useState<Equipment[]>([]);
  const [employees, setEmployees] = useState<Pegawai[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [filterJenis, setFilterJenis] = useState("");
  const [filterKondisi, setFilterKondisi] = useState("");
  const [filterTahun, setFilterTahun] = useState("");
  const [filterIndex, setFilterIndex] = useState("");
  const [filterBidang, setFilterBidang] = useState("");
  const [filterPengguna, setFilterPengguna] = useState("");
  const [showImport, setShowImport] = useState(false);

  const [selectedQR, setSelectedQR] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Equipment[]>([]);

  // CRUD states
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Equipment>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const handledEditIdRef = useRef("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get("search");
    if (q) setSearch(q);
  }, [location.search]);

  // Fungsi muat data di lingkup komponen agar bisa dipanggil ulang
  // (mis. sinkronisasi ulang saat operasi tulis gagal).
  const load = async (force = false) => {
    if (force) dataService.clearCache();
    try {
      const [res, employeeRows] = await Promise.all([
        dataService.getEquipment(),
        dataService.getEmployeeDirectory(),
      ]);
      setData(res);
      setEmployees(employeeRows as Pegawai[]);
      return true;
    } catch (err: any) {
      toast.error("Gagal Memuat", err?.message || "Tidak dapat memuat data alat/mesin.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    const ok = await load(true);
    setSyncing(false);
    if (ok) toast.success("Sinkronisasi Berhasil", "Data alat, mesin, dan pegawai telah diperbarui.");
  };

  const handleDelete = (id: string) => {
    setConfirmState({
      open: true,
      title: "Hapus Data Alat/Mesin",
      message: "Apakah Anda yakin ingin menghapus data alat/mesin ini?",
      confirmLabel: "Hapus",
      confirmClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        try {
          await dataService.deleteEquipment(id);
          setData(prev => prev.filter(item => item.asset_id !== id));
          setSelectedRows(prev => prev.filter(r => r.asset_id !== id));
          toast.success("Data Dihapus", "Data alat/mesin berhasil dihapus.");
        } catch (err: any) {
          toast.error("Gagal Menghapus", err.message);
          load();
        }
      },
    });
  };

  const handleBulkDelete = () => {
    setConfirmState({
      open: true,
      title: "Hapus Massal",
      message: `Apakah Anda yakin ingin menghapus ${selectedRows.length} data alat/mesin secara massal?`,
      confirmLabel: "Hapus Semua",
      confirmClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        try {
          for (const r of selectedRows) {
            if (r.asset_id) await dataService.deleteEquipment(r.asset_id);
          }
          const idsToDelete = new Set(selectedRows.map(r => r.asset_id));
          setData(prev => prev.filter(item => !idsToDelete.has(item.asset_id)));
          setSelectedRows([]);
          toast.success("Data Dihapus", `${selectedRows.length} data alat/mesin berhasil dihapus.`);
        } catch (err: any) {
          toast.error("Gagal Menghapus", err.message);
          load();
        }
      },
    });
  };

  const handleBulkUpdateStatus = (newStatus: string) => {
    setConfirmState({
      open: true,
      title: "Ubah Status Massal",
      message: `Apakah Anda yakin ingin mengubah status ${selectedRows.length} item menjadi "${newStatus}"?`,
      confirmLabel: "Ubah Status",
      confirmClass: "bg-blue-600 hover:bg-blue-700",
      onConfirm: async () => {
        try {
          // Persistenkan ke basis data — bukan hanya tampilan (anti data semu).
          for (const r of selectedRows) {
            if (r.asset_id) await dataService.saveEquipment({ asset_id: r.asset_id, kondisi: newStatus }, false);
          }
          const idsToUpdate = new Set(selectedRows.map(r => r.asset_id));
          setData(prev => prev.map(item => idsToUpdate.has(item.asset_id) ? { ...item, kondisi: newStatus } : item));
          setSelectedRows([]);
          toast.success("Status Diperbarui", `${selectedRows.length} data inventaris berhasil diperbarui.`);
        } catch (err: any) {
          toast.error("Gagal Memperbarui", err.message);
          load();
        }
      },
    });
  };

  const handleSaveSuccess = async () => {
    await load();
    setIsEditing(false);
    setFormData({});
  };

  function openForm(item?: Equipment) {
    if (item) {
      setFormData(item);
    } else {
      setFormData({ kondisi: "", jumlah: 1, satuan: "Unit" });
    }
    setIsEditing(true);
  }

  // Listener untuk AI Voice Command (Event: ai-action)
  useEffect(() => {
    const handleAIAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { action, target } = customEvent.detail || {};
      if (action === "FILL_FORM" && target === "equipment_form") {
        openForm(); // Buka form tambah peralatan
      }
    };
    window.addEventListener('ai-action', handleAIAction);
    return () => window.removeEventListener('ai-action', handleAIAction);
  }, []);

  useEffect(() => {
    const editId = new URLSearchParams(location.search).get("edit") || "";
    if (!editId || loading || !canWriteAssets || handledEditIdRef.current === editId) return;
    const item = data.find((row) => String(row.asset_id) === editId);
    if (item) {
      handledEditIdRef.current = editId;
      openForm(item);
    }
  }, [location.search, data, loading, canWriteAssets]);


  const filteredData = useMemo(() => {
    const query = toSearchText(search).trim();
    return data.filter(item => {
      const matchSearch = !query || [
        item.nama_aset, item.merk, item.jenis, item.pengguna,
        item.penanggung_jawab, item.kode_barang, item.kib_index,
        item.bidang, item.spesifikasi,
      ].some((value) => toSearchText(value).includes(query));
      const matchJenis = filterJenis ? toSearchText(item.jenis) === toSearchText(filterJenis) : true;
      const matchKondisi = filterKondisi ? canonKey(assetConditionLabel(item.kondisi)) === canonKey(filterKondisi) : true;
      const matchTahun = filterTahun ? String(item.tahun || "") === filterTahun : true;
      const indexes = [item.kib_index, ...(Array.isArray(item.unit_indexes) ? item.unit_indexes : [])]
        .map(toSearchText).filter(Boolean).join(" ");
      const matchIndex = filterIndex ? indexes.includes(toSearchText(filterIndex).trim()) : true;
      const matchBidang = filterBidang ? canonKey(item.bidang) === canonKey(filterBidang) : true;
      const matchPengguna = filterPengguna ? canonKey(item.pengguna) === canonKey(filterPengguna) : true;
      return matchSearch && matchJenis && matchKondisi && matchTahun && matchIndex && matchBidang && matchPengguna;
    });
  }, [data, search, filterJenis, filterKondisi, filterTahun, filterIndex, filterBidang, filterPengguna]);

  const hasActiveFilters = Boolean(search || filterJenis || filterKondisi || filterTahun || filterIndex || filterBidang || filterPengguna);

  // Empat kondisi resmi selalu tampil, termasuk saat jumlahnya nol. Data kosong
  // dipisahkan sebagai peringatan kualitas data, bukan kondisi alat/mesin.
  const kondisiSummary = useMemo(() => summarizeAssetConditions(data), [data]);

  const uniqueJenis = Array.from(new Set(data.map(d => d.jenis).filter(Boolean)));
  const uniqueTahun = Array.from(new Set(data.map(d => String(d.tahun || "")).filter(Boolean))).sort().reverse();
  const uniqueBidang = Array.from(new Set(data.map(d => d.bidang).filter(Boolean))).sort();
  const uniquePengguna = Array.from(new Set(data.map(d => d.pengguna).filter(Boolean))).sort();
  const uniqueKondisi = [
    ...ASSET_CONDITIONS,
    ...(kondisiSummary.unset > 0 ? [ASSET_CONDITION_UNSET] : []),
  ];

  const columns: ColumnDef<Equipment>[] = [
    {
      header: "Nama Barang",
      accessorKey: "nama_aset",
      sortable: true,
      className: "w-[250px]",
      cell: (row) => <span className="font-semibold">{row.nama_aset}</span>,
    },
    {
      header: "Merk",
      accessorKey: "merk",
      sortable: true,
      className: "w-[180px]",
      cell: (row) => (
        <div>
          <div className="font-medium">{row.merk}</div>
          <div className="text-xs text-gray-500">{row.tahun ? `Tahun: ${row.tahun}` : ""}</div>
        </div>
      ),
    },
    {
      header: "Jenis",
      accessorKey: "jenis",
      sortable: true,
      className: "w-[150px]",
    },
    {
      header: "Jumlah",
      accessorKey: "jumlah",
      sortable: true,
      className: "w-[100px]",
      cell: (row) => <span>{row.jumlah} {row.satuan}</span>
    },
    {
      header: "Pengguna",
      accessorKey: "pengguna",
      sortable: true,
      className: "w-[180px]",
    },
    {
      header: "Penanggung Jawab",
      accessorKey: "penanggung_jawab",
      sortable: true,
      className: "w-[180px]",
    },
    {
      header: "Kondisi",
      accessorKey: "kondisi",
      sortable: true,
      className: "w-[150px]",
      cell: (row) => (
        <StatusBadge status={assetConditionLabel(row.kondisi)} />
      ),
    },
    {
      header: "Aksi",
      className: "w-[140px]",
      cell: (row) => (
        <div className="flex justify-end gap-2">
          {row.latitude != null && row.longitude != null && (
            <a 
              href={`https://maps.google.com/?q=${String(row.latitude).replace(',', '.').trim()},${String(row.longitude).replace(',', '.').trim()}`}
              target="_blank" rel="noreferrer"
              className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300 transition-colors"
              title="Buka di Maps"
            >
              <MapPin size={16} />
            </a>
          )}
          <button 
            onClick={(e) => { e.stopPropagation(); setSelectedQR((row as any).qr_url || row.asset_id || "N/A"); }}
            className="p-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 rounded-full text-blue-600 dark:text-blue-400 transition-colors"
            title="Generate QR Code"
          >
            <QrCode size={16} />
          </button>
          {canWriteAssets && <>
            <button onClick={(e) => { e.stopPropagation(); openForm(row); }} className="p-2 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 rounded-full text-amber-600 dark:text-amber-400 transition-colors" title="Edit"><Edit2 size={16} /></button>
            <button onClick={(e) => { e.stopPropagation(); handleDelete((row as any).asset_id || (row as any).id || ""); }} className="p-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 rounded-full text-red-600 dark:text-red-400 transition-colors" title="Hapus"><Trash2 size={16} /></button>
          </>}
        </div>
      ),
    },
  ];

  const renderMobileCard = (row: Equipment) => (
    <div className="space-y-3">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-lg text-gray-900 dark:text-gray-100 truncate">{row.nama_aset}</div>
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{row.merk} {row.tahun ? `(${row.tahun})` : ""}</div>
        </div>
        <div className="flex-shrink-0">
          <StatusBadge status={assetConditionLabel(row.kondisi)} />
        </div>
      </div>
      
      <div className="hidden sm:grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
        <div className="min-w-0">
          <span className="block text-xs text-gray-400 dark:text-gray-500">Jenis</span>
          <span className="truncate block">{row.jenis || "-"}</span>
        </div>
        <div className="min-w-0">
          <span className="block text-xs text-gray-400 dark:text-gray-500">Penanggung Jawab</span>
          <span className="truncate block">{row.penanggung_jawab || "-"}</span>
        </div>
      </div>
      
      <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-800 justify-end">
        {row.latitude != null && row.longitude != null && (
          <a 
            href={`https://maps.google.com/?q=${String(row.latitude).replace(',', '.').trim()},${String(row.longitude).replace(',', '.').trim()}`}
            target="_blank" rel="noreferrer"
            className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300 transition-colors"
            title="Buka di Maps"
          >
            <MapPin size={16} />
          </a>
        )}
        <button 
          onClick={(e) => { e.stopPropagation(); setSelectedQR((row as any).id_aset || (row as any).id || JSON.stringify(row)); }}
          className="p-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 rounded-full text-blue-600 dark:text-blue-400 transition-colors"
          title="Generate QR Code"
        >
          <QrCode size={16} />
        </button>
        {canWriteAssets && <>
          <button onClick={(e) => { e.stopPropagation(); openForm(row); }} className="p-2 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 rounded-full text-amber-600 dark:text-amber-400 transition-colors" title="Edit"><Edit2 size={16} /></button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete((row as any).asset_id || (row as any).id || ""); }} className="p-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 rounded-full text-red-600 dark:text-red-400 transition-colors" title="Hapus"><Trash2 size={16} /></button>
        </>}
      </div>
    </div>
  );

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Data Inventaris</h1>
          <p className="text-sm font-bold text-gray-500 dark:text-gray-400">Manajemen master data alat berat dan permesinan daerah</p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto">
          <div className="col-span-2 sm:col-span-1 flex items-center justify-center min-h-10 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-sm font-medium rounded-full">
            {hasActiveFilters ? `Hasil filter: ${filteredData.length} aset` : `Total: ${data.length} aset`}
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center justify-center gap-2 min-h-10 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-full font-medium text-sm transition-all shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Menyinkronkan..." : "Sinkronisasi"}
          </button>
          {canWriteAssets && <button
            type="button"
            onClick={() => setShowImport(true)}
            className="flex items-center justify-center gap-2 min-h-10 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-medium text-sm transition-all shadow-sm"
          >
            <FileUp size={16} /> Import Data
          </button>}
          {canWriteAssets && <button 
            onClick={() => openForm()}
            className="flex items-center justify-center gap-2 min-h-10 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium text-sm transition-all shadow-sm hover:shadow-md"
          >
            <Plus size={16} />
            Tambah Data
          </button>}
        </div>
      </div>

      <SummaryCards
        items={kondisiSummary.items}
        totalLabel="Total Inventaris"
        totalCount={data.length}
        activeKey={canonKey(filterKondisi)}
        onSelect={(key) => setFilterKondisi(key)}
      />

      {kondisiSummary.unset > 0 && (
        <button
          type="button"
          onClick={() => setFilterKondisi(prev => canonKey(prev) === ASSET_CONDITION_UNSET ? "" : ASSET_CONDITION_UNSET)}
          aria-pressed={canonKey(filterKondisi) === ASSET_CONDITION_UNSET}
          className={`w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
            canonKey(filterKondisi) === ASSET_CONDITION_UNSET
              ? "border-amber-500 bg-amber-100 ring-2 ring-amber-500/30 dark:bg-amber-950/40"
              : "border-amber-200 bg-amber-50 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/20 dark:hover:bg-amber-950/40"
          }`}
        >
          <span className="flex items-start gap-3">
            <AlertCircle size={20} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              <span className="block text-sm font-extrabold text-amber-900 dark:text-amber-200">
                {kondisiSummary.unset} inventaris belum memiliki data kondisi
              </span>
              <span className="block text-xs text-amber-700 dark:text-amber-300">
                Nilai ini tidak dimasukkan ke empat card kondisi. Verifikasi melalui form edit atau Data Cleansing.
              </span>
            </span>
          </span>
          <span className="shrink-0 text-sm font-bold text-amber-800 dark:text-amber-200">
            {canonKey(filterKondisi) === ASSET_CONDITION_UNSET ? "Sembunyikan data" : "Tampilkan data"}
          </span>
        </button>
      )}

      <Card>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          <SearchInput 
            placeholder="Cari barang, kode, spesifikasi..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch("")}
          />
          <select 
            className="w-full rounded-full border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
            value={filterJenis}
            onChange={(e) => setFilterJenis(e.target.value)}
          >
            <option value="">Semua Kategori</option>
            {uniqueJenis.map((j: any) => <option key={j} value={j}>{j}</option>)}
          </select>
          <select className="w-full rounded-full border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 px-4 py-2 text-sm" value={filterTahun} onChange={(e) => setFilterTahun(e.target.value)}>
            <option value="">Semua Tahun</option>{uniqueTahun.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <input className="w-full rounded-full border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 px-4 py-2 text-sm" value={filterIndex} onChange={(e) => setFilterIndex(e.target.value)} placeholder="Filter INDEX..." />
          <select className="w-full rounded-full border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 px-4 py-2 text-sm" value={filterBidang} onChange={(e) => setFilterBidang(e.target.value)}>
            <option value="">Semua Bidang</option>{uniqueBidang.map((value: any) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="w-full rounded-full border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 px-4 py-2 text-sm" value={filterPengguna} onChange={(e) => setFilterPengguna(e.target.value)}>
            <option value="">Semua Pengguna</option>{uniquePengguna.map((value: any) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select 
            className="w-full rounded-full border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
            value={filterKondisi}
            onChange={(e) => setFilterKondisi(e.target.value)}
          >
            <option value="">Semua Kondisi</option>
            {uniqueKondisi.map((k: any) => <option key={k} value={k}>{k}</option>)}
          </select>
        </CardContent>
      </Card>

      <KibImportModal
        open={showImport}
        existing={data}
        onClose={() => setShowImport(false)}
        onError={(message) => toast.error("Import Gagal", message)}
        onImported={async (message) => { setShowImport(false); dataService.clearCache(); await load(true); toast.success("Import Berhasil", message); }}
      />

      {false && selectedRows.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-medium">
            <CheckSquare size={18} />
            <span>{selectedRows.length} Item Terpilih</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Ubah Status:</span>
            <button onClick={() => handleBulkUpdateStatus("BAIK")} className="px-3 py-1.5 bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 rounded-full text-xs font-semibold transition-colors">BAIK</button>
            <button onClick={() => handleBulkUpdateStatus("RUSAK RINGAN")} className="px-3 py-1.5 bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 rounded-full text-xs font-semibold transition-colors">RUSAK RINGAN</button>
            <button onClick={() => handleBulkUpdateStatus("KURANG BAIK")} className="px-3 py-1.5 bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 rounded-full text-xs font-semibold transition-colors">KURANG BAIK</button>
            <button onClick={() => handleBulkUpdateStatus("RUSAK BERAT")} className="px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 rounded-full text-xs font-semibold transition-colors">RUSAK BERAT</button>
            <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1"></div>
            <button onClick={handleBulkDelete} className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full text-xs font-semibold transition-colors shadow-sm">
              <Trash2 size={12} />
              Hapus Massal
            </button>
          </div>
        </div>
      )}

      <DataTable 
        data={filteredData} 
        columns={columns} 
        searchQuery={search}
        renderMobileCard={(row) => renderMobileCard(row)}
        onRowClick={(row) => setSelectedItem(row)} 
      />

      <DetailModal 
        isOpen={!!selectedItem} 
        onClose={() => setSelectedItem(null)} 
        title="Detail Inventaris" 
        data={selectedItem ? {
          "ID Aset": selectedItem.asset_id,
          "Kode Barang": selectedItem.kode_barang,
          "INDEX": selectedItem.kib_index || (selectedItem.unit_indexes?.length ? selectedItem.unit_indexes.join(", ") : "Belum diisi"),
          "Nama Barang": selectedItem.nama_aset,
          "Nama Umum / Merk": selectedItem.merk,
          "Spesifikasi": selectedItem.spesifikasi,
          "Kategori": selectedItem.jenis,
          "OPD": selectedItem.opd,
          "Bidang": selectedItem.bidang,
          "Register": selectedItem.register_barang,
          "Jumlah": selectedItem.jumlah ? `${selectedItem.jumlah} ${selectedItem.satuan || ''}` : '',
          "Kondisi": assetConditionLabel(selectedItem.kondisi),
          "Tahun": selectedItem.tahun,
          "Pengguna": selectedItem.pengguna,
          "Penanggung Jawab": selectedItem.penanggung_jawab,
          "Harga Pembelian": selectedItem.harga_pembelian,
          "Lokasi": selectedItem.lokasi,
          "Mutasi": selectedItem.mutasi,
        } : null} 
      >
        {selectedItem && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Foto Inventaris</span>
              <div className="w-full aspect-video bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden flex items-center justify-center relative group">
                {(() => {
                  const primaryGalleryPhoto = Array.isArray(selectedItem.dokumentasi) ? selectedItem.dokumentasi.find((doc: any) => doc.id === selectedItem.dokumentasi_primary_id || doc.is_primary)?.url : "";
                  const f = primaryGalleryPhoto || (selectedItem as any).foto || (selectedItem as any).foto_alat_mesin || (selectedItem as any).foto_alat__mesin || (selectedItem as any).gambar || "";
                  if (!f) {
                    return (
                      <div className="flex flex-col items-center text-gray-400">
                        <ImageOff size={24} className="mb-2" />
                        <span className="text-xs">Tidak ada foto</span>
                      </div>
                    );
                  }
                  const src = resolveAssetPhotoUrl(f, "alat_mesin");
                  const candidates = resolveAssetPhotoCandidates(f, "alat_mesin");
                  
                  return (
                    <>
                      <SafeImage
                        src={src} 
                        fallbackSrcs={candidates.slice(1)}
                        alt="Foto" 
                        className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity bg-white"
                        onClick={() => setZoomedImage(src)}
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        <ZoomIn className="text-white drop-shadow-md" size={32} />
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
            
            <div className="flex flex-col items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Lokasi Terakhir</span>
              <div className="w-full aspect-video bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden relative group">
                {(() => {
                  let lat, lng;
                  if (selectedItem.latitude != null && selectedItem.longitude != null) {
                    lat = String(selectedItem.latitude).replace(',', '.').trim();
                    lng = String(selectedItem.longitude).replace(',', '.').trim();
                  } else if (selectedItem.lokasi) {
                    const parts = String(selectedItem.lokasi).split(',');
                    if (parts.length >= 2) {
                      lat = parts[0].replace(',', '.').trim();
                      lng = parts[1].replace(',', '.').trim();
                    }
                  }

                  if (lat && lng && lat !== 'null' && lng !== 'null') {
                    return (
                      <>
                        <iframe 
                          width="100%" 
                          height="100%" 
                          frameBorder="0" 
                          style={{ border: 0 }}
                          src={`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`} 
                          allowFullScreen 
                          title="Lokasi"
                          loading="lazy"
                        />
                        <a 
                          href={`https://maps.google.com/?q=${lat},${lng}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-gray-800/90 text-blue-600 dark:text-blue-400 text-xs font-semibold px-3 py-1.5 rounded-full shadow-md backdrop-blur-sm"
                        >
                          Buka di Maps
                        </a>
                      </>
                    );
                  }
                  
                  return (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-gray-400">
                      <MapPin size={24} className="mb-2 opacity-50" />
                      <span className="text-xs">Lokasi tidak tersedia</span>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="flex flex-col items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">QR Code</span>
              <div className="p-3 bg-white rounded-xl shadow-sm border border-gray-100 dark:border-none">
                 <QRCodeSVG value={(selectedItem as any).qr_url || selectedItem.asset_id || "N/A"} size={100} />
              </div>
            </div>
            {Array.isArray(selectedItem.dokumentasi) && selectedItem.dokumentasi.length > 0 && <div className="md:col-span-3 space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-bold"><Paperclip size={16}/>Lampiran & Galeri ({selectedItem.dokumentasi.length})</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{selectedItem.dokumentasi.map((doc: any) => doc.kind === "image" && doc.url ? <button key={doc.id} type="button" onClick={() => setZoomedImage(doc.url)} className="overflow-hidden rounded-xl border bg-gray-100 dark:border-gray-700 dark:bg-gray-800"><SafeImage src={doc.url} alt={doc.name} className="aspect-video w-full object-cover"/><span className="block truncate p-2 text-xs">{doc.name}</span></button> : <a key={doc.id} href={doc.url || doc.external_url} target="_blank" rel="noreferrer" className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center text-xs font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"><Paperclip size={22}/><span className="line-clamp-2">{doc.name}</span><ExternalLink size={13}/></a>)}</div>
            </div>}
          </div>
        )}
      </DetailModal>

      {/* Basic QR Modal */}
      {selectedQR && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-all duration-300" onClick={() => setSelectedQR(null)}>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-8 rounded-[32px] shadow-xl max-w-sm w-full mx-4 flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">QR Code Aset</h3>
            <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-200">
              <QRCodeSVG value={selectedQR} size={200} />
            </div>
            <button 
              onClick={() => setSelectedQR(null)}
              className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-full font-medium transition-all"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Editing Form */}
      <EquipmentFormModal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        initialData={formData}
        employees={employees}
        onSaveSuccess={handleSaveSuccess}
      />

      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setZoomedImage(null)}>
          <button 
            className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full backdrop-blur-md transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setZoomedImage(null);
            }}
          >
            <X size={24} />
          </button>
          <SafeImage
            src={zoomedImage} 
            alt="Zoomed foto" 
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <ConfirmModal state={confirmState} onClose={() => setConfirmState(CONFIRM_CLOSED)} />
    </div>
  );
}
