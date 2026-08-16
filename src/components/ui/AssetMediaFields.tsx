import React, { useEffect, useRef, useState } from "react";
import { Camera, Crosshair, ImagePlus, LoaderCircle, MapPin, X } from "lucide-react";
import { SafeImage } from "@/components/ui/SafeImage";
import { resolveAssetPhotoCandidates, resolveAssetPhotoUrl } from "@/lib/media";
import { osmMiniMapUrl, validateCoordinatePair } from "@/lib/coordinates";

interface AssetMediaFieldsProps {
  latitude: string | number | undefined;
  longitude: string | number | undefined;
  existingPhoto?: string;
  selectedFile: File | null;
  onCoordinatesChange: (latitude: number | string, longitude: number | string) => void;
  onFileChange: (file: File | null) => void;
  onError: (message: string) => void;
  photoLabel: string;
  autoLocate?: boolean;
}

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm outline-none focus:ring-2 focus:ring-blue-500/40";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function resolveStoredPhoto(raw: string | undefined, photoLabel: string): string {
  return resolveAssetPhotoUrl(raw, /kendaraan/i.test(photoLabel) ? "kendaraan" : "alat_mesin");
}

export function AssetMediaFields({
  latitude,
  longitude,
  existingPhoto,
  selectedFile,
  onCoordinatesChange,
  onFileChange,
  onError,
  photoLabel,
  autoLocate = false,
}: AssetMediaFieldsProps) {
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [preview, setPreview] = useState(resolveStoredPhoto(existingPhoto, photoLabel));
  const storedPhotoCandidates = resolveAssetPhotoCandidates(existingPhoto, /kendaraan/i.test(photoLabel) ? "kendaraan" : "alat_mesin");
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const autoLocateAttempted = useRef(false);
  const coordinatePair = validateCoordinatePair(latitude, longitude);

  useEffect(() => {
    if (autoLocate && !autoLocateAttempted.current && (latitude === "" || latitude === undefined) && (longitude === "" || longitude === undefined)) {
      autoLocateAttempted.current = true;
      takeLocation(false);
    }
    // Hanya sekali saat modal tambah dibuka; tombol tetap tersedia untuk mencoba ulang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLocate]);

  useEffect(() => {
    if (!selectedFile) {
      setPreview(resolveStoredPhoto(existingPhoto, photoLabel));
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [existingPhoto, photoLabel, selectedFile]);

  function takeLocation(isManual = false) {
    if (!navigator.geolocation) {
      if (isManual) {
        onError("Perangkat atau browser ini belum mendukung GPS. Koordinat tetap dapat diisi secara manual.");
      }
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(7));
        const lng = Number(position.coords.longitude.toFixed(7));
        onCoordinatesChange(lat, lng);
        setAccuracy(Math.round(position.coords.accuracy));
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        if (isManual) {
          const messages: Record<number, string> = {
            1: "Izin lokasi ditolak. Aktifkan izin lokasi browser atau isi koordinat secara manual.",
            2: "Lokasi belum dapat ditemukan. Pastikan GPS perangkat aktif lalu coba kembali.",
            3: "Pengambilan lokasi melewati batas waktu. Silakan coba kembali di area dengan sinyal GPS lebih baik.",
          };
          onError(messages[error.code] || "Koordinat GPS belum berhasil diambil.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function validateFile(file?: File) {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      onError("Foto harus berformat JPEG, PNG, atau WebP.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      onError("Ukuran foto maksimal 5 MB.");
      return;
    }
    onFileChange(file);
  }

  return (
    <>
      <div className="md:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5"><MapPin size={14} /> Koordinat GPS <span className="font-normal text-gray-400">(opsional)</span></p>
          <p className="text-[11px] text-gray-400">Gunakan lokasi perangkat, isi manual, atau kosongkan keduanya untuk menyimpan tanpa koordinat.</p>
        </div>
        <button type="button" onClick={() => takeLocation(true)} disabled={locating} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold border border-blue-200 dark:border-blue-800 disabled:opacity-60">
          {locating ? <LoaderCircle size={14} className="animate-spin" /> : <Crosshair size={14} />}
          {locating ? "Mengambil Lokasi..." : "Ambil Lokasi GPS"}
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Latitude</label>
        <input type="text" inputMode="decimal" value={latitude ?? ""} onChange={(event) => onCoordinatesChange(event.target.value, longitude ?? "")} className={inputCls} placeholder="Contoh: -6.300000" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Longitude</label>
        <input type="text" inputMode="decimal" value={longitude ?? ""} onChange={(event) => onCoordinatesChange(latitude ?? "", event.target.value)} className={inputCls} placeholder="Contoh: 106.700000" />
      </div>
      {coordinatePair.valid && !coordinatePair.empty && coordinatePair.latitude !== undefined && coordinatePair.longitude !== undefined && (
        <div className="md:col-span-2 overflow-hidden rounded-xl border border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <div>
              <p className="text-xs font-bold text-blue-800 dark:text-blue-300">Minimap lokasi tersimpan</p>
              <p className="text-[10px] text-blue-600/80 dark:text-blue-400">{coordinatePair.latitude.toFixed(7)}, {coordinatePair.longitude.toFixed(7)}</p>
            </div>
            <a
              href={`https://maps.google.com/?q=${coordinatePair.latitude},${coordinatePair.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-[11px] font-bold text-blue-700 dark:text-blue-300 hover:underline"
            >
              Buka peta penuh
            </a>
          </div>
          <iframe
            key={`${coordinatePair.latitude}-${coordinatePair.longitude}`}
            title={`Minimap ${photoLabel}`}
            src={osmMiniMapUrl(coordinatePair.latitude, coordinatePair.longitude)}
            className="block h-44 w-full border-0 bg-gray-100 dark:bg-gray-800"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
      {!coordinatePair.valid && (
        <p className="md:col-span-2 text-[11px] text-red-600 dark:text-red-400">{coordinatePair.error}</p>
      )}
      {accuracy !== null && (
        <p className="md:col-span-2 text-[11px] text-emerald-600 dark:text-emerald-400">Lokasi berhasil diambil · perkiraan akurasi ±{accuracy} meter.</p>
      )}
      <div className="md:col-span-2 space-y-2">
        <div>
          <p className="text-xs font-bold text-gray-700 dark:text-gray-300">{photoLabel}</p>
          <p className="text-[11px] text-gray-400">JPEG, PNG, atau WebP · maksimal 5 MB.</p>
        </div>
        <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(event) => validateFile(event.target.files?.[0])} />
        <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => validateFile(event.target.files?.[0])} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => cameraRef.current?.click()} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"><Camera size={14} /> Ambil dari Kamera</button>
          <button type="button" onClick={() => galleryRef.current?.click()} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold"><ImagePlus size={14} /> Pilih dari Galeri</button>
          {selectedFile && <button type="button" onClick={() => onFileChange(null)} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-red-600 text-xs font-bold"><X size={14} /> Batalkan Foto Baru</button>}
        </div>
        {preview && (
          <div className="relative w-full max-w-sm aspect-video rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
            <SafeImage
              src={preview}
              fallbackSrcs={selectedFile ? [] : storedPhotoCandidates.slice(1)}
              alt={`Pratinjau ${photoLabel}`}
              className="w-full h-full object-cover"
              fallbackClassName="min-h-full"
            />
            <span className="absolute bottom-2 left-2 px-2 py-1 rounded-lg bg-black/65 text-white text-[10px]">{selectedFile ? "Foto baru" : "Foto tersimpan"}</span>
          </div>
        )}
      </div>
    </>
  );
}
