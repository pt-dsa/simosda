# RUNBOOK OPERASIONAL SIMOSDA v1.1.16
*Terakhir diperbarui: 4 Agustus 2026*

---

## 🔍 1. Pemeriksaan Kesehatan Sistem (Health Check)

Lakukan verifikasi berkala untuk memastikan aplikasi dalam kondisi normal:

| Komponen | Metode / URL | Kriteria Normal | Catatan |
| :--- | :--- | :--- | :--- |
| **Frontend Web** | `https://simosda.tangerangselatankota.go.id` | HTTP 200 | Periksa ketersediaan UI & PWA Service Worker |
| **Supabase Auth API** | `https://<supabase-project-ref>.supabase.co/auth/v1/health` | HTTP 200 (`{"status":"ok"}`) | Backend autentikasi aktif |
| **Supabase PostgREST** | `https://<supabase-project-ref>.supabase.co/rest/v1/` | HTTP 200 | Endpoint API database |
| **Edge Function AI** | `https://<supabase-project-ref>.supabase.co/functions/v1/tanya-simosda` | HTTP 200 / 401 (Auth required) | Layanan Tanya SIMOSDA & Voice Assistant |

---

## 🚨 2. Prosedur Rollback & Pemulihan Darurat

Jika terjadi kegagalan rilis atau anomali data:

1. **Frontend Rollback (Vercel)**:
   - Akses [Vercel Dashboard → SIMOSDA → Deployments](https://vercel.com).
   - Temukan deployment stabil sebelumnya dan pilih opsi **"Instant Rollback"**.
2. **Database Point-in-Time Restore (Supabase)**:
   - Masuk ke [Supabase Dashboard → Project Settings → Backups](https://supabase.com/dashboard).
   - Lakukan restorasi data dari backup harian otomatis jika terjadi korupsi data massal.
3. **Penyebaran Ulang Edge Function**:
   - Jika layanan asisten AI terganggu, deploy ulang fungsi melalui Supabase CLI:
     ```bash
     npx supabase functions deploy tanya-simosda --project-ref <project-ref>
     ```

---

## ⚙️ 3. Variabel Lingkungan Produksi (Environment Variables)

Pastikan variabel-variabel berikut telah dikonfigurasi di dashboard hosting (Vercel):

- `VITE_SUPABASE_URL`: URL endpoint proyek Supabase (`https://<project-ref>.supabase.co`)
- `VITE_SUPABASE_ANON_KEY`: Anon / public API key Supabase
- `VITE_SUPABASE_PHOTO_BUCKET`: Nama bucket penyimpanan foto (`pegawai-photos`)

---

## 🛠️ 4. Prosedur Verifikasi Rilis Baru

Sebelum melakukan deployment ke branch utama:
```bash
# 1. Pastikan tidak ada error TypeScript
npm run lint

# 2. Jalankan test otomatis E2E
npm run test

# 3. Jalankan build produksi lokal
npm run build
```
Semua perintah di atas harus berhasil dengan status exit code 0.
