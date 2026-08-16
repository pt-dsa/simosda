import React, { useState, useEffect, useMemo } from "react";
import { X, Trash2 } from "lucide-react";
import { Vehicle, Pegawai } from "@/types";
import { EmployeeAutocomplete, isOfficialEmployeeSelection } from "@/components/ui/EmployeeAutocomplete";
import { AssetMediaFields } from "@/components/ui/AssetMediaFields";
import { useToast } from "@/components/ui/Toast";
import { formatNumber } from "@/lib/utils";
import { dataService } from "@/services/dataService";
import { apiService, fileToBase64 } from "@/services/apiService";
import { optionalCoordinatePayload } from "@/lib/coordinates";
import { normalizeAssetText, normalizeAssetNip, optionalAssetNumber, validOptionalAssetNumber } from "@/lib/assetFields";
import {
  ASSET_CONDITIONS,
  isValidAssetCondition,
  normalizeAssetCondition,
} from "@/lib/assetCondition";

interface VehicleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData: Partial<Vehicle>;
  employees: Pegawai[];
  onSaveSuccess: () => void;
}

const vehicleInputCls = "px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm outline-none focus:ring-2 focus:ring-blue-500/40";

export function VehicleFormModal({ isOpen, onClose, initialData, employees, onSaveSuccess }: VehicleFormModalProps) {
  const toast = useToast();
  const [formData, setFormData] = useState<Partial<Vehicle>>({});
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData(initialData || {});
      setPhotoFile(null);
    }
  }, [isOpen]);

  const locations = useMemo(() => {
    const locs = employees.map(e => e.unit_kerja).filter(Boolean) as string[];
    return Array.from(new Set(locs)).sort();
  }, [employees]);

  const currentYear = new Date().getFullYear() + 1;
  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = currentYear; y >= 1990; y--) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!String(formData.no_polisi || "").trim() || !String(formData.nama_aset || "").trim() || !String(formData.merk || "").trim()) {
      toast.warning("Data Belum Lengkap", "Nomor Polisi, Nama Barang, dan Merk wajib diisi.");
      return;
    }

    if (!isOfficialEmployeeSelection(formData.pengguna, formData.pengguna_nip, employees)
      || !isOfficialEmployeeSelection(formData.penanggung_jawab, formData.penanggung_jawab_nip, employees)) {
      toast.error("Nama Pegawai Tidak Valid", "Pengguna dan Penanggung Jawab harus dipilih dari daftar Data ASN / PPPK.");
      return;
    }

    const coordinateResult = optionalCoordinatePayload(formData.latitude, formData.longitude);
    if (!coordinateResult.pair.valid) {
      toast.error("Koordinat Tidak Valid", coordinateResult.pair.error);
      return;
    }
    
    const currentYear = new Date().getFullYear() + 1;
    if (!validOptionalAssetNumber(formData.tahun, { integer: true, min: 1900, max: currentYear })) {
      toast.error("Tahun Tidak Valid", `Tahun pembelian harus berupa angka 1900–${currentYear}, atau dikosongkan.`);
      return;
    }
    if (!validOptionalAssetNumber(formData.harga_pembelian, { min: 0 })) {
      toast.error("Harga Tidak Valid", "Harga pembelian harus berupa angka 0 atau lebih, atau dikosongkan.");
      return;
    }

    const isNew = !formData.asset_id;
    const normalizedCondition = normalizeAssetCondition(formData.kondisi);
    if (isNew && !isValidAssetCondition(normalizedCondition)) {
      toast.error("Kondisi Wajib Dipilih", "Pilih kondisi kendaraan berdasarkan hasil pemeriksaan fisik. Data baru tidak boleh dianggap BAIK secara otomatis.");
      return;
    }

    const payload: Partial<Vehicle> = {
      asset_id: formData.asset_id,
      no_polisi: String(formData.no_polisi || "").trim().toUpperCase(),
      nama_aset: String(formData.nama_aset || "").trim(),
      merk: String(formData.merk || "").trim(),
      tipe: normalizeAssetText(formData.tipe),
      jenis_kendaraan: normalizeAssetText(formData.jenis_kendaraan),
      tahun: optionalAssetNumber(formData.tahun),
      pengguna: normalizeAssetText(formData.pengguna),
      pengguna_nip: normalizeAssetNip(formData.pengguna_nip) as any,
      pengguna_raw: normalizeAssetText(formData.pengguna),
      pengguna_match_status: formData.pengguna_nip ? "matched" : "unmatched",
      penanggung_jawab: normalizeAssetText(formData.penanggung_jawab),
      penanggung_jawab_nip: normalizeAssetNip(formData.penanggung_jawab_nip) as any,
      lokasi: normalizeAssetText(formData.lokasi),
      no_bpkb: normalizeAssetText(formData.no_bpkb),
      no_rangka: normalizeAssetText(formData.no_rangka),
      no_mesin: normalizeAssetText(formData.no_mesin),
      harga_pembelian: optionalAssetNumber(formData.harga_pembelian),
      foto: formData.foto,
      ...coordinateResult.payload,
    };
    if (isValidAssetCondition(normalizedCondition)) {
      payload.kondisi = normalizedCondition;
    }
    if (coordinateResult.pair.empty) {
      delete payload.latitude;
      delete payload.longitude;
    }

    setSaving(true);
    try {
      const result = await dataService.saveVehicle(payload, isNew);
      
      if (photoFile) {
        try {
          const encoded = await fileToBase64(photoFile);
          await apiService.uploadAssetFoto({
            table: "assets_vehicle",
            assetId: result.asset_id,
            holderName: String(payload.pengguna || ""),
            ...encoded
          });
        } catch (photoError: any) {
          toast.warning("Data Tersimpan, Foto Belum Terunggah", photoError?.message || "Silakan pilih foto dan simpan kembali.");
          onSaveSuccess();
          return;
        }
      }

      toast.success(
        isNew ? "Data Kendaraan Berhasil Ditambahkan" : "Perubahan Data Berhasil Disimpan",
        isNew ? "Data kendaraan baru, koordinat, dan foto (jika ada) telah tersimpan." : "Perubahan data dan lokasi telah tersimpan dan tervalidasi."
      );
      onSaveSuccess();
    } catch (err: any) {
      toast.error("Gagal Menyimpan", err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-all duration-300">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-none sm:rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[90dvh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
            {formData.asset_id || (formData as any).id ? "Edit Data Kendaraan" : "Tambah Kendaraan Baru"}
          </h3>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSave} className="flex flex-col overflow-hidden max-h-full">
          <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain grid grid-cols-1 md:grid-cols-2 gap-4">
            {formData.asset_id && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">ID Aset</label>
                <input readOnly value={formData.asset_id} className={`${vehicleInputCls} bg-gray-100 dark:bg-gray-800 opacity-70`} />
              </div>
            )}
            
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Nomor Polisi *</label>
              <input required value={formData.no_polisi || ""} onChange={e => setFormData(prev => ({...prev, no_polisi: e.target.value.toUpperCase()}))} className={vehicleInputCls} placeholder="Contoh: AB 1234 CD" />
            </div>



            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Nama Kendaraan *</label>
              <input required value={formData.nama_aset || ""} onChange={e => setFormData(prev => ({...prev, nama_aset: e.target.value}))} className={vehicleInputCls} placeholder="Contoh: Mobil Dinas Bupati" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Jenis Kendaraan</label>
              <input list="jenis-list" value={formData.jenis_kendaraan || ""} onChange={e => setFormData(prev => ({...prev, jenis_kendaraan: e.target.value}))} className={vehicleInputCls} placeholder="Contoh: Roda 4" />
              <datalist id="jenis-list">
                <option value="Roda 2" />
                <option value="Roda 3" />
                <option value="Roda 4" />
                <option value="Roda 6" />
                <option value="Lebih dari Roda 6" />
              </datalist>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Merk / Model *</label>
              <input required list="merk-list" value={formData.merk || ""} onChange={e => setFormData(prev => ({...prev, merk: e.target.value}))} className={vehicleInputCls} placeholder="Contoh: Toyota Innova" />
              <datalist id="merk-list">
                <option value="Toyota" />
                <option value="Honda" />
                <option value="Daihatsu" />
                <option value="Suzuki" />
                <option value="Mitsubishi" />
                <option value="Nissan" />
                <option value="Yamaha" />
                <option value="Kawasaki" />
                <option value="Isuzu" />
                <option value="Wuling" />
                <option value="Hyundai" />
              </datalist>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Tipe / Kategori</label>
              <input list="tipe-list" value={formData.tipe || ""} onChange={e => setFormData(prev => ({...prev, tipe: e.target.value}))} className={vehicleInputCls} placeholder="Contoh: Minibus" />
              <datalist id="tipe-list">
                <option value="Minibus" />
                <option value="SUV" />
                <option value="MPV" />
                <option value="Sedan" />
                <option value="Hatchback" />
                <option value="Pickup" />
                <option value="Truck" />
                <option value="Sepeda Motor" />
              </datalist>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Tahun Pembuatan</label>
              <select 
                value={formData.tahun ?? ""} 
                onChange={e => setFormData(prev => ({...prev, tahun: e.target.value ? parseInt(e.target.value, 10) : undefined}))} 
                className={`${vehicleInputCls} text-gray-900 dark:text-gray-100`}
              >
                <option value="" className="text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800">-- Pilih Tahun --</option>
                {yearOptions.map(y => (
                  <option key={y} value={y} className="text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800">{y}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Harga Pembelian (Rp)</label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-sm text-gray-500 font-medium">Rp</span>
                <input 
                  type="text" 
                  value={formData.harga_pembelian != null ? formatNumber(Number(formData.harga_pembelian)) : ""} 
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setFormData(prev => ({...prev, harga_pembelian: raw ? parseInt(raw, 10) : undefined}));
                  }} 
                  className={`${vehicleInputCls} pl-9 w-full`} 
                  placeholder="Contoh: 150.000.000" 
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Nomor BPKB</label>
              <input value={formData.no_bpkb || ""} onChange={e => setFormData(prev => ({...prev, no_bpkb: e.target.value}))} className={vehicleInputCls} placeholder="Nomor BPKB Kendaraan" />
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Nomor Mesin</label>
              <input value={formData.no_mesin || ""} onChange={e => setFormData(prev => ({...prev, no_mesin: e.target.value}))} className={vehicleInputCls} placeholder="Nomor Mesin" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Nomor Rangka</label>
              <input value={formData.no_rangka || ""} onChange={e => setFormData(prev => ({...prev, no_rangka: e.target.value}))} className={vehicleInputCls} placeholder="Nomor Rangka" />
            </div>

            <div className="md:col-span-2">
              <EmployeeAutocomplete
                label="Pengguna / Nama Pemegang"
                value={String(formData.pengguna || "")}
                selectedNip={String(formData.pengguna_nip || "")}
                employees={employees}
                onChange={(pengguna) => setFormData((previous) => ({ ...previous, pengguna, pengguna_nip: "" }))}
                onSelect={(employee) => employee && setFormData((previous) => ({ ...previous, pengguna: employee.nama, pengguna_nip: employee.nip }))}
                placeholder="Cari nama, NIP, atau jabatan pegawai..."
              />
            </div>
            
            <div className="md:col-span-2">
              <EmployeeAutocomplete
                label="Penanggung Jawab"
                value={String(formData.penanggung_jawab || "")}
                selectedNip={String(formData.penanggung_jawab_nip || "")}
                employees={employees}
                onChange={(penanggung_jawab) => setFormData((previous) => ({ ...previous, penanggung_jawab, penanggung_jawab_nip: "" }))}
                onSelect={(employee) => employee && setFormData((previous) => ({ ...previous, penanggung_jawab: employee.nama, penanggung_jawab_nip: employee.nip }))}
                placeholder="Cari nama, NIP, atau jabatan pegawai..."
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Kondisi {!formData.asset_id && <span className="text-red-500">*</span>}</label>
              <select 
                required={!formData.asset_id} 
                value={isValidAssetCondition(formData.kondisi) ? normalizeAssetCondition(formData.kondisi) : ""} 
                onChange={e => setFormData(prev => ({...prev, kondisi: e.target.value}))} 
                className={`${vehicleInputCls} text-gray-900 dark:text-gray-100`}
              >
                <option value="" className="text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800">-- Pilih kondisi berdasarkan fisik --</option>
                {ASSET_CONDITIONS.map((condition) => (
                  <option key={condition} value={condition} className="text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800">
                    {condition}
                  </option>
                ))}
              </select>
              {!isValidAssetCondition(formData.kondisi) && formData.asset_id && (
                <p className="text-[11px] text-amber-600">Data lama belum memiliki kondisi atau nilainya tidak baku. Pilih kondisi setelah diverifikasi fisik; field lain tetap dapat disimpan tanpa mengubah kondisi.</p>
              )}
            </div>

            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-xs font-medium text-gray-500">Lokasi / Unit Kerja</label>
              <input list="lokasi-list" value={formData.lokasi || ""} onChange={e => setFormData(prev => ({...prev, lokasi: e.target.value}))} className={vehicleInputCls} placeholder="Lokasi penempatan kendaraan" />
              <datalist id="lokasi-list">
                {locations.map(loc => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
            </div>



            <div className="md:col-span-2 text-xs font-bold uppercase tracking-wider text-blue-600 border-b border-blue-100 pb-2 mt-2">
              Lokasi Koordinat dan Media
            </div>

            <AssetMediaFields
              latitude={formData.latitude}
              longitude={formData.longitude}
              existingPhoto={formData.foto}
              selectedFile={photoFile}
              onCoordinatesChange={(latitude, longitude) => setFormData(prev => ({ ...prev, latitude, longitude }))}
              onFileChange={setPhotoFile}
              onError={(message) => toast.error("Lokasi/Media Belum Siap", message)}
              photoLabel="Foto Kendaraan"
              autoLocate={!formData.asset_id}
            />

          </div>
          
          <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3 safe-area-bottom pb-24 sm:pb-4">
            <button 
              type="button" 
              disabled={saving}
              onClick={onClose}
              className="flex-1 sm:flex-none min-h-11 px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-full font-medium text-sm transition-all border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 disabled:opacity-50"
            >
              Batal
            </button>
            <button 
              type="submit" 
              disabled={saving}
              className="flex-1 sm:flex-none min-h-11 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium text-sm transition-all disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
