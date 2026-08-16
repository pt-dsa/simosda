# SIMOSDA (Sistem Manajemen Pegawai dan Monitoring Aset Daerah)

SIMOSDA adalah aplikasi web terpadu (*Progressive Web App*) untuk pengelolaan data kepegawaian (ASN & PPPK) dan monitoring aset daerah (Kendaraan, Alat & Mesin, serta Inventaris) di lingkungan Pemerintah Kota Tangerang Selatan — Dinas Cipta Karya dan Tata Ruang.

---

## 🏗️ Arsitektur Sistem

SIMOSDA dibangun di atas arsitektur modern berbasis **Supabase Backend-as-a-Service (BaaS)** dan **React + Vite Frontend**:

1. **Database & API Layer**:
   - PostgreSQL dengan Row-Level Security (RLS) & Security Definer Views (`user_emails`).
   - PostgREST melalui `@supabase/supabase-js` untuk seluruh operasi data real-time dan transaksional.
2. **Autentikasi & Otorisasi**:
   - Supabase Auth terintegrasi dengan tabel akses pegawai (`app_access`).
   - Role-Based Access Control (RBAC) mendukung hak akses `admin` (Administrator), `pimpinan` (Pimpinan), dan `pegawai` (Pegawai).
   - Sinkronisasi otomatis dari master data pegawai ke tabel akun saat pegawai memiliki email valid.
3. **Penyimpanan Media (Storage)**:
   - Supabase Storage Bucket untuk foto profil pegawai (`pegawai-photos`), foto aset (`asset-photos`), dan lampiran dokumen BAST/faktur (`asset-attachments`).
4. **Kecerdasan Buatan (AI Assistant)**:
   - Supabase Edge Functions (`tanya-simosda`) untuk asisten AI interaktif dengan dukungan *Voice Assistant*.
   - **Database-First Agentic RAG**: Menggunakan arsitektur *ReAct Loop* dengan *Native Tool Calling* yang memungkinkan AI melakukan *query* langsung ke database secara aman (dengan RLS) untuk pencarian presisi tinggi secara *real-time*.
5. **PWA & UI/UX**:
   - Progressive Web App (PWA) dengan Service Worker otomatis untuk performa cepat dan pengalaman aplikasi offline-first.
   - Peta visualisasi titik sebaran aset interaktif berbasis Leaflet Maps.
   - Dark/Light theme toggle dan antarmuka responsif Tailwind CSS.

---

## 📂 Struktur Direktori Proyek

```text
simosda/
├── .agents/               # Definisi custom skills untuk AI Agent
├── docs/                  # Spesifikasi desain dan dokumentasi arsitektur
├── public/                # Asset publik, favicon, manifest PWA
├── src/
│   ├── assets/            # Gambar dan logo aplikasi
│   ├── components/        # Komponen UI modular (Auth, Layout, Maps, Theme, UI)
│   ├── lib/               # Utility, helper data context, RBAC, dan sanitasi
│   ├── pages/             # Halaman menu utama SIMOSDA
│   ├── services/          # Integrasi API Supabase & manajemen data
│   ├── types.ts           # Definisi interface dan tipe TypeScript
│   ├── App.tsx            # Root routing & provider aplikasi
│   └── main.tsx           # Entry point React
├── supabase/              # Migrasi SQL & Edge Functions (tanya-simosda)
├── tests/                 # Skrip pengujian E2E & regresi sinkronisasi
├── index.html             # HTML template
├── package.json           # Dependensi dan skrip proyek
├── start-server.bat       # Localhost manager untuk Windows
├── tsconfig.json          # Konfigurasi TypeScript
└── vite.config.ts         # Konfigurasi Vite & PWA
```

---

## 🚀 Panduan Pengembangan Lokal

### 1. Prasyarat
- Node.js versi 18 atau lebih baru
- Python 3.8+ (opsional, untuk menjalankan skrip test Playwright)

### 2. Pemasangan Dependensi
```bash
npm install
```

### 3. Konfigurasi Lingkungan (.env)
Salin `.env.example` menjadi `.env` dan sesuaikan variabel konfigurasi Supabase:
```env
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_SUPABASE_PHOTO_BUCKET=pegawai-photos
```

### 4. Menjalankan Server Pengembangan
```bash
npm run dev
```
Akses aplikasi melalui browser pada `http://localhost:3000`.

### 5. Verifikasi, Pengujian & Build Produksi
```bash
# Validasi TypeScript
npm run lint

# Jalankan E2E Test
npm run test

# Kompilasi Produksi (Production Build)
npm run build

# Simulasi Server Produksi Lokal
npm run serve
```

---

## 📜 Lisensi & Hak Cipta
Hak Cipta © 2026 Pemerintah Kota Tangerang Selatan — Dinas Cipta Karya dan Tata Ruang.
