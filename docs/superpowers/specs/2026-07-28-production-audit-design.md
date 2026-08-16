# SIMOSDA Production Pre-Release Audit Spec

## Latar Belakang
SIMOSDA telah menyelesaikan migrasi arsitektur dari Google Apps Script/Google Sheets ke Supabase (PostgreSQL). Menjelang rilis produksi (*production release*), aplikasi perlu melalui proses audit yang komprehensif untuk memastikan tidak ada sisa masalah migrasi, *bug* laten, atau inefisiensi performa yang dapat mengganggu pengalaman pengguna.

## Tujuan
Memastikan aplikasi stabil, aman, responsif, dan bebas dari isu *caching* yang usang (*stale cache*) sebelum diluncurkan ke *production environment*.

## Pendekatan
Audit akan dilakukan dengan metode **Iterative Deep Dive**, yang dibagi menjadi 3 fase utama.

### Fase 1: Kualitas Kode & Keamanan Dasar
- **Pengecekan Tipe Data (Type-Safety):** Menjalankan `tsc --noEmit` untuk mengidentifikasi dan memperbaiki *error* TypeScript yang belum tertangani.
- **Audit Integrasi Supabase:** Memeriksa `src/services` untuk memastikan bahwa semua interaksi dengan Supabase dilengkapi blok `try-catch` yang memadai dan tidak membiarkan aplikasi dalam kondisi *loading* abadi jika *Row Level Security* (RLS) menolak akses.
- **Pembersihan:** Menghapus *dead code*, *console.log* sisa *debugging*, dan *library* yang tidak lagi dipakai.

### Fase 2: Optimasi Performa & PWA
- **Validasi Build Config:** Memeriksa `vite.config.ts` untuk memastikan pemisahan bundel (*manualChunks*) berjalan sebagaimana mestinya tanpa menimbulkan pembengkakan ukuran *file* (bloat).
- **Audit Service Worker (PWA):** Menginspeksi konfigurasi `vite-plugin-pwa` untuk mencegah isu *stale cache* yang pernah terjadi sebelumnya. Aplikasi harus selalu mendapatkan versi terbaru saat pengguna menyegarkan halaman.

### Fase 3: Verifikasi Build & End-to-End Test
- **Kompilasi Produksi:** Menjalankan `npm run build` untuk menangkap *error* yang mungkin hanya muncul saat *minification* dan kompilasi statis.
- **Uji Coba Fungsional:** Menggunakan perintah tes yang tersedia (`npm run test`) atau melakukan *smoke test* manual pada aplikasi hasil *build* (`npm run serve`).

## Kriteria Sukses
1. Perintah `npm run verify` (`lint`, `test`, `build`) berhasil tanpa satupun *error*.
2. Aplikasi hasil kompilasi berjalan di *browser* dengan *Service Worker* aktif yang dapat memperbarui dirinya sendiri dengan benar.
3. Seluruh API Supabase merespons dengan struktur data yang diharapkan klien.
