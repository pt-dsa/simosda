import React, { useState, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
import { Equipment, Pegawai } from "@/types";
import { EmployeeAutocomplete, isOfficialEmployeeSelection } from "@/components/ui/EmployeeAutocomplete";
import { AssetMediaFields } from "@/components/ui/AssetMediaFields";
import { useToast } from "@/components/ui/Toast";
import { dataService } from "@/services/dataService";
import { apiService, fileToBase64 } from "@/services/apiService";
import { optionalCoordinatePayload } from "@/lib/coordinates";
import { normalizeAssetText, normalizeAssetNip, optionalAssetNumber, validOptionalAssetNumber } from "@/lib/assetFields";
import {
  ASSET_CONDITIONS,
  isValidAssetCondition,
  normalizeAssetCondition,
} from "@/lib/assetCondition";

interface EquipmentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData: Partial<Equipment>;
  employees: Pegawai[];
  onSaveSuccess: () => void;
}

export function EquipmentFormModal({ isOpen, onClose, initialData, employees, onSaveSuccess }: EquipmentFormModalProps) {
  const toast = useToast();
  const [formData, setFormData] = useState<Partial<Equipment>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);

  useEffect(() => {
    if (isOpen) {
      setFormData(initialData || {});
      setPhotoFile(null);
      setAttachmentFiles([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;
  const canWriteAssets = true; // Modal is only opened if user has permission

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!String(formData.kode_barang || "").trim() || !String(formData.nama_aset || "").trim() || !String(formData.merk || "").trim()) {
      toast.warning("Data Belum Lengkap", "Kode Barang, Nama Barang, dan Merk wajib diisi.");
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
    if (!validOptionalAssetNumber(formData.jumlah, { min: 0.01 })) {
      toast.error("Jumlah Tidak Valid", "Jumlah harus lebih besar dari 0.");
      return;
    }
    if (!validOptionalAssetNumber(formData.harga_pembelian, { min: 0 })) {
      toast.error("Harga Tidak Valid", "Harga pembelian harus berupa angka 0 atau lebih, atau dikosongkan.");
      return;
    }
    const unitIndexes = Array.isArray(formData.unit_indexes) ? formData.unit_indexes.map((value) => String(value).trim()).filter(Boolean) : [];
    if (new Set(unitIndexes.map((value) => value.toUpperCase())).size !== unitIndexes.length) {
      toast.error("INDEX Ganda", "Daftar INDEX per unit tidak boleh berisi nilai yang sama.");
      return;
    }
    if (unitIndexes.length > Number(formData.jumlah || 1)) {
      toast.error("Jumlah INDEX Tidak Valid", "Jumlah INDEX per unit tidak boleh melebihi jumlah barang.");
      return;
    }
    const isNew = !formData.asset_id;
    const normalizedCondition = normalizeAssetCondition(formData.kondisi);
    if (isNew && !isValidAssetCondition(normalizedCondition)) {
      toast.error("Kondisi Wajib Dipilih", "Pilih kondisi alat/mesin berdasarkan hasil pemeriksaan fisik. Data baru tidak boleh dianggap BAIK secara otomatis.");
      return;
    }
    const payload: Partial<Equipment> = {
      asset_id: formData.asset_id,
      kode_barang: String(formData.kode_barang || "").trim(),
      nama_aset: String(formData.nama_aset || "").trim(),
      merk: String(formData.merk || "").trim(),
      jenis: normalizeAssetText(formData.jenis),
      tahun: optionalAssetNumber(formData.tahun),
      pengguna: normalizeAssetText(formData.pengguna),
      pengguna_nip: normalizeAssetNip(formData.pengguna_nip) as any,
      pengguna_raw: normalizeAssetText(formData.pengguna),
      pengguna_match_status: formData.pengguna_nip ? "matched" : "unmatched",
      penanggung_jawab: normalizeAssetText(formData.penanggung_jawab),
      penanggung_jawab_nip: normalizeAssetNip(formData.penanggung_jawab_nip) as any,
      lokasi: normalizeAssetText(formData.lokasi),
      jumlah: optionalAssetNumber(formData.jumlah) || 1,
      satuan: normalizeAssetText(formData.satuan) || "Unit",
      harga_pembelian: optionalAssetNumber(formData.harga_pembelian),
      foto: formData.foto,
      qr_url: formData.qr_url,
      opd: normalizeAssetText(formData.opd),
      kib_index: normalizeAssetText(formData.kib_index),
      unit_indexes: unitIndexes,
      register_barang: normalizeAssetText(formData.register_barang),
      spesifikasi: normalizeAssetText(formData.spesifikasi),
      bidang: normalizeAssetText(formData.bidang),
      mutasi: normalizeAssetText(formData.mutasi),
      dokumentasi: Array.isArray(formData.dokumentasi) ? formData.dokumentasi : [],
      dokumentasi_primary_id: formData.dokumentasi_primary_id,
      ...coordinateResult.payload,
    };
    if (isValidAssetCondition(normalizedCondition)) payload.kondisi = normalizedCondition;
    if (coordinateResult.pair.empty) {
      delete payload.latitude;
      delete payload.longitude;
    }
    setIsSaving(true);
    try {
      const result = await dataService.saveEquipment(payload, isNew);
      if (photoFile) {
        try {
          const encoded = await fileToBase64(photoFile);
          await apiService.uploadAssetFoto({
            table: "assets_equipment",
            assetId: result.asset_id,
            holderName: String(payload.pengguna || ""),
            ...encoded,
          });
        } catch (photoError: any) {
          toast.warning("Data Tersimpan, Foto Belum Terunggah", photoError?.message || "Silakan pilih foto dan simpan kembali.");
          onSaveSuccess();
          onClose();
          return;
        }
      }
      const failedAttachments: string[] = [];
      for (const file of attachmentFiles) {
        try {
          const encoded = await fileToBase64(file);
          await apiService.uploadEquipmentAttachment({ assetId: result.asset_id, ...encoded });
        } catch (attachmentError: any) {
          failedAttachments.push(`${file.name}: ${attachmentError?.message || "gagal"}`);
        }
      }
      if (failedAttachments.length) toast.warning("Data Tersimpan, Sebagian Lampiran Gagal", failedAttachments.join(" · "));
      else toast.success(isNew ? "Data Inventaris Berhasil Ditambahkan" : "Perubahan Data Berhasil Disimpan", isNew ? "Data inventaris, koordinat, dan media telah tersimpan." : "Perubahan data inventaris telah tersimpan dan tervalidasi.");
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      toast.error("Gagal Menyimpan", err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm transition-all duration-300">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-none sm:rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[90dvh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
            {formData.asset_id || (formData as any).id ? "Edit Inventaris" : "Tambah Inventaris"}
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
                <input readOnly value={formData.asset_id} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-sm opacity-70" />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Kode Barang *</label>
              <input required value={formData.kode_barang || ""} onChange={e => setFormData(prev => ({...prev, kode_barang: e.target.value}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm" placeholder="Kode inventaris/barang" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">OPD</label>
              <input value={formData.opd || ""} onChange={e => setFormData(prev => ({...prev, opd: e.target.value}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm" placeholder="Nama OPD" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">INDEX</label>
              <input value={formData.kib_index || ""} onChange={e => setFormData(prev => ({...prev, kib_index: e.target.value}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm" placeholder="Boleh dikosongkan dan dilengkapi nanti" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Nama Barang *</label>
              <input required value={formData.nama_aset || ""} onChange={e => setFormData(prev => ({...prev, nama_aset: e.target.value}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm" placeholder="Contoh: Papan Tulis" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Nama Umum / Merk *</label>
              <input required value={formData.merk || ""} onChange={e => setFormData(prev => ({...prev, merk: e.target.value}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm" placeholder="Contoh: Panasonic" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Kategori</label>
              <input value={formData.jenis || ""} onChange={e => setFormData(prev => ({...prev, jenis: e.target.value}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm" placeholder="Contoh: Elektronik" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Jumlah</label>
              <input type="number" min="0.01" step="any" value={formData.jumlah ?? ""} onChange={e => setFormData(prev => ({...prev, jumlah: e.target.value ? Number(e.target.value) : undefined}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm" placeholder="Contoh: 10" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Satuan</label>
              <input value={formData.satuan || ""} onChange={e => setFormData(prev => ({...prev, satuan: e.target.value}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm" placeholder="Contoh: Buah" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Tahun Pembelian</label>
              <input type="number" min="1900" max={new Date().getFullYear() + 1} value={formData.tahun ?? ""} onChange={e => setFormData(prev => ({...prev, tahun: e.target.value || undefined}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm" placeholder="Contoh: 2018" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Register</label>
              <input value={formData.register_barang || ""} onChange={e => setFormData(prev => ({...prev, register_barang: e.target.value}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm" placeholder="Nomor register" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Bidang</label>
              <input value={formData.bidang || ""} onChange={e => setFormData(prev => ({...prev, bidang: e.target.value}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm" placeholder="Bidang/unit organisasi" />
            </div>
            <div className="md:col-span-2 flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Spesifikasi</label>
              <textarea rows={3} value={formData.spesifikasi || ""} onChange={e => setFormData(prev => ({...prev, spesifikasi: e.target.value}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm" placeholder="Spesifikasi teknis barang" />
            </div>
            <div className="md:col-span-2 flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Daftar INDEX per Unit</label>
              <textarea rows={3} value={(formData.unit_indexes || []).join("\n")} onChange={e => setFormData(prev => ({...prev, unit_indexes: e.target.value.split(/\r?\n/).map(v => v.trim()).filter(Boolean)}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm" placeholder="Satu INDEX per baris untuk aset hasil penggabungan" />
              <p className="text-[11px] text-gray-400">Jumlah INDEX yang diisi tidak mengubah total Jumlah barang.</p>
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
              <select required={!formData.asset_id} value={isValidAssetCondition(formData.kondisi) ? normalizeAssetCondition(formData.kondisi) : ""} onChange={e => setFormData(prev => ({...prev, kondisi: e.target.value}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm text-gray-900 dark:text-gray-100">
                <option value="" className="text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800">-- Pilih kondisi berdasarkan pemeriksaan --</option>
                {ASSET_CONDITIONS.map((condition) => <option key={condition} value={condition} className="text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800">{condition}</option>)}
              </select>
              {!isValidAssetCondition(formData.kondisi) && formData.asset_id && <p className="text-[11px] text-amber-600">Data lama belum memiliki kondisi atau nilainya tidak baku. Pilih kondisi setelah diverifikasi; field lain tetap dapat disimpan tanpa mengubah kondisi.</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Harga Pembelian</label>
              <input type="number" min="0" step="1" value={formData.harga_pembelian ?? ""} onChange={e => setFormData(prev => ({...prev, harga_pembelian: e.target.value}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm" placeholder="Nilai rupiah tanpa pemisah" />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-xs font-medium text-gray-500">Lokasi</label>
              <input value={formData.lokasi || ""} onChange={e => setFormData(prev => ({...prev, lokasi: e.target.value}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm" placeholder="Lokasi/unit penempatan" />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-xs font-medium text-gray-500">Mutasi</label>
              <textarea rows={2} value={formData.mutasi || ""} onChange={e => setFormData(prev => ({...prev, mutasi: e.target.value}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm" placeholder="Catatan mutasi barang" />
            </div>
            <div className="md:col-span-2 text-xs font-bold uppercase tracking-wider text-blue-600 border-b border-blue-100 pb-2 mt-2">Lokasi Koordinat dan Media</div>
            <AssetMediaFields
              latitude={formData.latitude}
              longitude={formData.longitude}
              existingPhoto={formData.foto}
              selectedFile={photoFile}
              onCoordinatesChange={(latitude, longitude) => setFormData(prev => ({ ...prev, latitude, longitude }))}
              onFileChange={setPhotoFile}
              onError={(message) => toast.error("Lokasi/Media Belum Siap", message)}
              photoLabel="Foto Inventaris"
              autoLocate={!formData.asset_id}
            />
            <div className="md:col-span-2 space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
              <div><p className="text-xs font-bold text-gray-700 dark:text-gray-300">Lampiran & Galeri</p><p className="text-[11px] text-gray-400">Maksimal 20 berkas; gambar, PDF, Word, atau Excel; masing-masing maksimal 5 MB.</p></div>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => setAttachmentFiles(Array.from(e.target.files || []))} className="block w-full text-xs file:mr-3 file:rounded-full file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-bold file:text-blue-700" />
              {attachmentFiles.length > 0 && <div className="text-xs text-gray-600 dark:text-gray-300">Lampiran baru: {attachmentFiles.map(f => f.name).join(", ")}</div>}
              {Array.isArray(formData.dokumentasi) && formData.dokumentasi.length > 0 && <div className="space-y-2">{formData.dokumentasi.map((doc: any) => <div key={doc.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 p-2 text-xs dark:bg-gray-800"><span className="min-w-0 truncate">{doc.name}{(doc.id === formData.dokumentasi_primary_id || doc.is_primary) ? " · Foto utama" : ""}</span>{doc.id && canWriteAssets && <span className="flex shrink-0 items-center gap-2"><button type="button" className="text-red-600" onClick={async()=>{if(!formData.asset_id)return; try{await apiService.deleteEquipmentAttachment(formData.asset_id,doc.id);setFormData({...formData,dokumentasi:(formData.dokumentasi||[]).filter((d:any)=>d.id!==doc.id),dokumentasi_primary_id:formData.dokumentasi_primary_id===doc.id?undefined:formData.dokumentasi_primary_id});toast.success("Lampiran Dihapus","Lampiran berhasil dihapus.");}catch(error:any){toast.error("Gagal Menghapus Lampiran",error.message)}}}><Trash2 size={15}/></button></span>}</div>)}</div>}
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-xs font-medium text-gray-500">URL / Isi QR</label>
              <input value={formData.qr_url || ""} onChange={e => setFormData(prev => ({...prev, qr_url: e.target.value}))} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm" placeholder="Kosongkan untuk memakai ID aset" />
            </div>
          </div>
          <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3 safe-area-bottom pb-24 sm:pb-4">
            <button type="button" disabled={isSaving} onClick={onClose} className="flex-1 sm:flex-none min-h-11 px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-full font-medium text-sm transition-all border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 disabled:opacity-50">
              Batal
            </button>
            <button type="submit" disabled={isSaving} className="flex-1 sm:flex-none min-h-11 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium text-sm transition-all disabled:opacity-50">
              {isSaving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
