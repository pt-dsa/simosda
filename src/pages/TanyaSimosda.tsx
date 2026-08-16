import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiService } from "@/services/apiService";
import { dataService } from "@/services/dataService";
import { buildDataContext } from "@/lib/dataContext";
import { AuthContext } from "@/components/layout/AppShell";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { useToast } from "@/components/ui/Toast";
import Markdown from "react-markdown";
import {
  SendHorizonal, ShieldCheck, Trash2, CheckCheck
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// ---------------------------------------------------------------------------
// Tanya SIMOSDA — asisten data berbasis LLM melalui Supabase Edge Function.
//   - Konteks: ringkasan statistik + data terfilter (token-efficient).
//   - Persona: humanis, akrab, profesional, non-robotik — Bahasa Indonesia.
//   - Riwayat percakapan: hanya selama sesi (state React, hilang saat refresh).
// ---------------------------------------------------------------------------

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;      // "HH.MM" lokal
  isError?: boolean; // bubble error (gaya berbeda, TIDAK dikirim ke history AI)
}

const nowLabel = () =>
  new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

const newId = () => Math.random().toString(36).slice(2, 10);

const SUGGESTIONS = [
  "Siapa saja pegawai yang masa pensiunnya (BUP) memasuki tenggat waktu tahun ini?",
  "Berapa jumlah pegawai yang berstatus PPPK Paruh Waktu?",
  "Berapa kendaraan yang kondisinya rusak, dan siapa penggunanya?",
  "Tampilkan kendaraan yang kondisinya perlu perhatian beserta penggunanya.",
  "Tampilkan data pegawai yang berstatus ASN dan PPPK.",
  "Adakah pegawai yang jadwal kenaikan pangkatnya sudah dekat?",
  "Tolong ringkas jumlah pegawai berdasarkan golongannya.",
  "Tampilkan daftar notifikasi atau agenda yang perlu perhatian."
];


// ── Bubble chat ─────────────────────────────────────────────────────────────
function Bubble({ msg }: { key?: any; msg: ChatMsg }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div className={`flex items-end gap-2 max-w-[85%] sm:max-w-[75%] ${isUser ? "flex-row-reverse" : ""}`}>
        {!isUser && (
          <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
            <BrandLogo className="w-7 h-7" compact />
          </div>
        )}
        <div
          className={`px-4 py-2.5 text-sm leading-relaxed break-words shadow-sm ${
            isUser
              ? "bg-blue-600 text-white rounded-2xl rounded-br-md whitespace-pre-wrap"
              : msg.isError
                ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/50 rounded-2xl rounded-bl-md whitespace-pre-wrap"
                : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-700 rounded-2xl rounded-bl-md"
          }`}
        >
          {(!isUser && !msg.isError) ? (
            <div className="markdown-body prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 max-w-none">
              <Markdown>{msg.content}</Markdown>
            </div>
          ) : (
            msg.content
          )}
          <div className={`flex items-center justify-end gap-1 text-[10px] mt-1 ${isUser ? "text-blue-200" : "text-gray-400"}`}>
            {msg.time}
            {isUser && <CheckCheck size={14} />}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Indikator "sedang mengetik" ─────────────────────────────────────────────
function TypingIndicator() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
      <div className="flex items-end gap-2">
        <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
          <BrandLogo className="w-7 h-7" compact />
        </div>
        <div className="px-4 py-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl rounded-bl-md shadow-sm">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Halaman utama ───────────────────────────────────────────────────────────
export default function TanyaSimosda() {
  const { user } = useContext(AuthContext);
  const toast = useToast();

  // Percakapan — hanya selama sesi (state, hilang saat refresh)
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<any>(null);
  const inputRef = useRef<any>(null);

  const namaDepan = useMemo(() => {
    const n = String(user?.nama || "").split(",")[0].trim();
    return n ? n.split(/\s+/)[0] : "";
  }, [user]);

  // Auto-scroll ke pesan terbaru
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // Listener untuk voice command screen text
  useEffect(() => {
    const handleAIAction = (e: any) => {
      if (e.detail?.action === "SHOW_SCREEN_TEXT" && e.detail?.payload?.screenText) {
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "user", content: "🎙️ (Perintah Suara)", time: nowLabel() },
          { id: newId(), role: "assistant", content: e.detail.payload.screenText, time: nowLabel() },
        ]);
      }
    };
    window.addEventListener('ai-action', handleAIAction);
    return () => window.removeEventListener('ai-action', handleAIAction);
  }, []);

  async function send(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (!question || sending) return;

    const userMsg: ChatMsg = { id: newId(), role: "user", content: question, time: nowLabel() };

    // History yang dikirim = percakapan valid SEBELUM pertanyaan ini
    // (bubble error tidak disertakan; backend membatasi 10 pesan terakhir).
    const history = messages
      .filter((m) => !m.isError)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);
    try {
      const [feed, pegawai, kendaraan, alat] = await Promise.all([
        dataService.getNotificationFeed(),
        dataService.getPegawai(),
        dataService.getVehicles(),
        dataService.getEquipment(),
      ]);

      const dataContext = buildDataContext(pegawai, kendaraan, alat, feed, question);

      const res = await apiService.askAI(question, history, dataContext);
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "assistant", content: res.answer, time: nowLabel() },
      ]);
    } catch (err: any) {
      const msg = String(err?.message || "Terjadi kendala saat menghubungi asisten.")
        .replace(/\s*\(ID:\s*[^)]+\)\s*$/i, "")
        .trim();
      const isBusy = /ramai|batas|kuota|429/i.test(msg);
      const errorMessage = isBusy
        ? "Pertanyaannya bagus, tetapi saya sedang menerima cukup banyak permintaan. Tunggu sebentar ya, lalu coba kirim lagi."
        : `Saya belum berhasil memproses jawaban karena: ${msg} Silakan coba kirim kembali.`;

      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content: errorMessage,
          time: nowLabel(),
          isError: true,
        },
      ]);
      toast.error("Tanya SIMOSDA", msg);
    } finally {
      setSending(false);
      // Kembalikan fokus ke input agar percakapan mengalir
      try { inputRef.current?.focus(); } catch { /* noop */ }
    }
  }

  function handleKeyDown(e: any) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)] md:h-full">

      {/* Header percakapan — div biasa (BUKAN <Card>, hindari clipping) */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center shadow-sm overflow-hidden">
              <BrandLogo className="w-8 h-8" compact />
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Tanya SIMOSDA</h1>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 truncate">
              Asisten Kepegawaian dan Aset
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              title="Bersihkan percakapan sesi ini"
              className="p-2 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          )}
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 px-2 py-1 rounded-full">
            <ShieldCheck size={11} /> Konteks SIMOSDA
          </span>
        </div>
      </div>

      {/* Area pesan */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-1 sm:px-2 py-4 space-y-3"
      >
        {/* Sapaan pembuka (lokal, bukan panggilan API) */}
        <Bubble
          msg={{
            id: "welcome",
            role: "assistant",
            content:
              `${(() => {
                const hour = new Date().getHours();
                if (hour >= 11 && hour < 15) return "Siang";
                if (hour >= 15 && hour < 18) return "Sore";
                if (hour >= 18 || hour < 3) return "Malam";
                return "Pagi";
              })()}, ${namaDepan || "Sobat SIMOSDA"} 😊 Apa kabar?\n\nMau mengecek data apa hari ini? Saya bisa membantu menelusuri pegawai, agenda KGB/pangkat/BUP, ulang tahun, kendaraan, serta inventaris berdasarkan data yang dapat Anda akses.`,
            time: nowLabel(),
          }}
        />

        {/* Saran pertanyaan — hanya saat percakapan masih kosong */}
        {messages.length === 0 && (
          <div className="pl-10 space-y-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Pertanyaan yang sering diajukan</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={sending}
                  className="text-xs px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50 text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <Bubble key={m.id} msg={m} />
          ))}
          {sending && <TypingIndicator key="typing" />}
        </AnimatePresence>
      </div>

      {/* Input — div biasa (BUKAN <Card>) */}
      <div className="shrink-0 flex items-end gap-2 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e: any) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Tulis pertanyaan… (Enter untuk kirim, Shift+Enter baris baru)"
          className="flex-1 resize-none max-h-32 px-3 py-2.5 text-sm bg-transparent focus:outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
          disabled={sending}
        />
        <button
          onClick={() => send(input)}
          disabled={sending || !input.trim()}
          title="Kirim"
          className="shrink-0 p-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          <SendHorizonal size={18} />
        </button>
      </div>

      <p className="shrink-0 text-[10px] text-gray-400 text-center mt-1.5">
        Jawaban dihasilkan berdasarkan data SIMOSDA — mohon verifikasi untuk keputusan penting. Riwayat hanya tersimpan selama sesi ini.
      </p>
    </div>
  );
}
