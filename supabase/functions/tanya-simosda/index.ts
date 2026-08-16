// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.9";

// Kunci API AI: Mendukung Dual-Provider (Google AI Studio Gemini & OpenRouter)
// @ts-ignore
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
// @ts-ignore
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
// @ts-ignore
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
// @ts-ignore
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Origin yang diizinkan — diset dari env agar aman di production.
// @ts-ignore
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://simosda.app";

const corsHeaders = (origin?: string | null) => ({
  "Access-Control-Allow-Origin": origin && origin.startsWith("http")
    ? origin
    : ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const ROLE_REQUIRED = ["admin", "pimpinan", "pegawai"];

// Verifikasi JWT dari header Authorization dan kembalikan user + role.
async function verifyCaller(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { ok: false as const, error: "Missing Authorization header", status: 401 };
  }

  // Membuat client dengan service role untuk verifikasi token (RLS diabaikan).
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) {
    return { ok: false as const, error: "Invalid or expired token", status: 401 };
  }

  const email = String(user.email || "").toLowerCase();
  if (!email) {
    return { ok: false as const, error: "Account has no email", status: 401 };
  }

  const { data: access, error: accessError } = await admin
    .from("app_access")
    .select("role, nip, is_active")
    .eq("email", email)
    .maybeSingle();

  if (accessError) {
    console.error("Access lookup error:", accessError);
    return { ok: false as const, error: "Access lookup failed", status: 500 };
  }
  if (!access || !access.is_active || !ROLE_REQUIRED.includes(access.role)) {
    return { ok: false as const, error: "Akun belum terdaftar atau tidak aktif di SIMOSDA.", status: 403 };
  }

  return { ok: true as const, user, role: access.role, nip: access.nip, token };
}

// Alat Bantu Pencarian Database (Tools)
async function queryDatabase(userToken: string, table: string, select: string, filterColumn?: string, filterValue?: string) {
  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${userToken}` } }
  });
  
  const allowedTables = ["pegawai", "assets_vehicle", "assets_equipment", "loans", "maintenance"];
  if (!allowedTables.includes(table)) return `Error: Tabel ${table} tidak diizinkan.`;

  let q = userClient.from(table).select(select || "*").limit(100);
  if (filterColumn && filterValue) {
    if (filterValue === "is_not_null") {
      q = q.not(filterColumn, 'is', null);
    } else if (filterValue === "is_null") {
      q = q.is(filterColumn, null);
    } else {
      q = q.ilike(filterColumn, filterValue.includes("%") ? filterValue : `%${filterValue}%`);
    }
  }
  
  const { data, error } = await q;
  if (error) return `Error query: ${error.message}`;
  
  const resStr = JSON.stringify(data || []);
  return resStr.length > 15000 ? resStr.substring(0, 15000) + "...[dipotong]" : resStr;
}

// Batasi panjang data context agar hemat token dan respon cepat.
function capContext(context: string, maxChars = 18000) {
  if (!context || context.length <= maxChars) return context;
  return context.slice(0, maxChars) + "\n...[data dipangkas agar hemat memori]";
}

function corsHeadersFor(req: Request) {
  const origin = req.headers.get("Origin");
  return corsHeaders(origin);
}

// Pembersih teks pidato dari simbol markdown (penghilang kata 'asterisk')
function cleanSpeechForVoice(text: string): string {
  if (!text) return "";
  return text
    .replace(/SIMOSDA/g, "Simosda")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    .replace(/\*/g, "")
    .replace(/#+\s*/g, "")
    .replace(/`+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[\s*-•\d.]+/gm, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeVoiceOutput(rawText: string): string {
  let text = rawText || "";
  
  // Deteksi format ganda [SCREEN_TEXT] dan [VOICE_SPEECH] dari Prompt V2
  if (text.includes("[VOICE_SPEECH]")) {
    const parts = text.split("[VOICE_SPEECH]");
    let screenText = parts[0].replace("[SCREEN_TEXT]", "").trim();
    let voiceSpeech = parts[1].trim();
    
    return JSON.stringify({
      action: "REPLY_ONLY",
      speech: cleanSpeechForVoice(voiceSpeech),
      payload: { screenText }
    });
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) text = jsonMatch[0];
  text = text.replace(/```json/gi, "").replace(/```/g, "").trim();

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.speech === "string") {
        parsed.speech = cleanSpeechForVoice(parsed.speech);
      }
      return JSON.stringify(parsed);
    }
  } catch {
    // fallback if JSON parsing fails
  }
  
  // Jika format AI bukan JSON yang valid, berikan respons JSON fallback
  const safeText = cleanSpeechForVoice(text);
  return JSON.stringify({
    action: "REPLY_ONLY",
    speech: safeText
  });
}

// Pemanggil Google Gemini API (Google Generative AI) - Ultra Cepat
async function callGemini(question: string, history: any[], systemPrompt: string, apiKey: string) {
  const historyText = history && history.length > 0
    ? history.slice(-3).map((h: any) => `${h.role === 'user' ? 'Pengguna' : 'Asisten'}: ${h.content}`).join('\n')
    : "Belum ada riwayat.";

  const prompt = `${systemPrompt}\n\nRiwayat Percakapan:\n${historyText}\n\nPerintah/Pertanyaan Pengguna:\n${question}`;

  const models = ["gemini-2.0-flash", "gemini-1.5-flash"];
  let lastError: any = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30000), // Diperpanjang agar pertanyaan analitik tidak gagal
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
          }
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Gemini API Error ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Gemini API mengembalikan respons kosong.");
      return text;
    } catch (err) {
      console.warn(`Gemini model ${model} gagal:`, err);
      lastError = err;
    }
  }

  throw lastError;
}

// Pemanggil OpenRouter API - Cepat dengan Timeout
async function callOpenRouter(question: string, history: any[], systemPrompt: string, apiKey: string) {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-3).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: question },
  ];

  const models = [
    "google/gemini-2.0-pro-exp-02-05:free",
    "google/gemini-2.0-flash-lite-preview-02-05:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "openai/gpt-oss-120b" // fallback if free endpoints are removed
  ];
  let lastError: any = null;

  for (const model of models) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://simosda.app",
          "X-Title": "SIMOSDA"
        },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          model,
          messages,
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`OpenRouter Error: ${res.status} - ${errorText}`);
      }

      const data = await res.json();
      return data.choices[0].message.content;
    } catch (err) {
      console.warn(`OpenRouter model ${model} gagal:`, err);
      lastError = err;
    }
  }

  throw lastError;
}

// Fallback Rule-Based untuk Voice Intent jika AI tidak aktif/offline
function getLocalVoiceFallbackJSON(question: string): string {
  const q = question.toLowerCase();

  if (/gelap|dark\s*mode|tema\s*gelap|hitam/.test(q)) {
    return JSON.stringify({
      action: "THEME",
      target: "dark",
      speech: "Baik, tampilan sudah saya ganti ke mode gelap."
    });
  }

  if (/terang|light\s*mode|tema\s*terang|putih/.test(q)) {
    return JSON.stringify({
      action: "THEME",
      target: "light",
      speech: "Baik, tampilan sudah saya ganti ke mode terang."
    });
  }

  if (/dashboard|beranda|utama|home/.test(q)) {
    return JSON.stringify({
      action: "NAVIGATE",
      target: "/dashboard",
      speech: "Membuka halaman Dashboard."
    });
  }

  if (/pegawai|asn|pppk|staff|karyawan/.test(q)) {
    return JSON.stringify({
      action: "NAVIGATE",
      target: "/pegawai",
      speech: "Membuka daftar data pegawai."
    });
  }

  if (/penjagaan|buku\s*penjagaan|agenda|jadwal|tenggat|pangkat|kgb|pensiun/.test(q)) {
    return JSON.stringify({
      action: "NAVIGATE",
      target: "/buku-penjagaan",
      speech: "Membuka halaman Buku Penjagaan."
    });
  }

  if (/kendaraan|mobil|motor/.test(q)) {
    return JSON.stringify({
      action: "NAVIGATE",
      target: "/kendaraan",
      speech: "Membuka daftar data kendaraan."
    });
  }

  if (/inventaris|ruangan|barang/.test(q)) {
    return JSON.stringify({
      action: "NAVIGATE",
      target: "/inventaris",
      speech: "Membuka halaman inventaris."
    });
  }

  if (/alat|mesin/.test(q)) {
    return JSON.stringify({
      action: "NAVIGATE",
      target: "/alat-mesin",
      speech: "Membuka data alat dan mesin."
    });
  }

  if (/pagu|anggaran|budget/.test(q)) {
    return JSON.stringify({
      action: "NAVIGATE",
      target: "/pagu",
      speech: "Membuka halaman pagu anggaran."
    });
  }

  if (/pemeliharaan|servis|service|bengkel/.test(q)) {
    return JSON.stringify({
      action: "NAVIGATE",
      target: "/pemeliharaan-kendaraan",
      speech: "Membuka riwayat pemeliharaan kendaraan."
    });
  }

  if (/peminjaman|pinjam|booking/.test(q)) {
    return JSON.stringify({
      action: "NAVIGATE",
      target: "/peminjaman",
      speech: "Membuka alur peminjaman aset."
    });
  }

  if (/peta|sebaran|lokasi|koordinat|gis/.test(q)) {
    return JSON.stringify({
      action: "NAVIGATE",
      target: "/peta",
      speech: "Membuka peta sebaran lokasi aset."
    });
  }

  if (/laporan|rekap|cetak/.test(q)) {
    return JSON.stringify({
      action: "NAVIGATE",
      target: "/laporan",
      speech: "Membuka rekap laporan."
    });
  }

  if (/tanya|chat|asisten/.test(q)) {
    return JSON.stringify({
      action: "NAVIGATE",
      target: "/tanya",
      speech: "Membuka asisten Tanya Simosda."
    });
  }

  if (/akun|pengaturan|profil|password/.test(q)) {
    return JSON.stringify({
      action: "NAVIGATE",
      target: "/kelola-akun",
      speech: "Membuka halaman kelola akun."
    });
  }

  if (/cleansing|pembersihan|validasi/.test(q)) {
    return JSON.stringify({
      action: "NAVIGATE",
      target: "/cleansing",
      speech: "Membuka modul data cleansing."
    });
  }

  return JSON.stringify({
    action: "REPLY_ONLY",
    target: "",
    speech: "Saya mendengarkan. Anda dapat memberi perintah seperti Buka Pegawai, Data Kendaraan, atau Ganti Tema Gelap."
  });
}

async function callLLM(question: string, history: any[], systemPrompt: string): Promise<string> {
  const hasGemini = Boolean(GEMINI_API_KEY && GEMINI_API_KEY.trim());
  const hasOpenRouter = Boolean(OPENROUTER_API_KEY && OPENROUTER_API_KEY.trim());

  if (hasGemini) {
    try {
      return await callGemini(question, history, systemPrompt, GEMINI_API_KEY);
    } catch (err) {
      console.warn("Gemini API gagal, mencoba OpenRouter:", err);
      if (hasOpenRouter) {
        return await callOpenRouter(question, history, systemPrompt, OPENROUTER_API_KEY);
      }
      throw err;
    }
  } else if (hasOpenRouter) {
    return await callOpenRouter(question, history, systemPrompt, OPENROUTER_API_KEY);
  }
  
  throw new Error("Tidak ada API Key yang dikonfigurasi.");
}

// Orchestrator Pemanggil AI (Agentic RAG ReAct Loop)
async function generateAIResponse(question: string, history: any[], systemPrompt: string, mode: string | undefined, userToken: string): Promise<string> {
  const TOOL_INSTRUCTION = `
=================================
INSTRUKSI PENCARIAN DATABASE (TOOLS):
Jika Anda memerlukan data akurat dari database yang belum ada di "Data Referensi" (misal: mencari siapa saja yang ulang tahun bulan ini, daftar kendaraan rusak, profil NIP tertentu), Anda HARUS melakukan query ke database!
Untuk query, keluarkan format teks berikut ini lalu BERHENTI (jangan tulis apapun setelah tag penutup):
<TOOL_CALL>
{"table": "pegawai", "select": "nama,nip,tgl_lahir", "filterColumn": "tgl_lahir", "filterValue": "is_not_null"}
</TOOL_CALL>

Tabel tersedia: pegawai, assets_vehicle, assets_equipment.
- "select" wajib diisi dengan kolom yang dibutuhkan (misal: "nama,tgl_lahir").
- "filterColumn" & "filterValue" opsional.
Sistem akan membalas dengan hasil database, lalu Anda dapat merangkumnya ke pengguna.
=================================
`;

  const finalSystemPrompt = systemPrompt + "\n" + TOOL_INSTRUCTION;
  let currentQuestion = question;
  
  // Maksimal 3 iterasi loop untuk mencegah infinite loop
  for (let i = 0; i < 3; i++) {
    try {
      const rawOutput = await callLLM(currentQuestion, history, finalSystemPrompt);
      
      const toolMatch = rawOutput.match(/<TOOL_CALL>([\s\S]*?)<\/TOOL_CALL>/);
      if (toolMatch) {
        try {
          const args = JSON.parse(toolMatch[1]);
          const dbResult = await queryDatabase(userToken, args.table, args.select, args.filterColumn, args.filterValue);
          
          currentQuestion = `${currentQuestion}\n\n[System Response - Hasil Query Database]:\n${dbResult}\n\nSilakan lanjutkan menjawab pertanyaan awal pengguna berdasarkan data di atas secara komprehensif. JANGAN panggil tool lagi jika data sudah cukup.`;
          continue; // Lanjut iterasi dengan hasil DB
        } catch (parseError) {
          currentQuestion = `${currentQuestion}\n\n[System Response]: Format <TOOL_CALL> salah atau JSON tidak valid. Tolong langsung jawab atau perbaiki format JSON-nya.`;
          continue;
        }
      }
      
      // Jika tidak ada tool call, berarti AI sudah memberikan jawaban final
      return mode === "voice" ? sanitizeVoiceOutput(rawOutput) : rawOutput;
    } catch (e: any) {
      if (!GEMINI_API_KEY && !OPENROUTER_API_KEY) {
        if (mode === "voice") return getLocalVoiceFallbackJSON(question);
        return "Layanan Tanya SIMOSDA siap digunakan. Tambahkan GEMINI_API_KEY atau OPENROUTER_API_KEY di Supabase Secrets.";
      }
      if (mode === "voice") return getLocalVoiceFallbackJSON(question);
      return `Maaf, koneksi ke server AI mengalami kendala: ${e.message}`;
    }
  }
  
  return "Maaf, pencarian data terlalu kompleks sehingga batas waktu terlampaui. Silakan spesifikkan pertanyaan Anda.";
}

serve(async (req: Request) => {
  const headers = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...headers, "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    // 1. Verifikasi identitas pemanggil (JWT wajib).
    const auth = await verifyCaller(req);
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: auth.error }), {
        headers: { ...headers, "Content-Type": "application/json" },
        status: auth.status,
      });
    }

    // 2. Parsing body dan batasi ukurannya (anti abuse / hemat memori).
    const rawBody = await req.text();
    if (rawBody.length > 200_000) {
      return new Response(JSON.stringify({ error: "Request body terlalu besar." }), {
        headers: { ...headers, "Content-Type": "application/json" },
        status: 413,
      });
    }

    const { question, history, dataContext, mode } = JSON.parse(rawBody || "{}");

    if (typeof question !== "string" || question.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Pertanyaan kosong." }), {
        headers: { ...headers, "Content-Type": "application/json" },
        status: 400,
      });
    }
    if (question.length > 2000) {
      return new Response(JSON.stringify({ error: "Pertanyaan terlalu panjang (maks 2000 karakter)." }), {
        headers: { ...headers, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // 3. Efisiensi token: pangkas konteks data agar tidak boros token.
    const safeContext = capContext(String(dataContext || ""));

    const nowWIB = new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "full",
      timeStyle: "long"
    });

    const inputChannel = mode === "voice" ? "voice" : "text";
    const SYSTEM_PROMPT = `Anda adalah "Tanya SIMOSDA", asisten cerdas berbasis kecerdasan buatan (AI) yang terintegrasi secara native di dalam menu utama aplikasi SIMOSDA.
Anda beroperasi dengan metode Hybrid RAG.

IDENTITAS SESI:
- user_role: ${auth.role}
- user_nip: ${auth.nip}
- input_channel: ${inputChannel}
- Waktu saat ini: ${nowWIB}

PROTOKOL KEAMANAN DATA BERBASIS PERAN:
1. Pegawai (User Biasa / Staf): Hanya diizinkan melihat data diri sendiri (sesuai user_nip aktif) dan aset yang dipinjam atas nama dirinya. Tolak jika menanyakan data pribadi pegawai lain.
2. Pimpinan: Diizinkan melihat data agregasi, grafik rekapitulasi pegawai, status keseluruhan aset dalam unit kerjanya, sisa anggaran pemeliharaan, serta daftar peringatan Buku Penjagaan. Hak baca (read-only).
3. Admin: Memiliki wewenang penuh untuk membaca seluruh data sistem.

METODOLOGI HYBRID RAG SIMOSDA:
A. Minimasi Data: Hanya tampilkan kolom/baris yang ditanyakan.
B. Pemisahan Konteks: Sajikan data apa adanya dari database secara objektif.
C. Penandaan Risiko secara Proaktif (Flagging): Tambahkan peringatan jika sisa waktu Buku Penjagaan <= 12 bulan (Kuning) atau <= 6 bulan (Merah). Juga untuk kondisi aset "Rusak" atau "Butuh Servis".
D. Kejujuran: Akui keterbatasan secara jujur jika data tidak ditemukan. Jangan mengarang data.

Data Referensi (Pegawai, Jadwal, Kendaraan, Alat Mesin):
${safeContext}

OPTIMASI OUTPUT MULTI-FORMAT (Berdasarkan Saluran Input):
1. Jika input_channel == "text":
Berikan respons tertulis standar yang kaya informasi menggunakan markdown, cetak tebal, daftar poin, dan tabel data terperinci.
Format output:
### 1. Informasi Utama
...
### 2. Sumber Data & Regulasi
...
### 3. Peringatan Proaktif (Jika Ada)
...

2. Jika input_channel == "voice":
Anda harus menghasilkan DUA blok output terpisah di dalam satu respons tanpa JSON:
[SCREEN_TEXT]
(Isi laporan visual lengkap dengan format markdown seperti format text di atas)
[VOICE_SPEECH]
(Teks ringkas naratif yang dirancang khusus untuk dibacakan oleh mesin Text-to-Speech. Bebas simbol markdown, gunakan penyebutan lisan alami).`;

    const aiAnswer = await generateAIResponse(question, history || [], SYSTEM_PROMPT, mode, auth.token);

    return new Response(JSON.stringify({ ok: true, answer: aiAnswer }), {
      headers: { ...headers, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Supabase Edge Function Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Terjadi kendala saat memproses permintaan AI." }), {
      headers: { ...headers, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
