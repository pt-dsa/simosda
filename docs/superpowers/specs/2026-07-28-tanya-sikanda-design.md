# Tanya SIMOSDA: OpenRouter & Supabase Edge Function Design

## 1. Pemilihan Model (100% Gratis)
Sesuai permintaan Anda untuk tetap pada ekosistem gratis selamanya, kita akan menggunakan **Rantai Fallback** berikut di OpenRouter:
1. **Utama (Primary):** `google/gemini-2.5-flash:free`
2. **Cadangan 1 (Fallback 1):** `mistralai/mistral-nemo:free`
3. **Cadangan 2 (Fallback 2):** `meta-llama/llama-3.1-8b-instruct:free`

## 2. Pendekatan Arsitektur: Zero Data Leakage (AI-as-Router)
Karena Anda memiliki kekhawatiran yang sangat valid terkait privasi dan kebocoran data ke pihak ketiga (OpenRouter/Google/Meta), kita akan **membuang pendekatan injeksi data**. AI **TIDAK AKAN PERNAH** menerima, melihat, atau membaca isi database SIMOSDA (seperti nama pegawai, NIP, atau aset).

Sebagai gantinya, kita menggunakan pendekatan **AI Text-to-Intent**:
1. **Klien Bertanya:** User mengetik "Siapa yang pensiun bulan depan?"
2. **AI Menerjemahkan (Tanpa Data):** Edge Function mengirim pertanyaan ini ke OpenRouter. AI hanya bertugas menerjemahkan maksud (*intent*) pengguna ke dalam format JSON, misalnya: `{"action": "get_pensiun", "rentang_bulan": 1}`.
3. **Sistem Merespons (Aman):** Edge Function membaca JSON tersebut, menjalankan query ke database secara lokal dan aman (dengan RLS pengguna), lalu merangkum datanya menggunakan kode (*template string*) **tanpa mengirimkannya kembali ke AI**.
4. **Hasil:** Pengguna mendapatkan jawaban yang akurat, dan privasi data SIMOSDA 100% terjaga di dalam server kita sendiri.

## 3. Sistem Prompt (Persona Humanis & Eksekusi Intent)
Sistem prompt untuk OpenRouter akan dirancang seperti ini:
> "Kamu adalah otak di balik SIMOSDA (Sistem Manajemen Pegawai dan Monitoring Aset Daerah). Tugasmu HANYA menerjemahkan pertanyaan pengguna ke dalam format JSON 'intent' yang dimengerti sistem kami. Kamu tidak akan melihat data pengguna. Berbicaralah dengan ramah hanya sebagai pembuka jika pengguna hanya menyapa."

## 4. Mekanisme Fallback Otomatis
Jika model Utama mengalami `Rate Limit` (batas permintaan dari OpenRouter) atau tidak responsif, kode Edge Function otomatis melempar permintaan ke Cadangan 1, lalu Cadangan 2, memastikan pengguna selalu mendapat respons.

---
**Tindakan yang Dibutuhkan:**
Silakan setujui pembaruan spesifikasi ini (terutama mengenai pendekatan Zero Data Leakage/AI-as-Router). Jika Anda setuju, saya akan mematikan *brainstorming mode* dan lanjut membuat `implementation_plan.md` untuk menulis kodenya!
