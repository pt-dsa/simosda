import React, { useContext, useEffect, useMemo, useState } from "react";
import { Download, Printer, RefreshCw, Search, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { dataService } from "@/services/dataService";
import Papa from "papaparse";
import { useToast } from "@/components/ui/Toast";
import { buildPenjagaanEvents, type PenjagaanEvent } from "@/lib/penjagaan";
import type { Equipment, Pegawai, Vehicle } from "@/types";
import logoKota from "@/assets/logo_kop_dcktr.png";
import logoSimosda from "@/assets/logo_kota_tangerang_selatan.png";
import kopHeaderText from "@/assets/kop_header_text.svg";
import { employmentStatusLabel } from "@/lib/employmentStatus";
import { AuthContext } from "@/components/layout/AppShell";
import { can } from "@/lib/rbac";
import {
  filterAgendaReport,
  filterEquipmentReport,
  filterPegawaiReport,
  filterVehicleReport,
  uniqueSorted,
  type AgendaReportFilter,
  type EquipmentReportFilter,
  type PegawaiReportFilter,
  type VehicleReportFilter,
} from "@/lib/reporting";
import { assetConditionLabel } from "@/lib/assetCondition";

const inputCls = "w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/50 outline-none focus:ring-2 focus:ring-blue-500/30";

const initialPegawaiFilter: PegawaiReportFilter = { search: "", status: "", kategoriPppk: "", golongan: "", unitKerja: "" };
const initialAgendaFilter: AgendaReportFilter = { search: "", kategori: "", rentang: "", unitKerja: "", tanggalMulai: "", tanggalSelesai: "" };
const initialVehicleFilter: VehicleReportFilter = { search: "", jenis: "", kondisi: "", tahun: "", pengguna: "" };
const initialEquipmentFilter: EquipmentReportFilter = { search: "", jenis: "", kondisi: "", tahun: "", pengguna: "" };
type PrintScope = "pegawai" | "agenda" | "vehicle" | "equipment" | "all";

function employeeRows(rows: Pegawai[]) {
  return rows.map((p) => ({
    nip: p.nip, nama: p.nama, status: employmentStatusLabel(p), golongan: p.golongan,
    jabatan: p.jabatan, unit_kerja: p.unit_kerja, tanggal_lahir: p.tgl_lahir,
    tmt_golongan: p.tgl_mulai_golongan, tmt_jabatan: p.tgl_mulai_jabatan,
    masa_kerja_tahun: p.masa_kerja_tahun, masa_kerja_bulan: p.masa_kerja_bulan,
    pendidikan: p.tingkat, jurusan: p.pendidikan_jurusan, universitas: p.universitas,
    tahun_lulus: p.tahun_lulus, riwayat_diklat: p.riwayat_diklat,
    tahun_diklat: p.tahun_diklat, kontak: p.kontak, email: p.email, keterangan: p.keterangan,
  }));
}

function agendaRows(rows: PenjagaanEvent[]) {
  return rows.map((a) => ({
    nip: a.nip, nama: a.nama, status: a.status, golongan: a.golongan,
    jabatan: a.jabatan, unit_kerja: a.bidang, kategori_agenda: a.kategori,
    jenis_agenda: a.kategoriLabel, tanggal_tenggat_waktu: a.tanggal,
    sisa_hari: a.selisihHari, indikator: a.bucket,
  }));
}

function vehicleRows(rows: Vehicle[]) {
  return rows.map((v) => ({
    asset_id: v.asset_id, kode_barang: v.kode_barang, nama_aset: v.nama_aset,
    nomor_polisi: v.no_polisi, merk: v.merk, tipe: v.tipe,
    jenis_kendaraan: v.jenis_kendaraan, tahun: v.tahun, pengguna: v.pengguna,
    penanggung_jawab: v.penanggung_jawab, lokasi: v.lokasi || v.unit_kerja,
    kondisi: assetConditionLabel(v.kondisi), kilometer: v.km_kendaraan, kapasitas_mesin: v.kapasitas_mesin,
    nomor_bpkb: v.no_bpkb, nomor_rangka: v.no_rangka, nomor_mesin: v.no_mesin,
    harga_pembelian: v.harga_pembelian, latitude: v.latitude, longitude: v.longitude, foto: v.foto,
  }));
}

function equipmentRows(rows: Equipment[]) {
  return rows.map((item) => ({
    asset_id: item.asset_id, kode_barang: item.kode_barang, nama_barang: item.nama_aset,
    merk: item.merk, jenis: item.jenis, jumlah: item.jumlah, satuan: item.satuan,
    tahun: item.tahun, pengguna: item.pengguna, penanggung_jawab: item.penanggung_jawab,
    lokasi: item.lokasi, kondisi: assetConditionLabel(item.kondisi), harga_pembelian: item.harga_pembelian,
    latitude: item.latitude, longitude: item.longitude, foto: item.foto,
  }));
}

function employeePrintRows(rows: Pegawai[]) {
  return rows.map((p) => ({
    NIP: p.nip,
    Nama: p.nama,
    Status: employmentStatusLabel(p),
    "Gol.": p.golongan,
    Jabatan: p.jabatan,
    "Unit Kerja": p.unit_kerja,
    "Tanggal Lahir": p.tgl_lahir,
    "TMT Golongan": p.tgl_mulai_golongan,
    "TMT Jabatan": p.tgl_mulai_jabatan,
    "Masa Kerja": `${p.masa_kerja_tahun || 0} th ${p.masa_kerja_bulan || 0} bln`,
    Pendidikan: [p.tingkat, p.pendidikan_jurusan, p.universitas].filter(Boolean).join(" · "),
    Kontak: [p.kontak, p.email].filter(Boolean).join(" · "),
  }));
}

function agendaPrintRows(rows: PenjagaanEvent[]) {
  return rows.map((a) => ({
    NIP: a.nip, Nama: a.nama, Status: a.status, "Gol.": a.golongan,
    Jabatan: a.jabatan, "Unit Kerja": a.bidang, Agenda: a.kategoriLabel,
    "Tenggat Waktu": a.tanggal, "Sisa Hari": a.selisihHari,
    Indikator: a.isOverdue ? "Terlewat" : a.bucket,
  }));
}

function vehiclePrintRows(rows: Vehicle[]) {
  return rows.map((v) => ({
    "Nomor Polisi": v.no_polisi, "Kode Barang": v.kode_barang, "Nama Aset": v.nama_aset,
    "Merk/Model": [v.merk, v.tipe].filter(Boolean).join(" · "), Jenis: v.jenis_kendaraan,
    Tahun: v.tahun, Pengguna: v.pengguna, "Penanggung Jawab": v.penanggung_jawab,
    Lokasi: v.lokasi || v.unit_kerja, Kondisi: assetConditionLabel(v.kondisi),
    Kilometer: v.km_kendaraan, "Kapasitas Mesin": v.kapasitas_mesin,
  }));
}

function equipmentPrintRows(rows: Equipment[]) {
  return rows.map((item) => ({
    "Kode Barang": item.kode_barang, "Nama Barang": item.nama_aset, Merk: item.merk,
    Jenis: item.jenis, Jumlah: `${item.jumlah || 0} ${item.satuan || "Unit"}`,
    Tahun: item.tahun, Pengguna: item.pengguna, "Penanggung Jawab": item.penanggung_jawab,
    Lokasi: item.lokasi, Kondisi: assetConditionLabel(item.kondisi), "Harga Pembelian": item.harga_pembelian,
  }));
}

function localDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function filterDescription(filter: Record<string, string>): string {
  const active = Object.entries(filter).filter(([, value]) => String(value || "").trim());
  return active.length ? active.map(([key, value]) => `${key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}: ${value}`).join(" · ") : "Tanpa filter (seluruh data aktif)";
}

function filterSlug(filter: Record<string, string>): string {
  const values = Object.values(filter).map((value) => String(value || "").trim()).filter(Boolean);
  if (!values.length) return "SEMUA";
  return values.join("_").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "FILTER";
}

function letterheadHtml(): string {
  return `<div class="letterhead"><div class="letterhead-inner"><img class="letterhead-logo" src="${escapeHtml(logoKota)}" alt="Logo Kota Tangerang Selatan"><img class="letterhead-text" src="${escapeHtml(kopHeaderText)}" alt="Pemerintah Kota Tangerang Selatan, Dinas Cipta Karya dan Tata Ruang"></div></div><div class="letterhead-lines"><span></span><span></span></div>`;
}

function reportHeadingHtml(): string {
  return `<div class="report-title">Rekapitulasi Laporan SIMOSDA</div><div class="meta">Dicetak: ${escapeHtml(new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }))} WIB</div>`;
}

function rowsToPrintTable(title: string, rows: Record<string, unknown>[], filterText: string): string {
  if (!rows.length) return `<section>${letterheadHtml()}${reportHeadingHtml()}<h2>${escapeHtml(title)}</h2><p><b>Filter:</b> ${escapeHtml(filterText)}</p><p>Tidak ada data sesuai filter.</p></section>`;
  const keys = Object.keys(rows[0]);
  const head = keys.map((key) => `<th>${escapeHtml(key.replace(/_/g, " "))}</th>`).join("");
  const body = rows.map((row) => `<tr>${keys.map((key) => `<td>${escapeHtml(row[key])}</td>`).join("")}</tr>`).join("");
  return `<section>${letterheadHtml()}${reportHeadingHtml()}<h2>${escapeHtml(title)} <small>(${rows.length} data)</small></h2><p class="filter"><b>Filter:</b> ${escapeHtml(filterText)}</p><table data-columns="${keys.length}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></section>`;
}

export default function Laporan() {
  const toast = useToast();
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [pegawai, setPegawai] = useState<Pegawai[]>([]);
  const [agenda, setAgenda] = useState<PenjagaanEvent[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [pegawaiFilter, setPegawaiFilter] = useState(initialPegawaiFilter);
  const [agendaFilter, setAgendaFilter] = useState(initialAgendaFilter);
  const [vehicleFilter, setVehicleFilter] = useState(initialVehicleFilter);
  const [equipmentFilter, setEquipmentFilter] = useState(initialEquipmentFilter);
  const [printOpen, setPrintOpen] = useState(false);
  const [printScope, setPrintScope] = useState<PrintScope>("pegawai");

  async function load() {
    setLoading(true);
    try {
      dataService.clearCache();
      const [employeeData, vehicleData, equipmentData] = await Promise.all([
        dataService.getPegawai(), dataService.getVehicles(), dataService.getEquipment(),
      ]);
      setPegawai(employeeData as Pegawai[]);
      setAgenda(buildPenjagaanEvents(employeeData));
      setVehicles(vehicleData as Vehicle[]);
      setEquipment(equipmentData as Equipment[]);
    } catch (error: any) {
      toast.error("Data Laporan Belum Tersedia", String(error?.message || error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filteredPegawai = useMemo(() => filterPegawaiReport(pegawai, pegawaiFilter), [pegawai, pegawaiFilter]);
  const filteredAgenda = useMemo(() => filterAgendaReport(agenda, agendaFilter), [agenda, agendaFilter]);
  const filteredVehicles = useMemo(() => filterVehicleReport(vehicles, vehicleFilter), [vehicles, vehicleFilter]);
  const filteredEquipment = useMemo(() => filterEquipmentReport(equipment, equipmentFilter), [equipment, equipmentFilter]);

  function exportCsv(rows: Record<string, unknown>[], name: string) {
    if (!can(user?.role, "data.export")) {
      toast.error("Akses Ditolak", "Role Pegawai tidak memiliki izin mengunduh CSV.");
      return;
    }
    if (!rows.length) {
      toast.warning("Ekspor Kosong", "Tidak ada data yang sesuai dengan filter aktif.");
      return;
    }
    setIsExporting(true);
    try {
      const csv = `\uFEFF${Papa.unparse(rows)}`;
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `SIMOSDA_${name}_${localDateKey()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Ekspor Berhasil", `${rows.length} data berhasil diunduh.`);
    } catch {
      toast.error("Ekspor Gagal", "CSV belum berhasil dibuat. Silakan coba kembali.");
    } finally {
      setIsExporting(false);
    }
  }

  function handlePrint(scope: PrintScope) {
    const sections: string[] = [];
    if (scope === "pegawai" || scope === "all") sections.push(rowsToPrintTable("Data ASN / PPPK", employeePrintRows(filteredPegawai), filterDescription(pegawaiFilter as unknown as Record<string, string>)));
    if (scope === "agenda" || scope === "all") sections.push(rowsToPrintTable("Buku Penjagaan", agendaPrintRows(filteredAgenda), filterDescription(agendaFilter as unknown as Record<string, string>)));
    if (scope === "vehicle" || scope === "all") sections.push(rowsToPrintTable("Data Kendaraan", vehiclePrintRows(filteredVehicles), filterDescription(vehicleFilter as unknown as Record<string, string>)));
    if (scope === "equipment" || scope === "all") sections.push(rowsToPrintTable("Data Inventaris", equipmentPrintRows(filteredEquipment), filterDescription(equipmentFilter as unknown as Record<string, string>)));
    const content = `<!doctype html><html><head><meta charset="utf-8"><title>Rekap SIMOSDA</title><style>
      @page{size:A4 landscape;margin:9mm 8mm 10mm}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:8.2px;line-height:1.25}p{color:#334155;margin:4px 0 7px}section{break-before:page;page-break-before:always;width:100%}section:first-of-type{break-before:auto;page-break-before:auto}h2{font-size:13px;margin:10px 0 3px}small{font-weight:normal;color:#64748b}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tfoot{display:table-footer-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{border:0.7px solid #64748b;padding:3.5px 4px;text-align:left;vertical-align:top;word-break:normal;overflow-wrap:anywhere;white-space:normal}th{background:rgba(223, 234, 247, 0.7);text-transform:none;font-weight:800;text-align:center;vertical-align:middle}tbody tr:nth-child(even){background:rgba(248, 250, 252, 0.7)}td:first-child{white-space:nowrap}table[data-columns="12"]{font-size:7.4px}table[data-columns="11"]{font-size:7.7px}.letterhead{display:flex;align-items:center;justify-content:center;min-height:106px;width:100%}.letterhead-inner{display:grid;grid-template-columns:106px 700px;align-items:center;justify-content:center;column-gap:0;width:min(100%,806px);margin:0 auto}.letterhead-logo{width:106px;height:106px;object-fit:contain;display:block}.letterhead-text{width:700px;height:auto;object-fit:contain;display:block}.letterhead-lines{margin:3px 0 8px}.letterhead-lines span{display:block;border-top:2.4px solid #000;margin-top:2px}.letterhead-lines span+span{border-top-width:.8px}.report-title{font-size:15px;font-weight:900;margin:7px 0 1px}.meta{font-size:8px;color:#475569;margin-bottom:7px}.filter{padding:4px 6px;background:#f1f5f9;border-left:3px solid #2563eb}
      .watermark-img { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 450px; height: auto; object-fit: contain; opacity: 0.08; z-index: 9999; pointer-events: none; mix-blend-mode: multiply; }
    </style></head><body>
      <img src="${escapeHtml(logoSimosda)}" class="watermark-img" alt="watermark" />
      ${sections.join("")}
    </body></html>`;
    const frame = document.createElement("iframe");
    frame.title = "Cetak Rekap SIMOSDA";
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.opacity = "0";
    frame.style.border = "0";
    frame.onload = () => {
      const target = frame.contentWindow;
      if (!target) {
        frame.remove();
        toast.error("Cetak Gagal", "Dokumen cetak belum dapat dibuka. Silakan coba kembali.");
        return;
      }
      const images = Array.from(frame.contentDocument?.images || []);
      const imagesReady = Promise.all(images.map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }));
      const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 3_000));
      void Promise.race([imagesReady, timeout]).then(() => {
        target.focus();
        target.print();
      });
      window.setTimeout(() => frame.remove(), 60_000);
    };
    frame.srcdoc = content;
    document.body.appendChild(frame);
    setPrintOpen(false);
    toast.success("Dokumen Cetak Siap", "Pratinjau dibuka sesuai kategori dan filter yang dipilih.");
  }

  const options = {
    statuses: uniqueSorted(pegawai.map((p) => p.status)),
    golongan: uniqueSorted(pegawai.map((p) => p.golongan)),
    units: uniqueSorted(pegawai.map((p) => p.unit_kerja)),
    agendaUnits: uniqueSorted(agenda.map((a) => a.bidang)),
    vehicleTypes: uniqueSorted(vehicles.map((v) => v.jenis_kendaraan)),
    conditions: uniqueSorted(vehicles.map((v) => assetConditionLabel(v.kondisi))),
    years: uniqueSorted(vehicles.map((v) => v.tahun)),
    users: uniqueSorted(vehicles.map((v) => v.pengguna)),
    equipmentTypes: uniqueSorted(equipment.map((item) => item.jenis)),
    equipmentConditions: uniqueSorted(equipment.map((item) => assetConditionLabel(item.kondisi))),
    equipmentYears: uniqueSorted(equipment.map((item) => item.tahun)),
    equipmentUsers: uniqueSorted(equipment.map((item) => item.pengguna)),
  };

  const searchInput = (value: string, onChange: (value: string) => void, placeholder: string) => (
    <div className="relative"><Search size={13} className="absolute left-3 top-2.5 text-gray-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} pl-8`} />
    </div>
  );

  const selectInput = (value: string, onChange: (value: string) => void, allLabel: string, values: string[], labels?: Record<string, string>) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">{allLabel}</option>{values.map((item) => <option key={item} value={item}>{labels?.[item] || item}</option>)}
    </select>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div><h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Rekapitulasi Laporan</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Filter data terlebih dahulu; CSV dan cetak mengikuti hasil filter aktif.</p></div>
        <div className="flex gap-2">
          <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 px-4 py-2 neuglass text-sm font-medium rounded-full disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Refresh</button>
          <button onClick={() => setPrintOpen(true)} disabled={loading} className="flex items-center gap-2 px-4 py-2 neuglass text-sm font-bold rounded-full disabled:opacity-50"><Printer size={18} />Cetak Halaman</button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-4 gap-5 items-start">
        <Card><CardHeader><CardTitle className="text-lg">Data ASN / PPPK</CardTitle><p className="text-xs text-gray-500">{filteredPegawai.length} dari {pegawai.length} data</p></CardHeader>
          <CardContent className="space-y-2.5">
            {searchInput(pegawaiFilter.search, (search) => setPegawaiFilter({ ...pegawaiFilter, search }), "Nama, NIP, jabatan...")}
            <div className="grid grid-cols-2 gap-2">
              {selectInput(pegawaiFilter.status, (status) => setPegawaiFilter({ ...pegawaiFilter, status }), "Semua Status", options.statuses)}
              {selectInput(pegawaiFilter.kategoriPppk, (kategoriPppk) => setPegawaiFilter({ ...pegawaiFilter, kategoriPppk }), "Semua Kategori PPPK", ["penuh_waktu", "paruh_waktu"], { penuh_waktu: "PPPK Penuh Waktu", paruh_waktu: "PPPK Paruh Waktu" })}
              {selectInput(pegawaiFilter.golongan, (golongan) => setPegawaiFilter({ ...pegawaiFilter, golongan }), "Semua Golongan", options.golongan)}
              {selectInput(pegawaiFilter.unitKerja, (unitKerja) => setPegawaiFilter({ ...pegawaiFilter, unitKerja }), "Semua Unit Kerja", options.units)}
            </div>
            <button onClick={() => exportCsv(employeeRows(filteredPegawai), `Data_ASN_PPPK_${filterSlug(pegawaiFilter as unknown as Record<string, string>)}`)} disabled={isExporting || loading} className="w-full flex justify-center items-center gap-2 px-4 py-2.5 neuglass-pressed text-blue-700 font-semibold rounded-full disabled:opacity-50"><Download size={17} />Unduh CSV Hasil Filter</button>
          </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-lg">Buku Penjagaan</CardTitle><p className="text-xs text-gray-500">{filteredAgenda.length} dari {agenda.length} agenda</p></CardHeader>
          <CardContent className="space-y-2.5">
            {searchInput(agendaFilter.search, (search) => setAgendaFilter({ ...agendaFilter, search }), "Nama, NIP, jabatan...")}
            <div className="grid grid-cols-2 gap-2">
              {selectInput(agendaFilter.kategori, (kategori) => setAgendaFilter({ ...agendaFilter, kategori }), "Semua Agenda", ["KGB", "PANGKAT", "BUP"], { KGB: "KGB", PANGKAT: "Kenaikan Pangkat", BUP: "BUP/Pensiun" })}
              {selectInput(agendaFilter.rentang, (rentang) => setAgendaFilter({ ...agendaFilter, rentang }), "Semua Rentang", ["terlambat", "le3", "le6", "le12"], { terlambat: "Terlewat", le3: "≤ 3 Bulan", le6: "≤ 6 Bulan", le12: "≤ 12 Bulan" })}
              <div className="col-span-2">{selectInput(agendaFilter.unitKerja, (unitKerja) => setAgendaFilter({ ...agendaFilter, unitKerja }), "Semua Unit Kerja", options.agendaUnits)}</div>
              <input type="date" title="Tanggal mulai" value={agendaFilter.tanggalMulai} onChange={(e) => setAgendaFilter({ ...agendaFilter, tanggalMulai: e.target.value })} className={inputCls} />
              <input type="date" title="Tanggal selesai" value={agendaFilter.tanggalSelesai} onChange={(e) => setAgendaFilter({ ...agendaFilter, tanggalSelesai: e.target.value })} className={inputCls} />
            </div>
            <button onClick={() => exportCsv(agendaRows(filteredAgenda), `Buku_Penjagaan_${filterSlug(agendaFilter as unknown as Record<string, string>)}`)} disabled={isExporting || loading} className="w-full flex justify-center items-center gap-2 px-4 py-2.5 neuglass-pressed text-blue-700 font-semibold rounded-full disabled:opacity-50"><Download size={17} />Unduh CSV Hasil Filter</button>
          </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-lg">Data Kendaraan</CardTitle><p className="text-xs text-gray-500">{filteredVehicles.length} dari {vehicles.length} data</p></CardHeader>
          <CardContent className="space-y-2.5">
            {searchInput(vehicleFilter.search, (search) => setVehicleFilter({ ...vehicleFilter, search }), "Nopol, merk, pengguna...")}
            <div className="grid grid-cols-2 gap-2">
              {selectInput(vehicleFilter.jenis, (jenis) => setVehicleFilter({ ...vehicleFilter, jenis }), "Semua Jenis", options.vehicleTypes)}
              {selectInput(vehicleFilter.kondisi, (kondisi) => setVehicleFilter({ ...vehicleFilter, kondisi }), "Semua Kondisi", options.conditions)}
              {selectInput(vehicleFilter.tahun, (tahun) => setVehicleFilter({ ...vehicleFilter, tahun }), "Semua Tahun", options.years)}
              {selectInput(vehicleFilter.pengguna, (pengguna) => setVehicleFilter({ ...vehicleFilter, pengguna }), "Semua Pengguna", options.users)}
            </div>
            <button onClick={() => exportCsv(vehicleRows(filteredVehicles), `Data_Kendaraan_${filterSlug(vehicleFilter as unknown as Record<string, string>)}`)} disabled={isExporting || loading} className="w-full flex justify-center items-center gap-2 px-4 py-2.5 neuglass-pressed text-blue-700 font-semibold rounded-full disabled:opacity-50"><Download size={17} />Unduh CSV Hasil Filter</button>
          </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-lg">Data Inventaris</CardTitle><p className="text-xs text-gray-500">{filteredEquipment.length} dari {equipment.length} data</p></CardHeader>
          <CardContent className="space-y-2.5">
            {searchInput(equipmentFilter.search, (search) => setEquipmentFilter({ ...equipmentFilter, search }), "Nama barang, merk, pengguna...")}
            <div className="grid grid-cols-2 gap-2">
              {selectInput(equipmentFilter.jenis, (jenis) => setEquipmentFilter({ ...equipmentFilter, jenis }), "Semua Jenis", options.equipmentTypes)}
              {selectInput(equipmentFilter.kondisi, (kondisi) => setEquipmentFilter({ ...equipmentFilter, kondisi }), "Semua Kondisi", options.equipmentConditions)}
              {selectInput(equipmentFilter.tahun, (tahun) => setEquipmentFilter({ ...equipmentFilter, tahun }), "Semua Tahun", options.equipmentYears)}
              {selectInput(equipmentFilter.pengguna, (pengguna) => setEquipmentFilter({ ...equipmentFilter, pengguna }), "Semua Pengguna", options.equipmentUsers)}
            </div>
            <button onClick={() => exportCsv(equipmentRows(filteredEquipment), `Data_Inventaris_${filterSlug(equipmentFilter as unknown as Record<string, string>)}`)} disabled={isExporting || loading} className="w-full flex justify-center items-center gap-2 px-4 py-2.5 neuglass-pressed text-blue-700 font-semibold rounded-full disabled:opacity-50"><Download size={17} />Unduh CSV Hasil Filter</button>
          </CardContent></Card>
      </div>

      {printOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-sm" onClick={() => setPrintOpen(false)}>
          <div className="w-full max-w-lg rounded-none sm:rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden max-h-[100dvh] sm:max-h-[90dvh] flex flex-col" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
              <div><h2 className="text-lg font-bold text-gray-900 dark:text-white">Pilih Data yang Akan Dicetak</h2><p className="text-xs text-gray-500 mt-0.5">Hasil cetak mengikuti filter aktif pada setiap kategori.</p></div>
              <button onClick={() => setPrintOpen(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"><X size={19} /></button>
            </div>
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">Kategori Cetak</label>
              <select value={printScope} onChange={(event) => setPrintScope(event.target.value as PrintScope)} className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-semibold">
                <option value="pegawai">Data ASN / PPPK</option>
                <option value="agenda">Buku Penjagaan</option>
                <option value="vehicle">Data Kendaraan</option>
                <option value="equipment">Data Inventaris</option>
                <option value="all">Seluruh Data</option>
              </select>
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-4 text-sm text-gray-700 dark:text-gray-200 space-y-1">
                {(printScope === "pegawai" || printScope === "all") && <div><p><b>Data ASN/PPPK:</b> {filteredPegawai.length} data</p><p className="text-xs text-gray-500">{filterDescription(pegawaiFilter as unknown as Record<string, string>)}</p></div>}
                {(printScope === "agenda" || printScope === "all") && <div><p><b>Buku Penjagaan:</b> {filteredAgenda.length} agenda</p><p className="text-xs text-gray-500">{filterDescription(agendaFilter as unknown as Record<string, string>)}</p></div>}
                {(printScope === "vehicle" || printScope === "all") && <div><p><b>Data Kendaraan:</b> {filteredVehicles.length} data</p><p className="text-xs text-gray-500">{filterDescription(vehicleFilter as unknown as Record<string, string>)}</p></div>}
                {(printScope === "equipment" || printScope === "all") && <div><p><b>Data Inventaris:</b> {filteredEquipment.length} data</p><p className="text-xs text-gray-500">{filterDescription(equipmentFilter as unknown as Record<string, string>)}</p></div>}
              </div>
            </div>
            <div className="safe-area-bottom px-4 sm:px-5 py-4 border-t border-gray-200 dark:border-gray-800 grid grid-cols-2 sm:flex sm:justify-end gap-2">
              <button onClick={() => setPrintOpen(false)} className="min-h-11 px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-bold">Batal</button>
              <button onClick={() => handlePrint(printScope)} className="min-h-11 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold"><Printer size={16} />Buka Pratinjau</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
