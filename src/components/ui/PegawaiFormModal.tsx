import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "motion/react";
import { X, Save, AlertTriangle, RefreshCw, Camera, Upload, User, CalendarDays, CheckCircle2 } from "lucide-react";
import { Pegawai } from "@/types";
import { apiService, fileToBase64 } from "@/services/apiService";
import { dataService } from "@/services/dataService";
import { toIndonesianDateText, toInputDate, parseAnyDate } from "@/lib/utils";
import { canEditField, type AppUser } from "@/lib/rbac";
import {
  GOLONGAN_OPTIONS,
  INDONESIAN_INSTITUTIONS,
  INDONESIAN_STUDY_PROGRAMS,
  mergeSuggestionOptions,
} from "@/lib/educationOptions";
import { useToast } from "@/components/ui/Toast";
import { isValidWhatsAppNumber, normalizeIndonesianPhoneNumber } from "@/lib/contact";

const DATE_FIELDS: (keyof Pegawai)[] = ["tgl_lahir", "tgl_mulai_golongan", "tgl_mulai_jabatan"];

const inputCls =
  "w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none read-only:opacity-60";
const labelCls = "block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1";
const WORK_YEAR_OPTIONS = Array.from({ length: 51 }, (_, value) => value);
const WORK_MONTH_OPTIONS = Array.from({ length: 12 }, (_, value) => value);
const EDUCATION_OPTIONS = ["SD", "SMP", "SMA/SMK/SLTA", "D-I", "D-II", "D-III", "D-IV", "S-1/STRATA I", "S-2/STRATA II", "S-3/STRATA III"];
const GRADUATION_YEAR_OPTIONS = Array.from(
  { length: new Date().getFullYear() - 1949 },
  (_, index) => String(new Date().getFullYear() - index),
);

function computeUsia(tglLahir?: string): string {
  const d = parseAnyDate(tglLahir);
  if (!d) return "";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 120 ? `${age} tahun` : "";
}

// ---------------------------------------------------------------------------
// PERBAIKAN BUG FOKUS — Field menerima `value` SPESIFIK (bukan seluruh formData).
// React.memo memastikan Field hanya re-render saat VALUE-NYA SENDIRI berubah.
// Dengan ini, mengetik di field "Nama" tidak menyebabkan re-render field lain.
// ---------------------------------------------------------------------------
interface FieldProps {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  colSpan?: boolean;
  value: string;
  onChange: (e: any) => void;
  onBlur?: () => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  helperText?: string;
  locked: boolean;
  maxLength?: number;
  [key: string]: any;
}

const Field = React.memo(function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder = "",
  colSpan = false,
  value,
  onChange,
  onBlur,
  inputMode,
  helperText,
  locked,
  maxLength,
  ...rest
}: FieldProps) {
  return (
    <div className={colSpan ? "md:col-span-2" : ""}>
      <div className="flex justify-between items-center mb-1">
        <label className={labelCls}>
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
        {maxLength && (
          <span className={`text-[10px] font-mono font-semibold ${value.length === maxLength ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"}`}>
            {value.length}/{maxLength} digit
          </span>
        )}
      </div>
      <input
        type={type}
        name={name}
        required={required}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        inputMode={inputMode}
        readOnly={locked}
        maxLength={maxLength}
        placeholder={placeholder}
        className={inputCls}
        {...rest}
      />
      {helperText && <p className="mt-1 text-[10px] text-gray-400">{helperText}</p>}
    </div>
  );
});

const SuggestionField = React.memo(function SuggestionField({
  label, name, value, onChange, locked, placeholder = "Pilih opsi atau ketik nilai baru", colSpan = false, options = [],
}: Pick<FieldProps, "label" | "name" | "value" | "onChange" | "locked" | "placeholder" | "colSpan"> & { options: string[] }) {
  const listId = `pegawai-${name}-options`;
  return (
    <div className={colSpan ? "md:col-span-2" : ""}>
      <label className={labelCls}>{label}</label>
      <input
        list={listId}
        name={name}
        value={value}
        onChange={onChange}
        readOnly={locked}
        placeholder={placeholder}
        autoComplete="off"
        className={inputCls}
      />
      <datalist id={listId}>{options.map((option) => <option key={option} value={option} />)}</datalist>
      {!locked && <p className="mt-1 text-[10px] text-gray-400">Pilih dari daftar atau ketik nilai baru bila belum tersedia.</p>}
    </div>
  );
});

const IndonesianDateField = React.memo(function IndonesianDateField({
  label, name, value, onChange, locked,
}: Pick<FieldProps, "label" | "name" | "value" | "onChange" | "locked">) {
  const normalize = (event: React.FocusEvent<HTMLInputElement>) => {
    const normalized = toIndonesianDateText(event.target.value);
    if (normalized && normalized !== event.target.value) onChange({ target: { name, value: normalized } });
  };
  const parsed = value ? parseAnyDate(value) : null;
  const calendarValue = toInputDate(value);
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex gap-2">
        <input type="text" name={name} value={value} onChange={onChange} onBlur={normalize}
          readOnly={locked} inputMode="numeric" placeholder="Contoh: 13 Juli 1992" className={inputCls} />
        {!locked && (
          <label className="relative w-11 shrink-0 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer flex items-center justify-center" title={`Pilih ${label} dari kalender`}>
            <CalendarDays size={17} />
            <input
              type="date"
              value={calendarValue}
              aria-label={`Pilih ${label} dari kalender`}
              onChange={(event) => {
                const selected = toIndonesianDateText(event.target.value);
                if (selected) onChange({ target: { name, value: selected } });
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </label>
        )}
      </div>
      {!value ? (
        <p className="mt-1 text-[10px] text-gray-400">Disarankan memakai tombol kalender. Input manual menerima 13 Juli 1992, 13-07-1992, atau 13/07/1992.</p>
      ) : parsed ? (
        <p className="mt-1 text-[10px] text-emerald-600 flex items-center gap-1"><CheckCircle2 size={11} /> Valid · akan disimpan sebagai {toIndonesianDateText(value)}</p>
      ) : (
        <p className="mt-1 text-[10px] text-red-600 flex items-center gap-1"><AlertTriangle size={11} /> Tanggal belum valid. Pilih kalender atau gunakan contoh 13 Juli 1992.</p>
      )}
    </div>
  );
});

function SectionTitle({ children }: { children: any }) {
  return (
    <div className="md:col-span-2 mt-2 mb-1">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 border-b border-gray-100 dark:border-gray-800 pb-1">
        {children}
      </h3>
    </div>
  );
}

export function PegawaiFormModal({
  isOpen,
  onClose,
  initialData,
  onSuccess,
  user,
  bidangOptions = [],
  fieldOptions = {},
}: {
  isOpen: boolean;
  onClose: () => void;
  initialData?: Pegawai | null;
  onSuccess: () => void;
  user?: AppUser | null;
  bidangOptions?: string[];
  fieldOptions?: {
    golongan?: string[];
    jabatan?: string[];
    jurusan?: string[];
    institusi?: string[];
  };
}) {
  const toast = useToast();
  const [formData, setFormData] = useState<Partial<Pegawai>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setPhotoFile(null);
    if (initialData) {
      const seeded: Partial<Pegawai> = { ...initialData };
      if (String(seeded.status || "").toUpperCase() === "PPPK" && !seeded.kategori_pppk) seeded.kategori_pppk = "penuh_waktu";
      DATE_FIELDS.forEach((f) => {
        const v = (initialData as any)[f];
        if (v) (seeded as any)[f] = toIndonesianDateText(v);
      });
      setFormData(seeded);
      setPhotoPreview(initialData.foto || "");
    } else {
      setFormData({ status: "ASN" });
      setPhotoPreview("");
    }
  }, [isOpen, initialData]);

  // handleChange STABIL — useCallback + functional updater (deps kosong sengaja).
  const handleChange = useCallback((e: any) => {
    const { name, value } = e.target;
    if (name === "nip") {
      // Kunci NIP hanya angka dan maksimal 18 digit
      const numericVal = String(value || "").replace(/\D/g, "").slice(0, 18);
      setFormData((prev) => ({ ...prev, [name]: numericVal }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleEmploymentStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setFormData((prev) => {
      if (value === "PPPK_PENUH_WAKTU") {
        return { ...prev, status: "PPPK", kategori_pppk: "penuh_waktu" };
      }
      if (value === "PPPK_PARUH_WAKTU") {
        return { ...prev, status: "PPPK", kategori_pppk: "paruh_waktu" };
      }
      return { ...prev, status: value, kategori_pppk: "" };
    });
  }, []);

  if (!isOpen) return null;

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Berkas harus berupa gambar.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Ukuran foto maksimal 5 MB.");
      return;
    }
    setErrorMsg(null);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanNip = String(formData.nip || "").replace(/\D/g, "");
    if (!cleanNip) {
      setErrorMsg("NIP wajib diisi.");
      return;
    }
    if (cleanNip.length !== 18) {
      setErrorMsg(`NIP harus terdiri dari tepat 18 digit angka (saat ini ${cleanNip.length} digit).`);
      return;
    }
    if (String(formData.status || "").toUpperCase() === "PPPK" && !formData.kategori_pppk) {
      setErrorMsg("Pilih PPPK (Penuh Waktu) atau PPPK (Paruh Waktu).");
      return;
    }
    const graduationYear = String(formData.tahun_lulus || "").trim();
    if (graduationYear && (!/^\d{4}$/.test(graduationYear) || Number(graduationYear) < 1900 || Number(graduationYear) > new Date().getFullYear())) {
      setErrorMsg(`Tahun Lulus harus berupa 4 digit antara 1900 dan ${new Date().getFullYear()}.`);
      return;
    }
    const rawContact = String(formData.kontak || "").trim();
    if (rawContact && !isValidWhatsAppNumber(rawContact)) {
      setErrorMsg("Nomor kontak belum valid. Gunakan nomor seluler Indonesia, contoh 081234567890 atau 6281234567890.");
      return;
    }

    setIsSaving(true);
    let saveStage: "data" | "photo" = "data";
    try {
      const payload: Partial<Pegawai> = { ...formData };
      // Metadata foto dikelola eksklusif oleh endpoint Storage agar signed URL
      // tidak pernah tersimpan kembali sebagai URL permanen di database.
      delete (payload as any).foto;
      delete (payload as any).foto_storage_path;
      delete (payload as any).foto_provider;
            delete (payload as any).tgl_kgb;
      delete (payload as any).tgl_pangkat;
      delete (payload as any).tgl_pensiun;
      delete (payload as any).kgb_cycle_years;
      delete (payload as any).pangkat_cycle_years;
      delete (payload as any).bup_usia;
      delete (payload as any).usia;
      delete (payload as any).foto_migration_status;
      delete (payload as any).is_incomplete;
      if (!initialData) {
        payload.is_active = true;
      } else {
        delete (payload as any).is_active;
      }
      delete (payload as any).match_quality;
      delete (payload as any).foto_migrated_at;
      delete (payload as any).assets;
      delete (payload as any).assets_kendaraan;
      delete (payload as any).assets_alat_mesin;
      delete (payload as any).assets_inventaris;
      delete (payload as any).issues;
      delete (payload as any)._isMerged;
      delete (payload as any)._searchable;
      payload.kontak = normalizeIndonesianPhoneNumber(payload.kontak);
      DATE_FIELDS.forEach((field) => {
        const normalized = toIndonesianDateText((payload as any)[field]);
        if ((payload as any)[field] && !normalized) throw new Error(`Format ${field.replaceAll("_", " ")} tidak valid.`);
        if (normalized) (payload as any)[field] = normalized;
      });

      await apiService.savePegawai(payload, !initialData);

      if (photoFile) {
        saveStage = "photo";
        const { base64, mimeType, fileName } = await fileToBase64(photoFile);
        const uploadRes = await apiService.uploadFoto({ nip: String(formData.nip), base64, mimeType, fileName });
        setPhotoPreview(uploadRes.viewUrl);
      }

      toast.success(initialData ? "Perubahan Data Berhasil Disimpan" : "Data Pegawai Berhasil Ditambahkan", initialData ? "Perubahan profil pegawai telah disimpan dan tervalidasi." : "Data pegawai baru telah tersimpan pada database.");
      onSuccess();
    } catch (error: any) {
      const detail = error?.message || "Terjadi kesalahan saat menyimpan data.";
      const message = saveStage === "photo"
        ? `Data profil sudah tersimpan, tetapi foto belum berhasil diunggah. Silakan coba unggah foto kembali. ${detail}`
        : detail;
      setErrorMsg(message);
      toast.error(saveStage === "photo" ? "Unggah Foto Belum Berhasil" : "Penyimpanan Data Pegawai Gagal", message);
      if (saveStage === "photo") {
        onSuccess();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const isEdit = !!initialData;
  const rowNip = String((initialData as any)?.nip ?? formData.nip ?? "");

  // Helper: apakah field ini terkunci untuk user ini?
  const L = (name: string) => !canEditField(user, rowNip, name);
  const canFoto = canEditField(user, rowNip, "foto");

  // Helper: ambil nilai string dari formData (untuk prop value Field)
  const V = (name: keyof Pegawai): string => String((formData as any)[name] ?? "");
  const employmentStatusValue = (() => {
    const status = V("status").toUpperCase();
    if (status !== "PPPK") return status || "ASN";
    if (V("kategori_pppk") === "penuh_waktu") return "PPPK_PENUH_WAKTU";
    if (V("kategori_pppk") === "paruh_waktu") return "PPPK_PARUH_WAKTU";
    return "PPPK_PENUH_WAKTU";
  })();
  const golonganSuggestions = mergeSuggestionOptions(GOLONGAN_OPTIONS, fieldOptions.golongan || []);
  const jabatanSuggestions = mergeSuggestionOptions(fieldOptions.jabatan || []);
  const jurusanSuggestions = mergeSuggestionOptions(INDONESIAN_STUDY_PROGRAMS, fieldOptions.jurusan || []);
  const institutionSuggestions = mergeSuggestionOptions(INDONESIAN_INSTITUTIONS, fieldOptions.institusi || []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-gray-900 rounded-none sm:rounded-2xl shadow-xl w-full max-w-3xl h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[92dvh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
          <h2 className="font-bold text-lg text-gray-900 dark:text-white">
            {isEdit ? "Edit Data Pegawai" : "Tambah Data Pegawai"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 flex-1">
          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-sm flex items-start gap-2 border border-red-200">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form
            id="pegawai-form"
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {/* FOTO */}
            <div className="md:col-span-2 flex items-center gap-4">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0">
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="Foto"
                    className="w-full h-full object-cover"
                    onError={() => setPhotoPreview("")}
                  />
                ) : (
                  <User size={32} className="text-gray-400" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <span className={labelCls}>Foto Pegawai</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!canFoto}
                    onClick={() => galleryRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload size={14} /> Galeri
                  </button>
                  <button
                    type="button"
                    disabled={!canFoto}
                    onClick={() => cameraRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Camera size={14} /> Kamera
                  </button>
                </div>
                <input
                  ref={galleryRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
                <p className="text-[10px] text-gray-400">
                  JPG/PNG/WebP, maksimal 5 MB. Foto disimpan aman dan hanya dapat diakses pengguna berwenang.
                </p>
              </div>
            </div>

            <SectionTitle>Identitas &amp; Status</SectionTitle>
            <Field
              label="NIP"
              name="nip"
              required
              inputMode="numeric"
              maxLength={18}
              placeholder="18 digit NIP"
              value={V("nip")}
              onChange={handleChange}
              locked={L("nip") || (!!isEdit)}
              helperText={
                !isEdit && V("nip").length > 0 && V("nip").length < 18
                  ? `NIP belum lengkap (masih ${V("nip").length}/18 digit)`
                  : undefined
              }
            />
            <Field label="Nama Lengkap" name="nama" required placeholder="Nama lengkap &amp; gelar"
              value={V("nama")} onChange={handleChange} locked={L("nama")} />
            <div>
              <label className={labelCls}>
                Status <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={employmentStatusValue}
                onChange={handleEmploymentStatusChange}
                disabled={L("status")}
                className={inputCls}
              >
                <option value="ASN">ASN</option>
                <option value="PPPK_PENUH_WAKTU">PPPK (Penuh Waktu) — mendapat KGB</option>
                <option value="PPPK_PARUH_WAKTU">PPPK (Paruh Waktu) — tanpa agenda</option>
                <option value="PENSIUN">PENSIUN</option>
              </select>
            </div>
            <IndonesianDateField label="Tanggal Lahir" name="tgl_lahir"
              value={V("tgl_lahir")} onChange={handleChange} locked={L("tgl_lahir")} />

            <SectionTitle>Kepangkatan &amp; Jabatan</SectionTitle>
            <SuggestionField label="Golongan" name="golongan" placeholder="Pilih golongan atau ketik nilai baru"
              value={V("golongan")} onChange={handleChange} locked={L("golongan")} options={golonganSuggestions} />
            <IndonesianDateField label="TMT Golongan (dasar KGB & Pangkat)" name="tgl_mulai_golongan"
              value={V("tgl_mulai_golongan")} onChange={handleChange} locked={L("tgl_mulai_golongan")} />
            <SuggestionField label="Jabatan" name="jabatan" placeholder="Pilih jabatan atau ketik nilai baru" colSpan
              value={V("jabatan")} onChange={handleChange} locked={L("jabatan")} options={jabatanSuggestions} />
            <div className="md:col-span-2">
              <label className={labelCls}>Bidang</label>
              <input list="pegawai-bidang-options" name="unit_kerja" value={V("unit_kerja")} onChange={handleChange}
                readOnly={L("unit_kerja")} className={inputCls} placeholder="Pilih bidang eksisting atau ketik bidang baru" />
              <datalist id="pegawai-bidang-options">
                {bidangOptions.map((bidang) => <option key={bidang} value={bidang} />)}
              </datalist>
              <p className="text-[10px] text-gray-400 mt-1">Daftar berasal dari Bidang pada Buku Penjagaan. Nilai baru dapat langsung diketik.</p>
            </div>
            <IndonesianDateField label="TMT Jabatan" name="tgl_mulai_jabatan"
              value={V("tgl_mulai_jabatan")} onChange={handleChange} locked={L("tgl_mulai_jabatan")} />
            <div><label className={labelCls}>Masa Kerja (Tahun)</label><select name="masa_kerja_tahun" value={V("masa_kerja_tahun")} onChange={handleChange} disabled={L("masa_kerja_tahun")} className={inputCls}>
              <option value="">Pilih tahun</option>{WORK_YEAR_OPTIONS.map((value) => <option key={value} value={value}>{value} tahun</option>)}
            </select></div>
            <div><label className={labelCls}>Masa Kerja (Bulan)</label><select name="masa_kerja_bulan" value={V("masa_kerja_bulan")} onChange={handleChange} disabled={L("masa_kerja_bulan")} className={inputCls}>
              <option value="">Pilih bulan</option>{WORK_MONTH_OPTIONS.map((value) => <option key={value} value={value}>{value} bulan</option>)}
            </select></div>

            <SectionTitle>Pendidikan</SectionTitle>
            <div><label className={labelCls}>Tingkat</label><select name="tingkat" value={V("tingkat")} onChange={handleChange} disabled={L("tingkat")} className={inputCls}>
              <option value="">Pilih tingkat pendidikan</option>
              {V("tingkat") && !EDUCATION_OPTIONS.includes(V("tingkat")) && <option value={V("tingkat")}>{V("tingkat")} (data lama)</option>}
              {EDUCATION_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select></div>
            <SuggestionField label="Pendidikan (Jurusan)" name="pendidikan_jurusan" placeholder="Pilih jurusan atau ketik nilai baru"
              value={V("pendidikan_jurusan")} onChange={handleChange} locked={L("pendidikan_jurusan")} options={jurusanSuggestions} />
            <SuggestionField label="Universitas / Sekolah" name="universitas" placeholder="Pilih institusi atau ketik nilai baru"
              value={V("universitas")} onChange={handleChange} locked={L("universitas")} options={institutionSuggestions} />
            <SuggestionField label="Tahun Lulus" name="tahun_lulus" placeholder="Pilih tahun atau ketik 4 digit"
              value={V("tahun_lulus")} onChange={handleChange} locked={L("tahun_lulus")} options={GRADUATION_YEAR_OPTIONS} />

            <SectionTitle>Diklat</SectionTitle>
            <Field label="Riwayat Diklat" name="riwayat_diklat"
              value={V("riwayat_diklat")} onChange={handleChange} locked={L("riwayat_diklat")} />
            <Field label="Tahun Diklat" name="tahun_diklat" placeholder="Contoh: 2022"
              value={V("tahun_diklat")} onChange={handleChange} locked={L("tahun_diklat")} />

            <SectionTitle>Kontak</SectionTitle>
            <Field label="Kontak / WhatsApp" name="kontak" placeholder="08xxxxxxxxxx atau 628xxxxxxxxxx"
              value={V("kontak")} onChange={handleChange} locked={L("kontak")} inputMode="tel"
              onBlur={() => setFormData((prev) => ({ ...prev, kontak: normalizeIndonesianPhoneNumber(prev.kontak) }))}
              helperText="Format 08... otomatis dikonversi dan disimpan sebagai 628...." />
            <Field label="Email (untuk notifikasi)" name="email" type="email" placeholder="nama@email.go.id"
              value={V("email")} onChange={handleChange} locked={L("email")} />

            <SectionTitle>Mutasi &amp; Keterangan</SectionTitle>
            <Field label="Catatan Mutasi (Masuk)" name="catatan_mutasi_masuk"
              value={V("catatan_mutasi_masuk")} onChange={handleChange} locked={L("catatan_mutasi_masuk")} />
            <Field label="Catatan Mutasi (Keluar)" name="catatan_mutasi_keluar"
              value={V("catatan_mutasi_keluar")} onChange={handleChange} locked={L("catatan_mutasi_keluar")} />
            <div className="md:col-span-2">
              <label className={labelCls}>Keterangan</label>
              <textarea
                name="keterangan"
                rows={2}
                value={V("keterangan")}
                onChange={handleChange}
                readOnly={L("keterangan")}
                className={inputCls}
                placeholder="Tambahkan keterangan jika ada"
              />
            </div>
          </form>
        </div>

        <div className="safe-area-bottom pb-6 sm:pb-4 p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 grid grid-cols-2 sm:flex sm:justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="min-h-11 px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            form="pegawai-form"
            disabled={isSaving}
            className="min-h-11 flex items-center justify-center gap-2 px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-sm"
          >
            {isSaving ? (
              <>
                <RefreshCw size={16} className="animate-spin" /> Menyimpan...
              </>
            ) : (
              <>
                <Save size={16} /> Simpan Data
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
