import React, { useState } from "react";
import { ZoomIn, ImageOff, AlertTriangle } from "lucide-react";
import { DetailModal } from "@/components/ui/DetailModal";
import { assetConditionLabel } from "@/lib/assetCondition";
import { SafeImage } from "@/components/ui/SafeImage";
import { resolveAssetPhotoCandidates, resolveAssetPhotoUrl } from "@/lib/media";

// Pola props mandiri (lihat §3 handoff: @types/react tidak terpasang).
interface AssetDetailModalProps {
  asset: any | null;
  isOpen: boolean;
  onClose: () => void;
  [key: string]: any;
}

/**
 * Modal detail aset bersama — dipakai di Data ASN/PPPK dan Buku Penjagaan.
 * Menampilkan atribut aset (DetailModal), foto, dan peta lokasi terakhir.
 * Zoom foto dikelola internal. Tidak ada data fabrikasi: seluruh field dari objek
 * aset yang sudah dicocokkan service.
 */
export function AssetDetailModal({ asset, isOpen, onClose }: AssetDetailModalProps) {
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  return (
    <>
      <DetailModal
        isOpen={isOpen}
        onClose={onClose}
        title="Detail Aset"
        data={
          asset
            ? {
                "ID Aset": asset.asset_id,
                "Kode Barang": asset.kode_barang || "Belum diisi",
                "No. Polisi": asset.no_polisi,
                "Nama Aset": asset.nama_aset || asset.jenis_kendaraan,
                Merk: asset.merk,
                Tipe: asset.tipe,
                Tahun: asset.tahun,
                Kondisi: assetConditionLabel(asset.kondisi),
                Pengguna: asset.pengguna,
                "No. BPKB": asset.no_bpkb,
                "No. Rangka": asset.no_rangka,
                "No. Mesin": asset.no_mesin,
                "Kapasitas Mesin": asset.kapasitas_mesin,
                "Harga Perolehan": asset.harga_pembelian,
                "KM / Kondisi Pemakaian": asset.km_kendaraan,
              }
            : null
        }
      >
        {asset && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Foto */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Foto Aset</span>
              <div className="w-full aspect-video bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden flex items-center justify-center group relative">
                {asset.foto ? (
                  <>
                    <SafeImage
                      src={resolveAssetPhotoUrl(asset.foto, asset.jenis ? "alat_mesin" : "kendaraan")}
                      fallbackSrcs={resolveAssetPhotoCandidates(asset.foto, asset.jenis ? "alat_mesin" : "kendaraan").slice(1)}
                      alt="Foto"
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setZoomedImage(resolveAssetPhotoUrl(asset.foto, asset.jenis ? "alat_mesin" : "kendaraan"))}
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <ZoomIn className="text-white drop-shadow-md" size={28} />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center text-gray-400">
                    <ImageOff size={24} className="mb-1" />
                    <span className="text-xs">Tidak ada foto</span>
                  </div>
                )}
              </div>
            </div>
            {/* Peta */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Lokasi Terakhir</span>
              <div className="w-full aspect-video bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden relative group">
                {asset.latitude != null && asset.longitude != null ? (
                  (() => {
                    const lat = String(asset.latitude).replace(",", ".").trim();
                    const lng = String(asset.longitude).replace(",", ".").trim();
                    return (
                      <>
                        <iframe
                          width="100%"
                          height="100%"
                          frameBorder="0"
                          src={`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`}
                          allowFullScreen
                          title="Lokasi Aset"
                          loading="lazy"
                        />
                        <a
                          href={`https://maps.google.com/?q=${lat},${lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-gray-800/90 text-blue-600 text-xs font-semibold px-3 py-1.5 rounded-full shadow-md"
                        >
                          Buka di Maps
                        </a>
                      </>
                    );
                  })()
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 text-center p-4">
                    <AlertTriangle size={22} className="mb-2 opacity-50" />
                    <span className="text-xs">Koordinat tidak tersedia</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DetailModal>

      {/* Zoom foto */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoomedImage(null)}
        >
          <SafeImage src={zoomedImage} alt="Zoomed" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </>
  );
}
