// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// ---------------------------------------------------------------------------
// SIMOSDA — Server-Side Captcha Verification Edge Function
// ---------------------------------------------------------------------------
// Menggantikan challenge generation yang sebelumnya di client-side (tidak aman).
// Flow:
//   1. Client POST /issue  → Server buat challenge, sign dengan HMAC, kirim token
//   2. Client selesaikan puzzle, kirim proof ke /verify
//   3. Server verifikasi HMAC + toleransi posisi + anti-replay → return {ok, token}
//   4. Login/Register hanya dilanjutkan bila verification token valid
// ---------------------------------------------------------------------------

// @ts-ignore
const CAPTCHA_SECRET = Deno.env.get("CAPTCHA_HMAC_SECRET") || "";
// @ts-ignore
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://simosda.app";

// In-memory anti-replay store (challenge ID yang sudah dipakai, bersih setiap cold start).
// Untuk horizontal scaling di production, ganti dengan Redis/Supabase table.
const usedChallenges = new Set<string>();
// Bersihkan entri lama setiap 10 menit untuk mencegah memory leak
setInterval(() => usedChallenges.clear(), 10 * 60 * 1000);

const corsHeaders = (origin?: string | null) => ({
  "Access-Control-Allow-Origin": origin?.startsWith("http") ? origin : ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

/** HMAC-SHA256 signing menggunakan Web Crypto API (tersedia di Deno Deploy). */
async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Verifikasi HMAC dengan constant-time comparison untuk mencegah timing attack. */
async function hmacVerify(message: string, secret: string, expected: string): Promise<boolean> {
  const actual = await hmacSign(message, secret);
  if (actual.length !== expected.length) return false;
  // Constant-time comparison
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** Generate challenge baru dan return signed token. */
async function handleIssue(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin");

  if (!CAPTCHA_SECRET) {
    return new Response(
      JSON.stringify({ ok: false, error: "Captcha service not configured" }),
      { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }

  let body: { purpose?: string; clientKey?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body opsional
  }

  const purpose = body.purpose === "register" ? "register" : "login";
  const clientKey = String(body.clientKey || "").slice(0, 64);

  // Generate challenge parameters
  const challengeId = crypto.randomUUID();
  const target = Math.floor(Math.random() * 70) + 15;   // 15–85 (% horizontal)
  const vertical = Math.floor(Math.random() * 80) + 10; // 10–90 (% vertical)
  const issuedAt = Date.now();
  const expiresIn = 300; // 5 menit

  // Payload yang akan di-sign: semua parameter challenge
  const payload = `${challengeId}:${target}:${vertical}:${issuedAt}:${purpose}:${clientKey}`;
  const signature = await hmacSign(payload, CAPTCHA_SECRET);

  // Token dikirim ke client — berisi seluruh state challenge (tidak ada DB write)
  const token = btoa(JSON.stringify({ challengeId, target, vertical, issuedAt, purpose, clientKey, signature }));

  return new Response(
    JSON.stringify({ ok: true, challengeId, target, vertical, expiresIn, token }),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
  );
}

/** Verifikasi jawaban puzzle dari client. */
async function handleVerify(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin");

  if (!CAPTCHA_SECRET) {
    return new Response(
      JSON.stringify({ ok: false, error: "Captcha service not configured" }),
      { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }

  let body: {
    token?: string;
    challengeId?: string;
    position?: number;
    elapsedMs?: number;
    track?: number[];
    clientKey?: string;
    width?: number;
  } = {};

  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Request body tidak valid." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }

  const { token, challengeId, position, elapsedMs, track, clientKey, width } = body;

  // Validasi input dasar
  if (!token || typeof position !== "number" || !challengeId) {
    return new Response(
      JSON.stringify({ ok: false, error: "Parameter verifikasi tidak lengkap." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }

  // Decode dan parse token
  let parsed: {
    challengeId: string;
    target: number;
    vertical: number;
    issuedAt: number;
    purpose: string;
    clientKey: string;
    signature: string;
  };

  try {
    parsed = JSON.parse(atob(token));
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Token captcha tidak valid." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }

  // 1. Cek challenge ID cocok dengan token
  if (parsed.challengeId !== challengeId) {
    return new Response(
      JSON.stringify({ ok: false, error: "Challenge ID tidak cocok." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }

  // 2. Cek clientKey cocok
  if (String(clientKey || "").slice(0, 64) !== parsed.clientKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "Session tidak valid." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }

  // 3. Cek token belum kadaluarsa (5 menit)
  const ageMs = Date.now() - parsed.issuedAt;
  if (ageMs > 5 * 60 * 1000) {
    return new Response(
      JSON.stringify({ ok: false, error: "Puzzle sudah kadaluarsa. Muat ulang puzzle." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }

  // 4. Anti-replay: setiap challenge ID hanya boleh dipakai sekali
  if (usedChallenges.has(challengeId)) {
    return new Response(
      JSON.stringify({ ok: false, error: "Puzzle sudah digunakan. Muat ulang puzzle." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }

  // 5. Verifikasi HMAC signature (memastikan token tidak dimanipulasi client)
  const expectedPayload = `${parsed.challengeId}:${parsed.target}:${parsed.vertical}:${parsed.issuedAt}:${parsed.purpose}:${parsed.clientKey}`;
  const signatureValid = await hmacVerify(expectedPayload, CAPTCHA_SECRET, parsed.signature);
  if (!signatureValid) {
    return new Response(
      JSON.stringify({ ok: false, error: "Token captcha tidak sah." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }

  // 6. Verifikasi posisi puzzle (toleransi ±3.5%)
  // Re-compute required position berdasarkan target dari token dan width canvas dari client
  // Logika harus identik dengan LogoSliderCaptcha.tsx
  const canvasWidth = typeof width === "number" ? Math.max(160, width) : 320;
  const PIECE_SIZE = 46;
  const logoSize = 124;
  const travel = Math.max(1, canvasWidth - PIECE_SIZE);
  const logoX = (canvasWidth - logoSize) / 2;
  const minSlotX = logoX;
  const maxSlotX = logoX + logoSize - PIECE_SIZE;
  const slotX = minSlotX + (parsed.target / 100) * (maxSlotX - minSlotX);
  const expectedPosition = (slotX / travel) * 100;

  // Pendekatan: verifikasi bahwa |position - expectedPosition| <= 4.5 (toleransi sedikit lebih longgar dari client)
  const tolerance = 4.5;
  if (Math.abs(position - expectedPosition) > tolerance) {
    // Meski posisi salah dari server view, tandai challenge sebagai sudah dicoba
    usedChallenges.add(challengeId);
    return new Response(
      JSON.stringify({ ok: false, error: "Posisi puzzle tidak tepat. Coba lagi." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }

  // 7. Verifikasi perilaku manusiawi: waktu drag minimal 500ms dan ada pergerakan
  if (typeof elapsedMs === "number" && elapsedMs < 400) {
    usedChallenges.add(challengeId);
    return new Response(
      JSON.stringify({ ok: false, error: "Geser terlalu cepat. Silakan coba lagi." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }
  if (Array.isArray(track) && track.length < 3) {
    usedChallenges.add(challengeId);
    return new Response(
      JSON.stringify({ ok: false, error: "Interaksi tidak valid. Silakan coba lagi." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }

  // ✅ Semua verifikasi lulus — tandai challenge sebagai sudah dipakai (anti-replay)
  usedChallenges.add(challengeId);

  // Return verification token — digunakan client sebagai bukti untuk login/register
  const verifiedPayload = `verified:${challengeId}:${Date.now()}`;
  const verifiedToken = await hmacSign(verifiedPayload, CAPTCHA_SECRET);

  return new Response(
    JSON.stringify({
      ok: true,
      verifiedToken,
      challengeId,
      message: "Captcha terverifikasi.",
    }),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
  );
}

serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || url.pathname.split("/").pop();

  try {
    if (action === "issue") return await handleIssue(req);
    if (action === "verify") return await handleVerify(req);
    return new Response(JSON.stringify({ error: "Unknown action. Use ?action=issue or ?action=verify" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[simosda-captcha] Error:", err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }
});
