# RIWAYAT MIGRASI SIMOSDA: DARI GOOGLE APPS SCRIPT KE SUPABASE
**Versi Dokumen:** 1.0 (Juli 2026)  
**Status Arsitektur:** Production Ready (Supabase BaaS)

---

## 1. LATAR BELAKANG MIGRASI
Pada awalnya, SIMOSDA dibangun menggunakan **Google Apps Script (GAS)** sebagai *Backend Mediator* dan **Google Sheets** sebagai *Database* utama. Pendekatan ini dipilih untuk memfasilitasi peluncuran cepat dan iterasi awal. Namun, seiring bertambahnya kompleksitas fitur dan data, arsitektur ini mulai memunculkan beberapa masalah kritis:

1. **Performa Sangat Lambat (Bottleneck):** Pengambilan data dari Google Sheets (GViz API) memakan waktu yang sangat lama, terutama pada saat pertama kali aplikasi diakses (*cold start*). 
2. **Keterbatasan Cache & Sinkronisasi:** Untuk mengatasi lambatnya GAS, aplikasi terpaksa melakukan cache secara agresif di *browser* (sessionStorage). Hal ini memunculkan masalah inkonsistensi data, di mana pembaruan data tidak langsung terlihat (*stale data*).
3. **Risiko Skalabilitas Jangka Panjang:** Google Sheets memiliki batasan pemrosesan dan pembacaan yang ketat. Arsitektur ini tidak dirancang untuk menjadi sistem database relasional skala _Enterprise_.

Oleh karena itu, diputuskan untuk memigrasikan seluruh *backend* SIMOSDA ke **Supabase** (PostgreSQL).

---

## 2. ARSITEKTUR BARU: SUPABASE SEBAGAI BACKEND-AS-A-SERVICE
Dengan migrasi ini, seluruh folder *legacy* seperti `apps-script/` (berisi `Code.gs`) telah dihapus secara permanen. Supabase kini mengambil alih seluruh peran *backend*:

| Fitur | Era Google Apps Script (Lama) | Era Supabase (Baru) |
| :--- | :--- | :--- |
| **Database** | Google Sheets (Flat-file) | PostgreSQL (Relasional, Cepat, Terindeks) |
| **API Server** | `Code.gs` (Menerjemahkan request) | PostgREST API (Auto-generated & Instan) |
| **Otorisasi & Keamanan** | Pengecekan hard-coded di `Code.gs` | Row Level Security (RLS) di tingkat Database |
| **Penyimpanan Foto/File**| Google Drive | Supabase Storage (S3-compatible bucket) |
| **Integrasi AI** | `Code.gs` mencegat *prompt* Gemini | (Dalam transisi ke Supabase Edge Functions) |

---

## 3. PENYELESAIAN KENDALA TEKNIS SELAMA MIGRASI
Proses migrasi ke Supabase menghadapi beberapa tantangan teknis kompleks yang kini telah sepenuhnya terselesaikan:

### 3.1. Masalah CORS dan PWA Service Worker (Stale Cache)
*   **Gejala:** Pengguna mengalami pesan *error* `TypeError: Failed to fetch` saat mencoba login.
*   **Akar Masalah:** *Browser* pengguna secara agresif mengunci versi lama dari SIMOSDA melalui sistem *Service Worker* (PWA) untuk mode *Offline*. Versi lama ini masih berusaha memanggil fungsi RPC (`get_email_by_nip`) yang telah dihapus atau diblokir oleh Adblocker.
*   **Solusi:** Memaksa pencabutan (unregister) *Service Worker* lama melalui penambahan *script* pembunuh (*killer script*) di `index.html`, sehingga browser dipaksa untuk mengunduh kode JavaScript SIMOSDA versi terbaru yang sudah menggunakan Supabase.

### 3.2. Masalah "403 Forbidden" (PostgreSQL Table Privileges)
*   **Gejala:** Setelah pengguna berhasil terautentikasi (password benar), SIMOSDA tetap menampilkan *error* `Akun Anda belum terdaftar di SIMOSDA` karena gagal mengambil data dari tabel `app_access`. Dashboard Supabase mencatat banyak *error* `403 (Forbidden)`.
*   **Akar Masalah:** Meskipun kebijakan RLS (*Row Level Security*) telah diatur untuk mengizinkan pengguna *authenticated* membaca data, tabel-tabel tersebut ternyata tidak memiliki izin baca tingkat dasar (*Table-level Grants*). Hal ini menyebabkan API Supabase memblokir akses sebelum kode keamanan RLS sempat dievaluasi.
*   **Solusi:** Melakukan eksekusi kueri `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, anon;` secara langsung di *database* PostgreSQL untuk membuka izin akses dasar, yang kemudian diatur keamanannya oleh RLS.

### 3.3. Masalah "0 Baris Data" di Dashboard
*   **Gejala:** Setelah berhasil masuk, Dashboard SIMOSDA menampilkan angka indikator 0 (0 Pegawai, 0 Aset). Console menampilkan `Tabel 'pegawai' ditemukan tapi kosong (0 baris data)`.
*   **Akar Masalah:** Adanya fungsi bawaan dari sistem GAS lama (`primeDashboardSnapshot()`) yang bertujuan untuk memuat data awal secara massal demi menutupi lambatnya Google Sheets. Karena arsitektur baru tidak lagi memerlukan ini, fungsi tersebut malah mengembalikan objek kosong (`{}`) yang akhirnya di-cache oleh *browser*, sehingga menimpa hasil penarikan data asli dari Supabase.
*   **Solusi:** Menghapus fungsi *bulk snapshot* (`primeDashboardSnapshot()`) beserta panggilan *cache*-nya dari `dataService.ts`, sehingga SIMOSDA kini mengambil data mutakhir secara langsung dan individual dari Supabase.

---

## 4. KEAMANAN AKSES (PENGGUNAAN SECURITY DEFINER VIEW)
Salah satu fitur unik SIMOSDA adalah memungkinkan pengguna untuk **Login menggunakan NIP**, sedangkan sistem autentikasi bawaan Supabase (GoTrue) hanya mendukung **Login menggunakan Email**.

Untuk menjembatani hal ini tanpa mengorbankan keamanan:
1. Sebuah **View SQL** bernama `user_emails` diciptakan secara khusus di dalam Supabase.
2. View ini diberikan properti **SECURITY DEFINER** (menjalankan kueri dengan hak akses pembuatnya, yaitu admin database).
3. **Mengapa ini aman?** View ini **sangat dibatasi**. Ia hanya mengekspos dua kolom: `nip` dan `email`. Pengguna anonim (*anon*) yang belum masuk sistem dapat mengirimkan NIP mereka ke view ini, dan view ini akan mengembalikan Alamat Email mereka yang digunakan untuk memproses proses *Login* Supabase yang sebenarnya.
4. **Peringatan "UNRESTRICTED":** Dashboard Supabase akan memunculkan peringatan (Warning) tentang keberadaan *Security Definer View* ini. Peringatan ini adalah protokol standar Supabase. **JANGAN menekan tombol AUTOFIX** pada peringatan ini, karena akan merusak alur sistem masuk (Login) SIMOSDA. View ini telah dirancang 100% aman dan hanya mengembalikan pemetaan relasi publik NIP-Email tanpa mengekspos kata sandi atau data sensitif lainnya.

---

## 5. SKALABILITAS DAN BIAYA (SUPABASE FREE TIER)
Berdasarkan metrik SIMOSDA saat ini (~175 pegawai):
*   **Batas Pengguna Aktif (MAU):** SIMOSDA menggunakan sebagian sangat kecil dari batas 50.000 MAU per bulan.
*   **Penyimpanan Data Dasar:** Tekstual data 175 pegawai akan menghabiskan ruang jauh di bawah batas 500 MB.
*   **Penyimpanan Media:** Penyimpanan file dan foto memiliki alokasi 1 GB yang cukup luas.

Kesimpulannya, arsitektur *backend* SIMOSDA saat ini sangat ringan, responsif, aman, dan akan dapat berjalan tanpa memungut biaya apapun (sepenuhnya dalam jangkauan *Supabase Free Tier*) untuk jangka waktu yang sangat panjang ke depan.
