const ATURAN_SOFT_LIMIT = 28;

function adaTenggat(tgl?: string | null, maksHari = 90): boolean {
  if (!tgl) return false;
  const d = new Date(tgl).getTime();
  if (Number.isNaN(d)) return false;
  const selisih = (d - Date.now()) / 86400000;
  return selisih >= -14 && selisih <= maksHari;
}

function bukanBaik(kondisi?: string): boolean {
  const kd = String(kondisi || "").trim().toUpperCase();
  return kd !== "" && kd !== "BAIK" && kd !== "B";
}

function adaUlangTahun(tgl?: string | null, maksHariDepan = 30): boolean {
  if (!tgl) return false;
  const d = new Date(tgl);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  
  // Cek ulang tahun tahun ini
  d.setFullYear(now.getFullYear());
  let selisih = (d.getTime() - now.getTime()) / 86400000;
  
  // Jika selisih sangat negatif (misal ultah Januari tapi sekarang Desember), cek tahun depan
  if (selisih < -100) {
    d.setFullYear(now.getFullYear() + 1);
    selisih = (d.getTime() - now.getTime()) / 86400000;
  }
  
  // Jika ulang tahun sudah lewat 7 hari atau akan datang dalam maksHariDepan
  return selisih >= -7 && selisih <= maksHariDepan;
}

function hitungField(list: Array<Record<string, unknown>>, field: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of list) {
    const val = String(item[field] || "-").trim();
    counts.set(val, (counts.get(val) || 0) + 1);
  }
  return counts;
}

function formatMap(m: Map<string, number>, sort = false): string {
  const entries = sort
    ? Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    : Array.from(m.entries());
  return entries.map(([k, v]) => `${k}: ${v}`).join(", ");
}

const STOPWORDS = new Set([
  "dan", "di", "ke", "dari", "yang", "untuk", "pada", "adalah", "ini", "itu",
  "tolong", "bantu", "tampilkan", "cari", "cek", "info", "informasi", "tentang",
  "siapa", "apa", "data", "pegawai", "kendaraan", "alat", "mesin", "aset", "ada",
  "bisa", "mohon", "apakah", "bagaimana", "berapa", "kapan", "dimana", "mana"
]);

export function buildDataContext(
  pegawai: Array<Record<string, unknown>>,
  kendaraan: Array<Record<string, unknown>>,
  alat: Array<Record<string, unknown>>,
  feed: unknown,
  query?: string,
): string {
  const totalPegawai = pegawai.length;
  const totalKendaraan = kendaraan.length;
  const totalAlat = alat.length;

  const byStatus = hitungField(pegawai, "status");
  const byKategori = hitungField(pegawai, "kategori_pppk");
  const byGolongan = hitungField(pegawai, "golongan");
  const byJabatan = hitungField(pegawai, "jabatan");

  const jabatanTop = Array.from(byJabatan.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  const pegawaiPrioritas = pegawai
    .filter((p) => adaTenggat(p.tgl_kgb as string, 60) || adaTenggat(p.tgl_pangkat as string, 90) || adaTenggat(p.tgl_pensiun as string, 120) || adaUlangTahun(p.tgl_lahir as string, 30))
    .slice(0, ATURAN_SOFT_LIMIT)
    .map((p) => ({
      nama: p.nama, nip: p.nip, jabatan: p.jabatan, golongan: p.golongan,
      status: p.status, kategori_pppk: p.kategori_pppk,
      tgl_lahir: p.tgl_lahir, tgl_kgb: p.tgl_kgb, tgl_pangkat: p.tgl_pangkat, tgl_pensiun: p.tgl_pensiun,
    }));

  const kondisiKendaraan = hitungField(kendaraan, "kondisi");
  const kondisiAlat = hitungField(alat, "kondisi");

  const kendaraanPrioritas = kendaraan
    .filter((k) => bukanBaik(k.kondisi as string))
    .slice(0, ATURAN_SOFT_LIMIT)
    .map((k) => ({
      jenis: k.jenis_kendaraan, merk: k.merk, no_polisi: k.no_polisi,
      kondisi: k.kondisi, pengguna: k.pengguna, lokasi: k.lokasi,
    }));

  const alatPrioritas = alat
    .filter((a) => bukanBaik(a.kondisi as string))
    .slice(0, ATURAN_SOFT_LIMIT)
    .map((a) => ({
      jenis: a.jenis, merk: a.merk, kondisi: a.kondisi, pengguna: a.pengguna,
      lokasi: a.lokasi,
    }));

  // Pencarian spesifik berbasis query pengguna
  let pegawaiCocok: Array<Record<string, unknown>> = [];
  let kendaraanCocok: Array<Record<string, unknown>> = [];
  let alatCocok: Array<Record<string, unknown>> = [];

  if (query && query.trim()) {
    const rawQuery = query.trim().toLowerCase();
    const tokens = rawQuery
      .split(/[^a-zA-Z0-9_-]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

    // Pencarian pegawai cocok
    pegawaiCocok = pegawai
      .filter((p) => {
        const nama = String(p.nama || "").toLowerCase();
        const nip = String(p.nip || "").toLowerCase();
        const email = String(p.email || "").toLowerCase();
        const jabatan = String(p.jabatan || "").toLowerCase();
        const bidang = String((p as any).bidang || "").toLowerCase();
        const tglLahir = String(p.tgl_lahir || "").toLowerCase();
        const haystack = `${nama} ${nip} ${email} ${jabatan} ${bidang} ${tglLahir}`;

        const isUltahQuery = rawQuery.includes("ulang tahun") || rawQuery.includes("ultah") || rawQuery.includes("lahir");
        if (isUltahQuery && adaUlangTahun(p.tgl_lahir as string, 30)) return true;

        if (haystack.includes(rawQuery) || rawQuery.includes(nama) || (nip && rawQuery.includes(nip))) return true;
        return tokens.some((t) => haystack.includes(t));
      })
      .slice(0, 15)
      .map((p) => ({
        nama: p.nama,
        nip: p.nip,
        status: p.status,
        kategori_pppk: p.kategori_pppk,
        jabatan: p.jabatan,
        bidang: (p as any).bidang,
        golongan: p.golongan,
        email: p.email,
        kontak: p.kontak,
        tgl_lahir: p.tgl_lahir,
        tgl_kgb: p.tgl_kgb,
        tgl_pangkat: p.tgl_pangkat,
        tgl_pensiun: p.tgl_pensiun,
        pendidikan: p.pendidikan,
        jurusan: p.jurusan,
        universitas_sekolah: p.universitas_sekolah,
      }));

    // Pencarian kendaraan cocok
    kendaraanCocok = kendaraan
      .filter((k) => {
        const noPol = String(k.no_polisi || "").toLowerCase();
        const merk = String(k.merk || "").toLowerCase();
        const jenis = String(k.jenis_kendaraan || "").toLowerCase();
        const pengguna = String(k.pengguna || "").toLowerCase();
        const haystack = `${noPol} ${merk} ${jenis} ${pengguna}`;

        if (haystack.includes(rawQuery)) return true;
        return tokens.some((t) => haystack.includes(t));
      })
      .slice(0, 10);

    // Pencarian alat cocok
    alatCocok = alat
      .filter((a) => {
        const kode = String(a.kode_barang || "").toLowerCase();
        const nama = String(a.nama_barang || "").toLowerCase();
        const merk = String(a.merk || "").toLowerCase();
        const pengguna = String(a.pengguna || "").toLowerCase();
        const haystack = `${kode} ${nama} ${merk} ${pengguna}`;

        if (haystack.includes(rawQuery)) return true;
        return tokens.some((t) => haystack.includes(t));
      })
      .slice(0, 10);
  }

  return JSON.stringify({
    ringkasan: {
      total_pegawai: totalPegawai,
      total_kendaraan: totalKendaraan,
      total_alat_mesin: totalAlat,
      pegawai_per_status: formatMap(byStatus),
      pegawai_per_kategori_pppk: formatMap(byKategori),
      pegawai_per_golongan: formatMap(byGolongan),
      jabatan_terbanyak: jabatanTop,
      kendaraan_per_kondisi: formatMap(kondisiKendaraan),
      alat_per_kondisi: formatMap(kondisiAlat),
    },
    notifikasi_jadwal: feed,
  });
}
