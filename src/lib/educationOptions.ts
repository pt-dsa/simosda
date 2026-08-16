/**
 * Library suggestion pendidikan SIMOSDA.
 *
 * Daftar ini sengaja menjadi suggestion awal, bukan validasi tertutup: nama
 * kampus/sekolah dan program studi terus berubah, sehingga pengguna tetap
 * dapat mengetik nilai baru. Referensi institusi Indonesia mengikuti direktori
 * resmi satuan pendidikan/PDDIKTI; nilai yang sudah ada di database selalu
 * digabungkan oleh form agar tidak ada data eksisting yang hilang.
 *
 * Referensi: https://referensi.data.kemdikbud.go.id/pendidikan/dikti
 */

export const GOLONGAN_OPTIONS = [
  "I/a", "I/b", "I/c", "I/d",
  "II/a", "II/b", "II/c", "II/d",
  "III/a", "III/b", "III/c", "III/d",
  "IV/a", "IV/b", "IV/c", "IV/d", "IV/e",
  ...Array.from({ length: 17 }, (_, index) => `PPPK ${index + 1}`),
];

export const INDONESIAN_STUDY_PROGRAMS = [
  "Administrasi Bisnis", "Administrasi Negara", "Administrasi Publik", "Agribisnis",
  "Agroteknologi", "Akuntansi", "Arsitektur", "Bimbingan dan Konseling",
  "Biologi", "Bisnis Digital", "Desain Interior", "Desain Komunikasi Visual",
  "Ekonomi Pembangunan", "Farmasi", "Fisika", "Gizi", "Hubungan Internasional",
  "Hukum", "Ilmu Administrasi", "Ilmu Komunikasi", "Ilmu Pemerintahan",
  "Ilmu Perpustakaan", "Kebidanan", "Kedokteran", "Kedokteran Gigi",
  "Keperawatan", "Kesehatan Masyarakat", "Kimia", "Manajemen",
  "Manajemen Informatika", "Matematika", "Pendidikan Agama Islam",
  "Pendidikan Bahasa Indonesia", "Pendidikan Bahasa Inggris", "Pendidikan Biologi",
  "Pendidikan Ekonomi", "Pendidikan Fisika", "Pendidikan Guru Pendidikan Anak Usia Dini",
  "Pendidikan Guru Sekolah Dasar", "Pendidikan Jasmani", "Pendidikan Kimia",
  "Pendidikan Matematika", "Pendidikan Pancasila dan Kewarganegaraan",
  "Perencanaan Wilayah dan Kota", "Perhotelan", "Perpajakan", "Psikologi",
  "Sains Data", "Sastra Indonesia", "Sastra Inggris", "Sistem Informasi",
  "Statistika", "Teknik Arsitektur", "Teknik Elektro", "Teknik Geodesi",
  "Teknik Geologi", "Teknik Industri", "Teknik Informatika", "Teknik Kimia",
  "Teknik Komputer", "Teknik Lingkungan", "Teknik Mesin", "Teknik Sipil",
  "Teknologi Informasi", "Teknologi Pangan",
];

export const INDONESIAN_INSTITUTIONS = [
  "Institut Pertanian Bogor", "Institut Seni Indonesia Denpasar",
  "Institut Seni Indonesia Surakarta", "Institut Seni Indonesia Yogyakarta",
  "Institut Teknologi Bandung", "Institut Teknologi Kalimantan",
  "Institut Teknologi Sepuluh Nopember", "Institut Teknologi Sumatera",
  "Politeknik Elektronika Negeri Surabaya", "Politeknik Negeri Bandung",
  "Politeknik Negeri Jakarta", "Politeknik Negeri Malang", "Politeknik Negeri Media Kreatif",
  "Politeknik Negeri Semarang", "Politeknik Negeri Sriwijaya",
  "Universitas Airlangga", "Universitas Andalas", "Universitas Bina Nusantara",
  "Universitas Brawijaya", "Universitas Diponegoro", "Universitas Esa Unggul",
  "Universitas Gadjah Mada", "Universitas Gunadarma", "Universitas Hasanuddin",
  "Universitas Indonesia", "Universitas Islam Indonesia", "Universitas Islam Negeri Alauddin Makassar",
  "Universitas Islam Negeri Ar-Raniry Banda Aceh", "Universitas Islam Negeri Maulana Malik Ibrahim Malang",
  "Universitas Islam Negeri Raden Fatah Palembang", "Universitas Islam Negeri Syarif Hidayatullah Jakarta",
  "Universitas Islam Negeri Sunan Ampel Surabaya", "Universitas Islam Negeri Sunan Gunung Djati Bandung",
  "Universitas Islam Negeri Sunan Kalijaga Yogyakarta", "Universitas Islam Negeri Walisongo Semarang",
  "Universitas Jambi", "Universitas Jenderal Soedirman", "Universitas Katolik Indonesia Atma Jaya",
  "Universitas Komputer Indonesia", "Universitas Lampung", "Universitas Mercu Buana",
  "Universitas Muhammadiyah Jakarta", "Universitas Muhammadiyah Malang",
  "Universitas Muhammadiyah Surakarta", "Universitas Multimedia Nusantara",
  "Universitas Negeri Jakarta", "Universitas Negeri Makassar", "Universitas Negeri Malang",
  "Universitas Negeri Medan", "Universitas Negeri Padang", "Universitas Negeri Semarang",
  "Universitas Negeri Surabaya", "Universitas Negeri Yogyakarta", "Universitas Padjadjaran",
  "Universitas Pakuan", "Universitas Pamulang", "Universitas Pancasila",
  "Universitas Pembangunan Nasional Veteran Jakarta", "Universitas Pembangunan Nasional Veteran Jawa Timur",
  "Universitas Pembangunan Nasional Veteran Yogyakarta", "Universitas Pendidikan Indonesia",
  "Universitas Pertamina", "Universitas Riau", "Universitas Sam Ratulangi",
  "Universitas Sebelas Maret", "Universitas Sriwijaya", "Universitas Sultan Ageng Tirtayasa",
  "Universitas Sumatera Utara", "Universitas Syiah Kuala", "Universitas Tadulako",
  "Universitas Tanjungpura", "Universitas Tarumanagara", "Universitas Telkom",
  "Universitas Terbuka", "Universitas Trisakti", "Universitas Udayana",
];

export function mergeSuggestionOptions(...groups: Array<Array<string | null | undefined>>): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const group of groups) {
    for (const raw of group) {
      const value = String(raw || "").trim();
      const key = value.toLocaleUpperCase("id-ID");
      if (!value || seen.has(key)) continue;
      seen.add(key);
      values.push(value);
    }
  }
  return values.sort((a, b) => a.localeCompare(b, "id", { numeric: true }));
}

