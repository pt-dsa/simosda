import React, { useEffect, useState, useContext } from "react";
import {
  Info, UserCircle, AlertTriangle, Package, GraduationCap,
  CheckCircle2, CircleDot, Car, Wrench, Archive, ChevronDown, Edit2, Trash2, ShieldCheck, Download, FileSignature, XCircle
} from "lucide-react";
import { motion } from "motion/react";
import { formatDate, maskSensitiveData } from "@/lib/utils";
import type { Pegawai } from "@/types";
import { AuthContext } from "@/components/layout/AppShell";
import { employmentAgendaPolicy, employmentStatusLabel } from "@/lib/employmentStatus";
import { SafeImage } from "@/components/ui/SafeImage";
import { assetConditionLabel } from "@/lib/assetCondition";
import { resolveAssetPhotoCandidates } from "@/lib/media";
// ---------------------------------------------------------------------------
// Atom bersama (dipakai juga oleh halaman Data ASN/PPPK) — dipusatkan di sini
// agar tidak ada duplikasi/drift (lihat Aturan handoff §2).
// ---------------------------------------------------------------------------
export function MatchBadge({ quality, onVerify }: { quality: "exact" | "fuzzy" | "none"; onVerify?: () => void }) {
  if (quality === "exact")
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
        <CheckCircle2 size={8} /> VERIFIED
      </span>
    );
  if (quality === "fuzzy") {
    const className = "inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800";
    if (onVerify) {
      return (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onVerify();
          }}
          className={`${className} hover:bg-yellow-200 dark:hover:bg-yellow-900/70 focus:outline-none focus:ring-2 focus:ring-yellow-500/50`}
          title="Klik untuk membuka data yang perlu diverifikasi"
          aria-label="Buka verifikasi kecocokan data pegawai dan aset"
        >
          <CircleDot size={9} /> Perlu Verifikasi
        </button>
      );
    }
    return (
      <span className={className} title="Kecocokan nama pegawai dan pengguna aset perlu diverifikasi">
        <CircleDot size={9} /> Perlu Verifikasi
      </span>
    );
  }
  return null;
}

export function KGBStatus({ tglKgb }: { tglKgb: string }) {
  if (!tglKgb) return <span className="text-gray-400 text-xs">-</span>;
  const d = new Date(tglKgb);
  const today = new Date();
  const diffMs = d.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const isUrgent = diffDays >= 0 && diffDays <= 180;

  return (
    <span className={`text-xs font-semibold ${isUrgent ? "text-yellow-600 dark:text-yellow-400" : "text-gray-600 dark:text-gray-400"}`}>
      {formatDate(tglKgb)}
      {isUrgent && <span className="ml-1 text-yellow-500">⚠</span>}
    </span>
  );
}

export function PensiunStatus({ tglPensiun }: { tglPensiun: string }) {
  if (!tglPensiun) return <span className="text-gray-400 text-xs">-</span>;
  const d = new Date(tglPensiun);
  const today = new Date();
  const diffMs = d.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const isNear = diffDays >= 0 && diffDays <= 365;

  return (
    <span className={`text-xs font-semibold ${isNear ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-400"}`}>
      {formatDate(tglPensiun)}
      {isNear && <span className="ml-1 text-red-500">🔴</span>}
    </span>
  );
}

export function PegawaiAvatar({ foto, nama, nip, size = "md" }: { foto: string; nama: string; nip?: string; size?: "sm" | "md" | "lg" }) {
  const [imgError, setImgError] = useState(false);
  const [source, setSource] = useState(foto || "");
  const cls = { sm: "w-9 h-9", md: "w-11 h-11", lg: "w-28 h-28 text-4xl" }[size];
  const textCls = { sm: "text-sm", md: "text-base", lg: "text-3xl" }[size];
  const initial = nama ? nama.charAt(0).toUpperCase() : "?";

  useEffect(() => {
    setSource(foto || "");
    setImgError(false);
  }, [foto, nip]);

  const handleImageError = async () => {
    setImgError(true);
  };

  if (!source || imgError) {
    return (
      <div className={`${cls} rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold ${textCls} shrink-0`}>
        {initial}
      </div>
    );
  }
  return (
    <img
      src={source}
      alt={nama}
      className={`${cls} rounded-full object-cover border-2 border-gray-200 dark:border-gray-700 shrink-0`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => void handleImageError()}
    />
  );
}

// ---------------------------------------------------------------------------
// Kartu aset di dalam modal 360°
// ---------------------------------------------------------------------------
function AssetCard({ asset, type, onSelect }: { key?: React.Key; asset: any; type: "kendaraan" | "alat" | "inventaris"; onSelect: (a: any) => void }) {
  const label = type === "kendaraan"
    ? (asset.no_polisi || asset.kode_barang)
    : (asset.nama_aset || asset.kode_barang);

  const sublabel = type === "kendaraan"
    ? `${asset.merk || ""} ${asset.tipe || ""}`.trim() || asset.jenis_kendaraan || ""
    : `${asset.merk || ""} ${asset.tahun || ""}`.trim();

  const photoCandidates = resolveAssetPhotoCandidates(asset.foto, type === "kendaraan" ? "kendaraan" : "alat_mesin");

  const kondisi = assetConditionLabel(asset.kondisi);
  const kondisiColor =
    kondisi === "BAIK" ? "bg-green-100 text-green-700" :
    kondisi.includes("RINGAN") || kondisi.includes("KURANG") ? "bg-yellow-100 text-yellow-700" :
    kondisi.includes("BERAT") || kondisi.includes("RUSAK") ? "bg-red-100 text-red-700" :
    "bg-gray-100 text-gray-700";

  return (
    <div
      className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-sm cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all flex flex-col"
      onClick={() => onSelect(asset)}
    >
      <div className="w-full h-28 bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
        {photoCandidates.length ? (
          <SafeImage src={photoCandidates[0]} fallbackSrcs={photoCandidates.slice(1)} alt={label} className="w-full h-full object-cover" />
        ) : (
          type === "kendaraan" ? <Car size={28} className="text-gray-400" /> : type === "alat" ? <Wrench size={28} className="text-gray-400" /> : <Archive size={28} className="text-gray-400" />
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start gap-1 mb-0.5">
            <h5 className="font-bold text-gray-900 dark:text-gray-100 text-sm leading-tight truncate">{label}</h5>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${kondisiColor}`}>{kondisi}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{sublabel}</p>
          {asset.asset_id && (
            <p className="text-[10px] text-gray-400 mt-1 font-mono">{asset.asset_id}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal Profil 360° — komponen BERSAMA (Data ASN/PPPK + Buku Penjagaan)
// Edit/Hapus hanya muncul bila callback onEdit/onDelete disuplai (di Buku
// Penjagaan keduanya tidak disuplai → tombol tersembunyi).
// ---------------------------------------------------------------------------
export function PegawaiDetailModal({
  pegawai,
  onClose,
  onSelectAsset,
  onEdit,
  onDelete,
  onHardDelete,
  onVerifyMatch,
}: {
  pegawai: Pegawai;
  onClose: () => void;
  onSelectAsset: (a: any) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onHardDelete?: () => void;
  onVerifyMatch?: () => void;
}) {
  const { user } = useContext(AuthContext);
  const [openSection, setOpenSection] = useState<string>("biodata");
  const totalAssets = pegawai.assets?.length || 0;
  const agendaPolicy = employmentAgendaPolicy(pegawai);

  const toggle = (s: string) => {
    setOpenSection((p) => (p === s ? "" : s));
  };

  function Section({ id, title, icon: Icon, children, count }: any) {
    const isOpen = openSection === id;
    return (
      <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
        <button
          onClick={() => toggle(id)}
          className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
        >
          <div className="flex items-center gap-2 font-bold text-base">
            <Icon size={18} className="text-blue-500" />
            {title}
            {count !== undefined && (
              <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 px-2 py-0.5 rounded-full font-bold">
                {count}
              </span>
            )}
          </div>
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
        {isOpen && <div className="p-4">{children}</div>}
      </div>
    );
  }

  function InfoRow({ label, value }: { label: string; value: string }) {
    if (!value) return null;
    return (
      <div className="flex flex-col border-b border-gray-100 dark:border-gray-800/50 pb-2">
        <span className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</span>
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">{value}</span>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white dark:bg-gray-900 rounded-none sm:rounded-2xl shadow-2xl w-full max-w-4xl h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[92dvh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <h2 className="text-lg font-bold">Profile Detail Pegawai</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-500"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col md:flex-row gap-0 md:gap-6 p-4 sm:p-6">

            {/* Sidebar */}
            <div className="w-full md:w-56 shrink-0 flex flex-col items-center text-center mb-6 md:mb-0">
              <PegawaiAvatar foto={pegawai.foto} nama={pegawai.nama} nip={pegawai.nip} size="lg" />
              <div className="flex items-center gap-1 mt-3 justify-center">
                <h3 className="text-lg font-bold leading-tight">{pegawai.nama}</h3>
              </div>
              <p className="text-xs font-mono text-gray-500 mt-0.5 break-all">{maskSensitiveData("nip", pegawai.nip, user?.role, user?.nip, pegawai.nip)}</p>

              {pegawai.is_incomplete && (
                <div className="mt-3 bg-amber-100/50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 p-2 rounded-lg flex items-start gap-2 text-left w-full border border-amber-200 dark:border-amber-800/50">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <p className="text-[10px] font-medium">Informasi biodata pegawai ini belum lengkap (NIP, Jabatan, Golongan, atau Status kosong).</p>
                </div>
              )}

              <span className={`inline-block mt-3 px-3 py-1 text-xs font-bold rounded-full ${
                pegawai.status === "ASN"
                  ? "bg-blue-100 text-blue-700"
                  : pegawai.status === "PPPK"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
              }`}>
                {employmentStatusLabel(pegawai)}
              </span>
              {pegawai.match_quality !== "none" && (
                <div className="mt-2">
                  <MatchBadge quality={pegawai.match_quality} onVerify={onVerifyMatch} />
                </div>
              )}

              {onEdit && (
                <button
                  onClick={onEdit}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 rounded-xl transition-colors border border-blue-200 dark:border-blue-800/50"
                >
                  <Edit2 size={14} />
                  Edit Pegawai
                </button>
              )}

              {onDelete && (
                <button
                  onClick={onDelete}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 rounded-xl transition-colors border border-orange-200 dark:border-orange-800/50"
                >
                  <Trash2 size={14} />
                  Nonaktifkan Pegawai
                </button>
              )}

              {onHardDelete && (
                <button
                  onClick={onHardDelete}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-900/30 dark:hover:bg-red-900/50 rounded-xl transition-colors border border-red-200 dark:border-red-800/50"
                >
                  <Trash2 size={14} />
                  Hapus Permanen
                </button>
              )}

              <div className="mt-4 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl w-full text-left space-y-2">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Golongan</p>
                  <p className="text-sm font-bold">{pegawai.golongan || "-"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Jabatan</p>
                  <p className="text-xs font-semibold leading-tight">{pegawai.jabatan || "-"}</p>
                </div>
                {pegawai.unit_kerja && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Unit Kerja</p>
                    <p className="text-xs font-semibold leading-tight">{pegawai.unit_kerja}</p>
                  </div>
                )}
                {totalAssets > 0 && (
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Tanggungan Aset</p>
                    <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{totalAssets} Item</p>
                  </div>
                )}
              </div>
            </div>

            {/* Main sections */}
            <div className="flex-1 space-y-3 min-w-0">

              {/* Biodata */}
              <Section id="biodata" title="Informasi Lengkap (Biodata/SK)" icon={UserCircle}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <InfoRow label="Nomor Induk Pegawai (NIP)" value={maskSensitiveData("nip", pegawai.nip, user?.role, user?.nip, pegawai.nip)} />
                  <InfoRow label="Nama Lengkap" value={pegawai.nama} />
                  <InfoRow label="Status Kepegawaian" value={employmentStatusLabel(pegawai)} />
                  <InfoRow label="Golongan / Ruang" value={pegawai.golongan} />
                  <InfoRow label="Jabatan" value={pegawai.jabatan} />
                  <InfoRow label="Unit Kerja / Bidang" value={pegawai.unit_kerja} />
                  <InfoRow label="Tanggal Lahir" value={maskSensitiveData("tanggal_lahir", pegawai.tgl_lahir, user?.role, user?.nip, pegawai.nip)} />
                  <InfoRow label="Usia" value={pegawai.usia} />
                  <InfoRow label="Masa Kerja" value={
                    pegawai.masa_kerja_tahun
                      ? `${pegawai.masa_kerja_tahun} tahun ${pegawai.masa_kerja_bulan} bulan`
                      : ""
                  } />
                  <InfoRow label="Kontak" value={maskSensitiveData("kontak", pegawai.kontak, user?.role, user?.nip, pegawai.nip)} />
                </div>
              </Section>

              {/* Pendidikan & Diklat */}
              <Section id="pendidikan" title="Pendidikan & Riwayat Diklat" icon={GraduationCap}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <InfoRow label="Tingkat Pendidikan" value={pegawai.tingkat} />
                  <InfoRow label="Jurusan / Program Studi" value={pegawai.pendidikan_jurusan} />
                  <InfoRow label="Universitas / Institusi" value={pegawai.universitas} />
                  <InfoRow label="Tahun Lulus" value={pegawai.tahun_lulus} />
                  <InfoRow label="Riwayat Diklat" value={pegawai.riwayat_diklat} />
                  <InfoRow label="Tahun Diklat" value={pegawai.tahun_diklat} />
                </div>
              </Section>

              {/* Buku Penjagaan */}
              <Section id="penjagaan" title="Buku Penjagaan" icon={AlertTriangle}>
                {!agendaPolicy.hasAgenda ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
                    <div className="flex items-start gap-3">
                      <Info size={18} className="mt-0.5 shrink-0 text-blue-500" />
                      <div>
                        <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Tidak memiliki agenda Buku Penjagaan</p>
                        <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                          {employmentStatusLabel(pegawai)} tidak memiliki agenda KGB, kenaikan pangkat, maupun BUP.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {agendaPolicy.kgb && (
                      <div className="p-4 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/40">
                        <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 mb-1">Jadwal KGB Berikutnya</p>
                        <KGBStatus tglKgb={pegawai.tgl_kgb} />
                        <p className="text-[10px] text-yellow-600 mt-1">
                          Mulai Golongan: {pegawai.tgl_mulai_golongan || "-"}
                        </p>
                      </div>
                    )}
                    {agendaPolicy.pangkat && (
                      <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/40">
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">Usulan Kenaikan Pangkat</p>
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          {pegawai.tgl_pangkat ? formatDate(pegawai.tgl_pangkat) : "-"}
                        </span>
                        <p className="text-[10px] text-blue-600 mt-1">
                          Mulai Jabatan: {pegawai.tgl_mulai_jabatan || "-"}
                        </p>
                      </div>
                    )}
                    {agendaPolicy.bup && (
                      <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40">
                        <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Batas Usia Pensiun</p>
                        <PensiunStatus tglPensiun={pegawai.tgl_pensiun} />
                        <p className="text-[10px] text-red-600 mt-1">
                          Tgl. Lahir: {pegawai.tgl_lahir || "-"}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {pegawai.catatan_mutasi_masuk && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InfoRow label="Catatan Mutasi Masuk" value={pegawai.catatan_mutasi_masuk} />
                    <InfoRow label="Catatan Mutasi Keluar" value={pegawai.catatan_mutasi_keluar} />
                  </div>
                )}
                {pegawai.keterangan && (
                  <div className="mt-3">
                    <InfoRow label="Keterangan" value={pegawai.keterangan} />
                  </div>
                )}
              </Section>



              {/* Tanggungan Aset */}
              <Section id="aset" title="Tanggungan Aset / Fasilitas" icon={Package} count={totalAssets}>
                {totalAssets === 0 ? (
                  <div className="bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800 rounded-xl p-6 text-center">
                    <Info className="mx-auto text-gray-400 mb-2" size={20} />
                    <p className="text-sm text-gray-500">
                      Belum ada aset yang tercatat atas nama {pegawai.nama}.
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Jika data belum sesuai, gunakan menu Data Cleansing atau hubungi pengelola aset.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pegawai.assets_kendaraan && pegawai.assets_kendaraan.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Car size={14} className="text-blue-500" />
                          <h5 className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                            Kendaraan ({pegawai.assets_kendaraan.length})
                          </h5>
                          {pegawai.match_quality !== "none" && <MatchBadge quality={pegawai.match_quality} />}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {pegawai.assets_kendaraan.map((a, i) => (
                            <AssetCard key={i} asset={a} type="kendaraan" onSelect={onSelectAsset} />
                          ))}
                        </div>
                      </div>
                    )}
                    {pegawai.assets_alat_mesin && pegawai.assets_alat_mesin.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Wrench size={14} className="text-green-500" />
                          <h5 className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                            Inventaris ({pegawai.assets_alat_mesin.length})
                          </h5>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {pegawai.assets_alat_mesin.map((a, i) => (
                            <AssetCard key={i} asset={a} type="alat" onSelect={onSelectAsset} />
                          ))}
                        </div>
                      </div>
                    )}
                    {pegawai.assets_inventaris && pegawai.assets_inventaris.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Archive size={14} className="text-orange-500" />
                          <h5 className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                            Alat & Mesin ({pegawai.assets_inventaris.length})
                          </h5>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {pegawai.assets_inventaris.map((a, i) => (
                            <AssetCard key={i} asset={a} type="inventaris" onSelect={onSelectAsset} />
                          ))}
                        </div>
                      </div>
                    )}

                    {pegawai.status === "PENSIUN" && totalAssets > 0 && (
                      <div className="mt-2 p-3 bg-red-100 text-red-700 rounded-lg text-sm font-bold flex items-center gap-2">
                        <AlertTriangle size={16} />
                        Pegawai Pensiun — Segera lakukan penarikan {totalAssets} aset.
                      </div>
                    )}
                  </div>
                )}
              </Section>

            </div>
          </div>
        </div>
      </motion.div>


    </div>
  );
}
