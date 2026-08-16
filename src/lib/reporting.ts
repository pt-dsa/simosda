import type { Equipment, Pegawai, Vehicle } from "@/types";
import type { PenjagaanEvent } from "@/lib/penjagaan";
import { assetConditionLabel } from "@/lib/assetCondition";

export interface PegawaiReportFilter {
  search: string;
  status: string;
  kategoriPppk: string;
  golongan: string;
  unitKerja: string;
}

export interface AgendaReportFilter {
  search: string;
  kategori: string;
  rentang: string;
  unitKerja: string;
  tanggalMulai: string;
  tanggalSelesai: string;
}

export interface VehicleReportFilter {
  search: string;
  jenis: string;
  kondisi: string;
  tahun: string;
  pengguna: string;
}

export interface EquipmentReportFilter {
  search: string;
  jenis: string;
  kondisi: string;
  tahun: string;
  pengguna: string;
}

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();

export function filterPegawaiReport(rows: Pegawai[], filter: PegawaiReportFilter): Pegawai[] {
  const query = norm(filter.search);
  return rows.filter((row) => {
    const searchable = norm(`${row.nip} ${row.nama} ${row.jabatan} ${row.unit_kerja} ${row.email}`);
    return (!query || searchable.includes(query))
      && (!filter.status || norm(row.status) === norm(filter.status))
      && (!filter.kategoriPppk || norm(row.kategori_pppk) === norm(filter.kategoriPppk))
      && (!filter.golongan || norm(row.golongan) === norm(filter.golongan))
      && (!filter.unitKerja || norm(row.unit_kerja) === norm(filter.unitKerja));
  });
}

export function filterAgendaReport(rows: PenjagaanEvent[], filter: AgendaReportFilter): PenjagaanEvent[] {
  const query = norm(filter.search);
  return rows.filter((row) => {
    const searchable = norm(`${row.nip} ${row.nama} ${row.jabatan} ${row.bidang}`);
    let inRange = true;
    if (filter.rentang === "terlambat") inRange = row.selisihHari < 0;
    if (filter.rentang === "le3") inRange = row.selisihHari >= 0 && row.selisihHari <= 90;
    if (filter.rentang === "le6") inRange = row.selisihHari >= 0 && row.selisihHari <= 182;
    if (filter.rentang === "le12") inRange = row.selisihHari >= 0 && row.selisihHari <= 365;
    return (!query || searchable.includes(query))
      && (!filter.kategori || row.kategori === filter.kategori)
      && (!filter.unitKerja || norm(row.bidang) === norm(filter.unitKerja))
      && (!filter.tanggalMulai || row.tanggal >= filter.tanggalMulai)
      && (!filter.tanggalSelesai || row.tanggal <= filter.tanggalSelesai)
      && inRange;
  });
}

export function filterVehicleReport(rows: Vehicle[], filter: VehicleReportFilter): Vehicle[] {
  const query = norm(filter.search);
  return rows.filter((row) => {
    const searchable = norm(`${row.asset_id} ${row.kode_barang} ${row.no_polisi} ${row.nama_aset} ${row.merk} ${row.pengguna}`);
    return (!query || searchable.includes(query))
      && (!filter.jenis || norm(row.jenis_kendaraan) === norm(filter.jenis))
      && (!filter.kondisi || norm(assetConditionLabel(row.kondisi)) === norm(filter.kondisi))
      && (!filter.tahun || norm(row.tahun) === norm(filter.tahun))
      && (!filter.pengguna || norm(row.pengguna) === norm(filter.pengguna));
  });
}

export function filterEquipmentReport(rows: Equipment[], filter: EquipmentReportFilter): Equipment[] {
  const query = norm(filter.search);
  return rows.filter((row) => {
    const searchable = norm(`${row.asset_id} ${row.kode_barang} ${row.nama_aset} ${row.merk} ${row.jenis} ${row.pengguna} ${row.penanggung_jawab} ${row.lokasi}`);
    return (!query || searchable.includes(query))
      && (!filter.jenis || norm(row.jenis) === norm(filter.jenis))
      && (!filter.kondisi || norm(assetConditionLabel(row.kondisi)) === norm(filter.kondisi))
      && (!filter.tahun || norm(row.tahun) === norm(filter.tahun))
      && (!filter.pengguna || norm(row.pengguna) === norm(filter.pengguna));
  });
}

export function uniqueSorted(values: unknown[]): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "id", { numeric: true }));
}
