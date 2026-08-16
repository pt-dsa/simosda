import { supabase } from "@/lib/supabaseClient";
import type { AppUser } from "@/lib/rbac";
import { apiService } from "./apiService";

export type CaptchaPurpose = "login" | "register";

/** Data pembuktian puzzle yang dikirim oleh komponen LogoSliderCaptcha. */
export interface CaptchaProof {
  challengeId: string;
  position: number;
  elapsedMs: number;
  track: number[];
  /** Token signed yang dikeluarkan oleh Edge Function simosda-captcha saat issue. */
  token?: string;
  /** Lebar canvas saat puzzle diselesaikan untuk kalibrasi server. */
  width?: number;
}

/** Response dari Edge Function /issue */
export interface CaptchaChallenge {
  ok: true;
  challengeId: string;
  target: number;
  vertical: number;
  expiresIn: number;
  /** Token terenkripsi yang harus dikirim kembali saat verify. */
  token: string;
}

// ---------------------------------------------------------------------------
// Rate Limiting — Client-side Cooldown
// Mencegah spam percobaan dengan memberikan jeda antar submit.
// Server-side rate limit tetap berlaku di Supabase (lapisan kedua).
// ---------------------------------------------------------------------------
const RATE_LIMIT_KEY = "simosda_auth_ratelimit";
const RATE_LIMIT_WINDOW_MS = 30_000; // 30 detik cooldown setelah 5 gagal berturut-turut
const RATE_LIMIT_MAX_ATTEMPTS = 5;

interface RateLimitState {
  attempts: number;
  windowStart: number;
  lockedUntil: number;
}

function getRateLimitState(): RateLimitState {
  try {
    const raw = sessionStorage.getItem(RATE_LIMIT_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { attempts: 0, windowStart: Date.now(), lockedUntil: 0 };
}

function saveRateLimitState(state: RateLimitState) {
  try { sessionStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

function recordFailedAttempt(): { locked: boolean; remainingMs: number; remainingAttempts: number } {
  const state = getRateLimitState();
  const now = Date.now();

  // Reset window jika sudah lebih dari 30 detik sejak window pertama
  if (now - state.windowStart > RATE_LIMIT_WINDOW_MS) {
    state.attempts = 0;
    state.windowStart = now;
    state.lockedUntil = 0;
  }

  state.attempts += 1;

  if (state.attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
    state.lockedUntil = now + RATE_LIMIT_WINDOW_MS;
    saveRateLimitState(state);
    return { locked: true, remainingMs: RATE_LIMIT_WINDOW_MS, remainingAttempts: 0 };
  }

  saveRateLimitState(state);
  return {
    locked: false,
    remainingMs: 0,
    remainingAttempts: RATE_LIMIT_MAX_ATTEMPTS - state.attempts,
  };
}

function checkRateLimit(): { locked: boolean; remainingMs: number } {
  const state = getRateLimitState();
  const now = Date.now();
  if (state.lockedUntil > now) {
    return { locked: true, remainingMs: state.lockedUntil - now };
  }
  return { locked: false, remainingMs: 0 };
}

function clearRateLimit() {
  try { sessionStorage.removeItem(RATE_LIMIT_KEY); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Captcha Edge Function URL
// ---------------------------------------------------------------------------
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const CAPTCHA_FN_BASE = `${SUPABASE_URL}/functions/v1/simosda-captcha`;

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** Header standar untuk memanggil Edge Function secara anonymous. */
function captchaHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

export function extractAuthErrorMessage(err: any): string {
  if (!err) return "Permintaan autentikasi gagal. Silakan coba kembali.";
  if (typeof err === "string") {
    const trimmed = err.trim();
    if (!trimmed || trimmed === "{}" || trimmed === "null") return "Permintaan autentikasi gagal. Silakan coba kembali.";
    return trimmed;
  }
  const rawMsg = err.message || err.error_description || err.error || err.details;
  if (typeof rawMsg === "string") {
    const trimmed = rawMsg.trim();
    if (trimmed && trimmed !== "{}" && trimmed !== "null") {
      if (/user already registered|already exists|already registered/i.test(trimmed)) {
        return "Akun dengan email atau NIP ini sudah aktif terdaftar. Silakan masuk pada tab Masuk atau hubungi Administrator untuk reset registrasi.";
      }
      if (/invalid login credentials/i.test(trimmed)) {
        return "NIP atau password salah. Pastikan password sesuai dan akun telah menyelesaikan registrasi.";
      }
      if (/email not confirmed/i.test(trimmed)) {
        return "Email belum dikonfirmasi. Silakan hubungi Administrator.";
      }
      if (/rate limit|too many requests/i.test(trimmed)) {
        return "Terlalu banyak percobaan. Harap tunggu beberapa saat sebelum mencoba kembali.";
      }
      return trimmed;
    }
  }
  return "Permintaan autentikasi gagal. Silakan coba kembali.";
}

export const authService = {
  /**
   * Meminta challenge captcha dari server (Edge Function simosda-captcha).
   * Menggantikan implementasi client-side lama yang tidak aman.
   * Fallback ke mode lokal bila Edge Function belum di-deploy (dev environment).
   */
  challenge: async (purpose: CaptchaPurpose, clientKey: string): Promise<CaptchaChallenge> => {
    try {
      const res = await fetch(`${CAPTCHA_FN_BASE}?action=issue`, {
        method: "POST",
        headers: captchaHeaders(),
        body: JSON.stringify({ purpose, clientKey }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.challengeId) {
          return {
            ok: true,
            challengeId: data.challengeId,
            target: data.target,
            vertical: data.vertical,
            expiresIn: data.expiresIn ?? 300,
            token: data.token,
          };
        }
      }
    } catch (err) {
      console.warn("[SIMOSDA] Captcha Edge Function tidak tersedia, fallback ke mode lokal:", err);
    }

    // Fallback lokal — digunakan di dev bila Edge Function belum di-deploy.
    // Di production, Edge Function HARUS tersedia; login tetap berjalan tapi
    // flag `token` akan kosong sehingga verifikasi server dilewati.
    const target = Math.floor(Math.random() * 70) + 15;
    const vertical = Math.floor(Math.random() * 80) + 10;
    const challengeId = "local_" + Math.random().toString(36).substring(2, 9);
    return { ok: true, challengeId, target, vertical, expiresIn: 300, token: "" };
  },

  /**
   * Memverifikasi jawaban puzzle ke server sebelum melanjutkan autentikasi.
   * Hanya dipanggil bila token dari `challenge()` tersedia (mode production).
   */
  verifyCaptcha: async (proof: CaptchaProof, clientKey: string): Promise<void> => {
    // Jika tidak ada token (mode lokal/dev), lewati verifikasi server
    if (!proof.token) return;

    const res = await fetch(`${CAPTCHA_FN_BASE}?action=verify`, {
      method: "POST",
      headers: captchaHeaders(),
      body: JSON.stringify({
        token: proof.token,
        challengeId: proof.challengeId,
        position: proof.position,
        elapsedMs: proof.elapsedMs,
        track: proof.track,
        clientKey,
        width: proof.width,
      }),
    });

    const data = await res.json().catch(() => ({ ok: false, error: "Response tidak valid." }));
    if (!data.ok) {
      throw new Error(data.error || "Verifikasi captcha gagal. Silakan selesaikan puzzle kembali.");
    }
  },

  login: async (nip: string, password: string, captcha: CaptchaProof, clientKey: string) => {
    // 0. Cek rate limit sebelum melanjutkan
    const rl = checkRateLimit();
    if (rl.locked) {
      const sisa = Math.ceil(rl.remainingMs / 1000);
      throw new Error(`Terlalu banyak percobaan gagal. Harap tunggu ${sisa} detik sebelum mencoba kembali.`);
    }

    // 1. Verifikasi captcha di server (langkah keamanan sebelum menyentuh auth)
    await authService.verifyCaptcha(captcha, clientKey);

    const cleanNip = nip.trim();

    // 2. Verifikasi akun dan status aktivasi terlebih dahulu
    const { data: userData, error: rpcError } = await supabase
      .from("user_emails")
      .select("email, is_active, auth_status, registered_at")
      .eq("nip", cleanNip)
      .maybeSingle();

    if (rpcError || !userData || !userData.email) {
      recordFailedAttempt();
      throw new Error("Akun SIMOSDA dengan NIP tersebut tidak ditemukan.");
    }

    if (!userData.is_active || userData.auth_status === "disabled") {
      recordFailedAttempt();
      throw new Error("Akun SIMOSDA Anda telah dinonaktifkan oleh Administrator. Silakan hubungi Administrator.");
    }

    if (userData.auth_status === "ready" || !userData.registered_at) {
      throw new Error("Akun Anda belum menyelesaikan registrasi. Silakan klik tab 'Registrasi' untuk membuat password akun Anda.");
    }

    // 3. Lakukan login menggunakan kredensial yang telah terdaftar
    const { error } = await supabase.auth.signInWithPassword({
      email: userData.email,
      password,
    });

    if (error) {
      recordFailedAttempt();
      throw new Error(extractAuthErrorMessage(error));
    }

    // Login sukses — reset rate limit counter
    clearRateLimit();
    const user = await apiService.whoami();
    return { user, requiresLogin: false };
  },

  register: async (
    nip: string,
    email: string,
    password: string,
    captcha: CaptchaProof,
    clientKey: string
  ): Promise<{ requiresLogin: boolean; message?: string; user?: AppUser }> => {
    // 0. Cek rate limit
    const rl = checkRateLimit();
    if (rl.locked) {
      const sisa = Math.ceil(rl.remainingMs / 1000);
      throw new Error(`Terlalu banyak percobaan. Harap tunggu ${sisa} detik sebelum mencoba kembali.`);
    }

    // 1. Verifikasi captcha di server
    await authService.verifyCaptcha(captcha, clientKey);

    const cleanNip = nip.trim();
    const cleanEmail = email.trim().toLowerCase();

    // 2. Panggil RPC simosda_prepare_registration
    const { data: prepData, error: prepError } = await supabase.rpc("simosda_prepare_registration", {
      target_nip: cleanNip,
      target_email: cleanEmail,
    });

    if (prepError) {
      console.error("Prepare Registration RPC Error:", prepError);
      // Fallback check user_emails jika RPC mengalami kendala jaringan
      const { data: userData, error: rpcError } = await supabase
        .from("user_emails")
        .select("email, is_active, auth_status")
        .eq("nip", cleanNip)
        .maybeSingle();
      const dbEmail = userData?.email;
      if (rpcError || !userData || !dbEmail) {
        recordFailedAttempt();
        throw new Error("Akun SIMOSDA dengan NIP tersebut tidak ditemukan.");
      }
      if (dbEmail.toLowerCase() !== cleanEmail) {
        recordFailedAttempt();
        throw new Error("Email tidak sesuai dengan yang didaftarkan Administrator.");
      }
      if (!userData.is_active || userData.auth_status === "disabled") {
        throw new Error("Akun SIMOSDA dengan NIP dan Email tersebut sedang dinonaktifkan oleh Administrator.");
      }
    } else if (prepData && !prepData.ok) {
      recordFailedAttempt();
      throw new Error(prepData.error || "Akun SIMOSDA dengan NIP dan Email tersebut belum terdaftar atau tidak aktif.");
    }

    // 3. Lakukan pendaftaran akun Supabase Auth
    const { error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
    });

    if (error) {
      recordFailedAttempt();
      throw new Error(extractAuthErrorMessage(error));
    }

    clearRateLimit();
    return { requiresLogin: true, message: "Registrasi berhasil. Silakan masuk menggunakan NIP dan password Anda." };
  },

  logout: async () => {
    await supabase.auth.signOut();
  },
};
