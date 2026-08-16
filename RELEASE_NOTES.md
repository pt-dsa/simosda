# Release Notes — SIMOSDA V1.1.16 (Production Release)

Tanggal rilis: 4 Agustus 2026 (Asia/Jakarta)

---

## 🚀 Ringkasan Rilis

Versi V1.1.16 menandai kesiapan penuh SIMOSDA sebagai sistem manajemen kepegawaian dan monitoring aset daerah terpadu di lingkungan Dinas Cipta Karya dan Tata Ruang Pemerintah Kota Tangerang Selatan, dengan penyempurnaan menyeluruh pada relasional data akun, performa PWA, serta kecerdasan buatan (*AI Assistant*).

---

## 🔑 Fitur Utama & Penyempurnaan Sistem

### 1. Sinkronisasi Relasional Data Akun & Kepegawaian
- **Pembaruan Otomatis Akun**: Penambahan dan pengeditan data pegawai yang memiliki email resmi kini secara otomatis menyinkronkan data profil dan akun ke tabel akses (`app_access`).
- **Sinkronisasi Massal**: Tombol *Sinkronisasi* pada menu *Kelola Akun* menyinkronkan seluruh pegawai yang memiliki email valid secara instan dengan umpan balik visual yang informatif.
- **Validasi Keamanan**: Pegawai tanpa email tidak dapat diaktifkan akunnya guna menjaga integritas autentikasi berbasis Supabase Auth.

### 2. Kecerdasan Buatan (Tanya SIMOSDA & Voice Control)
- **Pencarian Kontekstual Dinamis**: Mesin context injector (`dataContext.ts`) kini memindai kata kunci pertanyaan secara spesifik pada nama, NIP, email, jabatan, merk kendaraan, nomor polisi, dan kode barang alat mesin.
- **Roster Pegawai Lengkap**: AI memiliki konteks menyeluruh terhadap seluruh pegawai terdaftar untuk menjawab pertanyaan personalia secara akurat.
- **Voice Control Terintegrasi**: Perintah suara langsung mengeksekusi navigasi menu dan filter data.

### 3. Peningkatan Pengalaman Pengguna (UI/UX)
- **Silent Geolocation Fallback**: Form modal penambahan aset (Kendaraan & Inventaris) tidak lagi memunculkan notifikasi error izin GPS secara otomatis saat form dimuat; koordinat GPS dapat diambil opsional secara manual melalui tombol lokasi.
- **Elevated Notification Toast**: Z-index notifikasi toast dinaikkan ke level tertinggi (`z-[9999]`) sehingga pesan status selalu terbaca jelas di atas seluruh lapisan modal.
- **Peta Interaktif Sebaran Aset**: Tampilan titik peta Leaflet yang responsif dengan filter kondisi aset (Baik, Rusak Ringan, Rusak Berat).

### 4. Arsitektur, Keamanan & PWA
- **Supabase BaaS & RLS**: PostgreSQL Row-Level Security dan Security Definer View (`user_emails`) untuk login aman menggunakan NIP.
- **Penyimpanan Cloud Storage**: Manajemen bucket foto profil pegawai (`pegawai-photos`), aset (`asset-photos`), dan dokumen lampiran BAST (`asset-attachments`).
- **PWA Service Worker**: PWA offline-first dengan otomatisasi update cache untuk mencegah *stale code*.

---

## 🧹 Pembersihan & Optimasi Codebase
- Menghapus komponen dead code (`TableSkeleton.tsx`, `birthdays.ts` yang redundant).
- Membersihkan skrip pengujian usang dan artefak pengujian mockup frame lama (`preview_check.py`, `debug_console.py`, `preview.html.png`).
- Memperbarui skrip manajer lokal (`start-server.bat`) dengan integrasi SIMOSDA.
