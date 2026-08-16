import React, { useContext, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Eye, EyeOff, IdCard, KeyRound, Mail, ShieldAlert, UserPlus } from "lucide-react";
import { AuthContext } from "@/components/layout/AppShell";
import { LogoSliderCaptcha } from "@/components/auth/LogoSliderCaptcha";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { LoadingState } from "@/components/ui/LoadingState";
import { useTypewriterPlaceholder } from "@/hooks/useTypewriterPlaceholder";
import type { CaptchaProof } from "@/services/authService";
import bgUrl from "@/assets/images_landingpage.webp";

type Mode = "login" | "register";

function getClientKey(): string {
  const key = "simosda_auth_client_key";
  try {
    const current = sessionStorage.getItem(key);
    if (current) return current;
    const next = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(key, next);
    return next;
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

const inputClass = "w-full rounded-xl border border-white/70 dark:border-gray-700 bg-white/70 dark:bg-gray-900/70 py-2.5 pl-11 pr-4 text-sm font-semibold text-gray-900 dark:text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25";

const NIP_REGISTER_PHRASES = [
  "198507152010011002",
  "199203242020122001",
  "18 digit NIP resmi pegawai",
];
const NIP_LOGIN_PHRASES = [
  "198507152010011002",
  "18 digit NIP terdaftar",
];
const EMAIL_REGISTER_PHRASES = [
  "nama.pegawai@tangerangselatankota.go.id",
  "budi.santoso@dcktr.tangsel.go.id",
  "nama@instansi.go.id",
];
const PASSWORD_REGISTER_PHRASES = [
  "Rahasia#2026!Simosda",
  "KombinasiHuruf&Angka123",
  "Minimal 10 karakter kuat",
];
const PASSWORD_LOGIN_PHRASES = [
  "••••••••••••",
  "Masukkan password Anda",
];
const CONFIRM_PASSWORD_PHRASES = [
  "Rahasia#2026!Simosda",
  "KombinasiHuruf&Angka123",
  "Ulangi password yang sama",
];

export default function Login() {
  const { user, loading, loginWithPassword, registerAccount } = useContext(AuthContext);
  const clientKey = useMemo(getClientKey, []);
  const [mode, setMode] = useState<Mode>("login");
  const [nip, setNip] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaProof | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Countdown UI saat rate limit aktif (detik tersisa)
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // Periksa rate limit dari sessionStorage setiap detik saat lockout aktif
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setLockoutSeconds((prev) => {
        const next = prev - 1;
        if (next <= 0) clearInterval(timer);
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  // Animasi pengetikan placeholder (Typewriter effect) untuk memandu pengisian user
  const nipPlaceholder = useTypewriterPlaceholder(
    mode === "register" ? NIP_REGISTER_PHRASES : NIP_LOGIN_PHRASES,
    { typingSpeed: 60, deletingSpeed: 30, pauseDuration: 2200 }
  );
  const emailPlaceholder = useTypewriterPlaceholder(
    EMAIL_REGISTER_PHRASES,
    { typingSpeed: 55, deletingSpeed: 25, pauseDuration: 2000, enabled: mode === "register" }
  );
  const passwordPlaceholder = useTypewriterPlaceholder(
    mode === "register" ? PASSWORD_REGISTER_PHRASES : PASSWORD_LOGIN_PHRASES,
    { typingSpeed: 65, deletingSpeed: 30, pauseDuration: 2100 }
  );
  const confirmPlaceholder = useTypewriterPlaceholder(
    CONFIRM_PASSWORD_PHRASES,
    { typingSpeed: 65, deletingSpeed: 30, pauseDuration: 2100, enabled: mode === "register" }
  );

  if (user) return <Navigate to="/dashboard" replace />;

  function changeMode(next: Mode) {
    setMode(next);
    setPassword("");
    setConfirmation("");
    setCaptcha(null);
    setCaptchaReset((value) => value + 1);
    setError("");
    setNotice("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    const cleanNip = nip.replace(/\D/g, "");
    if (!/^\d{18}$/.test(cleanNip)) {
      setError("NIP wajib terdiri dari tepat 18 digit angka.");
      return;
    }
    if (mode === "register" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Masukkan email yang telah didaftarkan Administrator/Pimpinan.");
      return;
    }
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError("Password minimal 10 karakter dan harus memuat huruf serta angka.");
      return;
    }
    if (mode === "register" && password !== confirmation) {
      setError("Konfirmasi password tidak sama.");
      return;
    }
    if (!captcha) {
      setError("Selesaikan puzzle Logo SIMOSDA terlebih dahulu.");
      return;
    }

    try {
      if (mode === "login") {
        await loginWithPassword({ nip: cleanNip, password, captcha, clientKey });
      } else {
        const result = await registerAccount({ nip: cleanNip, email: email.trim().toLowerCase(), password, captcha, clientKey });
        if (result.requiresLogin) {
          setMode("login");
          setPassword("");
          setConfirmation("");
          setNotice(result.message || "Registrasi berhasil. Silakan masuk menggunakan NIP dan password Anda.");
        }
      }
    } catch (caught: any) {
      const msg: string = caught?.message || "Permintaan autentikasi gagal. Silakan coba kembali.";
      setError(msg);
      // Deteksi pesan rate limit untuk mengaktifkan countdown UI
      const waitMatch = msg.match(/(\d+)\s*detik/);
      if (waitMatch) {
        setLockoutSeconds(parseInt(waitMatch[1], 10));
      }
    } finally {
      setCaptcha(null);
      setCaptchaReset((value) => value + 1);
    }
  }

  return (
    <main className="min-h-screen bg-cover bg-center bg-no-repeat bg-gray-950 px-4 py-8" style={{ backgroundImage: `url(${bgUrl})` }}>
      <div className="fixed inset-0 bg-slate-950/25 backdrop-blur-[2px]" />
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center justify-center">
        <section className="w-full rounded-[32px] border border-white/55 bg-white/45 p-5 shadow-2xl backdrop-blur-2xl dark:bg-gray-950/55 sm:p-6 sm:px-8">
          <div className="mb-4 flex flex-col items-center text-center overflow-hidden">
            <BrandLogo className="mb-2 h-16 w-16 sm:h-16 sm:w-16" />
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-gray-950 dark:text-white">Selamat Datang di SIMOSDA</h1>
            <p className="mt-1 text-[11px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 px-1 whitespace-normal text-center tracking-tight sm:tracking-normal w-full">Sistem Manajemen Pegawai dan Monitoring Aset Daerah</p>
          </div>

          <div className="mb-4 grid grid-cols-2 rounded-2xl bg-white/50 p-1 dark:bg-gray-900/50">
            <button type="button" onClick={() => changeMode("login")} className={`rounded-xl px-3 py-2 text-sm font-bold transition ${mode === "login" ? "bg-blue-600 text-white shadow" : "text-gray-600 dark:text-gray-300"}`}>Masuk</button>
            <button type="button" onClick={() => changeMode("register")} className={`rounded-xl px-3 py-2 text-sm font-bold transition ${mode === "register" ? "bg-blue-600 text-white shadow" : "text-gray-600 dark:text-gray-300"}`}>Registrasi</button>
          </div>

          {loading ? <LoadingState compact label={mode === "login" ? "Memverifikasi akun" : "Mendaftarkan akun"} /> : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 text-sm font-semibold text-emerald-700">{notice}</div>}
              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/70 dark:text-red-300">
                  <ShieldAlert size={17} className="mt-0.5 shrink-0" /><span>{error}</span>
                </div>
              )}

              <label className="block">
                <div className="flex justify-between items-center mb-1">
                  <span className="block text-xs font-bold text-gray-700 dark:text-gray-300">NIP</span>
                  {nip.length > 0 && (
                    <span className={`text-[10px] font-mono font-semibold ${nip.length === 18 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                      {nip.length}/18 digit
                    </span>
                  )}
                </div>
                <span className="relative block">
                  <IdCard className="absolute left-3.5 top-3.5 text-gray-400" size={18} />
                  <input
                    value={nip}
                    maxLength={18}
                    onChange={(event) => setNip(event.target.value.replace(/\D/g, "").slice(0, 18))}
                    inputMode="numeric"
                    autoComplete="username"
                    placeholder={nipPlaceholder}
                    className={inputClass}
                  />
                </span>
              </label>

              {mode === "register" && (
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-gray-700 dark:text-gray-300">Email yang Didaftarkan Administrator/Pimpinan</span>
                  <span className="relative block">
                    <Mail className="absolute left-3.5 top-3.5 text-gray-400" size={18} />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      placeholder={emailPlaceholder}
                      className={inputClass}
                    />
                  </span>
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-xs font-bold text-gray-700 dark:text-gray-300">Password</span>
                <span className="relative block">
                  <KeyRound className="absolute left-3.5 top-3.5 text-gray-400" size={18} />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value.slice(0, 72))}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder={passwordPlaceholder}
                    className={`${inputClass} pr-12`}
                  />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-3 rounded-lg p-1 text-gray-500" aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                </span>
              </label>

              {mode === "register" && (
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-gray-700 dark:text-gray-300">Konfirmasi Password</span>
                  <span className="relative block">
                    <KeyRound className="absolute left-3.5 top-3.5 text-gray-400" size={18} />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value.slice(0, 72))}
                      autoComplete="new-password"
                      placeholder={confirmPlaceholder}
                      className={inputClass}
                    />
                  </span>
                </label>
              )}

              <LogoSliderCaptcha purpose={mode} clientKey={clientKey} resetKey={captchaReset} onChange={setCaptcha} />

              <button type="submit" disabled={!captcha || lockoutSeconds > 0} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-700 to-emerald-600 px-5 py-2.5 font-bold text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55">
                {lockoutSeconds > 0
                  ? <><span className="tabular-nums">{lockoutSeconds}s</span> — Tunggu sebelum mencoba kembali</>
                  : mode === "login" ? <><KeyRound size={18} /> Login</> : <><UserPlus size={18} /> Daftarkan Akun</>
                }
              </button>
              <p className="text-center text-xs font-medium text-gray-600 dark:text-gray-300">
                {mode === "login" ? "Gunakan NIP dan password yang dibuat saat registrasi." : "NIP, email, dan peran harus sudah ditetapkan Administrator/Pimpinan."}
              </p>
              {mode === "login" && (
                <p className="text-center text-[11px] text-gray-500 dark:text-gray-400">
                  Lupa password? Hubungi Administrator/Pimpinan untuk menjalankan Reset Registrasi.
                </p>
              )}
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
