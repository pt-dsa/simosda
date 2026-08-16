import React, { useState, useEffect, useCallback, useRef } from "react";
import { Mic, MicOff, Loader2, Ear } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useToast } from "@/components/ui/Toast";
import { apiService } from "@/services/apiService";
import { dataService } from "@/services/dataService";
import { buildDataContext } from "@/lib/dataContext";
import { useTheme } from "@/components/theme/ThemeProvider";

// Tambahkan tipe untuk SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

type VoiceState = "off" | "passive" | "active" | "processing";

/** Pembersih teks pidato dari simbol markdown agar Text-To-Speech tidak mengeja 'asterisk' */
function cleanSpeechText(text: string): string {
  if (!text) return "";
  return text
    // Ganti kata SIMOSDA menjadi Simosda agar disuarakan sebagai kata natural
    .replace(/SIMOSDA/g, "Simosda")
    // Hapus format markdown bold/italic (**teks**, *teks*, _teks_)
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    // Hapus seluruh karakter asterisk/bintang yang tersisa
    .replace(/\*/g, "")
    // Hapus heading markdown (#, ##, ###)
    .replace(/#+\s*/g, "")
    // Hapus backticks (`code`)
    .replace(/`+/g, "")
    // Hapus format link [teks](url) -> teks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Hapus simbol bullet points (- item, * item, 1. item)
    .replace(/^[\s*-•\d.]+/gm, "")
    // Hapus tag HTML jika ada
    .replace(/<[^>]*>/g, "")
    // Rapikan spasi berlebih
    .replace(/\s+/g, " ")
    .trim();
}

/** Pencocokan Intent Instan Lokal (0ms Latency untuk kontrol UI & navigasi cepat) */
function matchInstantVoiceIntent(command: string): { action: string; target?: string; speech: string; payload?: any } | null {
  const q = command.toLowerCase().trim();

  // 1. Kontrol Tema (Gelap / Terang)
  if (/(?:mode|tema|ganti|ubah|jadikan)\s*(?:ke\s*)?(?:gelap|dark|hitam)/i.test(q) || q === "mode gelap" || q === "tema gelap") {
    return { action: "THEME", target: "dark", speech: "Baik, tampilan sudah saya ganti ke mode gelap." };
  }
  if (/(?:mode|tema|ganti|ubah|jadikan)\s*(?:ke\s*)?(?:terang|light|putih)/i.test(q) || q === "mode terang" || q === "tema terang") {
    return { action: "THEME", target: "light", speech: "Baik, tampilan sudah saya ganti ke mode terang." };
  }

  // 2. Navigasi Cepat Halaman Menu
  if (/(?:buka|halaman|menu|ke\s+halaman|lihat\s+data|tampilkan)\s*(?:ke\s*)?(?:dashboard|beranda|utama|home)/i.test(q) || q === "dashboard" || q === "beranda") {
    return { action: "NAVIGATE", target: "/dashboard", speech: "Membuka halaman Dashboard." };
  }
  if (/(?:buka|halaman|menu|lihat|tampilkan)\s*(?:data\s*)?(?:pegawai|asn|pppk|staff|karyawan)/i.test(q) || q === "pegawai" || q === "data pegawai") {
    return { action: "NAVIGATE", target: "/pegawai", speech: "Membuka daftar data pegawai." };
  }
  if (/(?:buka|halaman|menu|lihat|tampilkan)\s*(?:buku\s*)?(?:penjagaan|agenda|jadwal\s*pegawai|tenggat)/i.test(q) || q === "buku penjagaan" || q === "penjagaan") {
    return { action: "NAVIGATE", target: "/buku-penjagaan", speech: "Membuka halaman Buku Penjagaan." };
  }
  if (/(?:buka|halaman|menu|lihat|tampilkan)\s*(?:data\s*)?(?:kendaraan|mobil|motor|kendaraan\s*dinas)/i.test(q) || q === "kendaraan" || q === "data kendaraan") {
    return { action: "NAVIGATE", target: "/kendaraan", speech: "Membuka daftar data kendaraan." };
  }
  if (/(?:buka|halaman|menu|lihat|tampilkan)\s*(?:data\s*)?(?:inventaris|aset\s*ruangan)/i.test(q) || q === "inventaris") {
    return { action: "NAVIGATE", target: "/inventaris", speech: "Membuka halaman inventaris." };
  }
  if (/(?:buka|halaman|menu|lihat|tampilkan)\s*(?:data\s*)?(?:alat|mesin|alat\s*dan\s*mesin)/i.test(q) || q === "alat mesin" || q === "alat dan mesin") {
    return { action: "NAVIGATE", target: "/alat-mesin", speech: "Membuka data alat dan mesin." };
  }
  if (/(?:buka|halaman|menu|lihat|tampilkan)\s*(?:data\s*)?(?:pagu|anggaran|budget)/i.test(q) || q === "pagu" || q === "pagu anggaran") {
    return { action: "NAVIGATE", target: "/pagu", speech: "Membuka halaman pagu anggaran." };
  }
  if (/(?:buka|halaman|menu|lihat|tampilkan)\s*(?:data\s*)?(?:pemeliharaan|servis|service|bengkel)/i.test(q) || q === "pemeliharaan") {
    return { action: "NAVIGATE", target: "/pemeliharaan-kendaraan", speech: "Membuka riwayat pemeliharaan kendaraan." };
  }
  if (/(?:buka|halaman|menu|lihat|tampilkan)\s*(?:data\s*)?(?:peminjaman|pinjam|booking)/i.test(q) || q === "peminjaman") {
    return { action: "NAVIGATE", target: "/peminjaman", speech: "Membuka menu peminjaman aset." };
  }
  if (/(?:buka|halaman|menu|lihat|tampilkan)\s*(?:peta|sebaran|lokasi\s*aset|gis)/i.test(q) || q === "peta" || q === "peta sebaran") {
    return { action: "NAVIGATE", target: "/peta", speech: "Membuka peta sebaran lokasi aset." };
  }
  if (/(?:buka|halaman|menu|lihat|tampilkan)\s*(?:laporan|rekap|cetak)/i.test(q) || q === "laporan") {
    return { action: "NAVIGATE", target: "/laporan", speech: "Membuka menu rekap laporan." };
  }
  if (/(?:buka|halaman|menu|lihat|tampilkan)\s*(?:tanya|chat|asisten\s*simosda)/i.test(q) || q === "tanya" || q === "tanya simosda") {
    return { action: "NAVIGATE", target: "/tanya", speech: "Membuka asisten Tanya Simosda." };
  }
  if (/(?:buka|halaman|menu|lihat|tampilkan)\s*(?:kelola\s*akun|pengaturan|profil|setting)/i.test(q) || q === "kelola akun") {
    return { action: "NAVIGATE", target: "/kelola-akun", speech: "Membuka halaman kelola akun." };
  }
  if (/(?:buka|halaman|menu|lihat|tampilkan)\s*(?:cleansing|data\s*cleansing|pembersihan)/i.test(q) || q === "cleansing") {
    return { action: "NAVIGATE", target: "/cleansing", speech: "Membuka halaman data cleansing." };
  }

  // 3. Form Input Cepat
  if (/tambah\s*(?:data\s*)?(?:kendaraan|mobil|motor)/i.test(q)) {
    return { action: "FILL_FORM", target: "vehicle_form", payload: {}, speech: "Baik, form data kendaraan telah disiapkan." };
  }
  if (/tambah\s*(?:data\s*)?(?:pegawai|asn|pppk)/i.test(q)) {
    return { action: "FILL_FORM", target: "employee_form", payload: {}, speech: "Baik, form data pegawai telah disiapkan." };
  }
  if (/tambah\s*(?:data\s*)?(?:alat|mesin|inventaris)/i.test(q)) {
    return { action: "FILL_FORM", target: "equipment_form", payload: {}, speech: "Baik, form data alat dan mesin telah disiapkan." };
  }

  return null;
}

export function VoiceControl() {
  const [voiceState, setVoiceState] = useState<VoiceState>("off");
  const [isSupported, setIsSupported] = useState(true);
  
  const recognitionRef = useRef<any>(null);
  const voiceStateRef = useRef<VoiceState>("off");
  
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const { toast } = useToast();
  const silenceTimeoutRef = useRef<any>(null);
  const isSpeakingRef = useRef<boolean>(false);

  // Sync state ke ref untuk diakses di dalam callback onresult
  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'id-ID';

    recognition.onresult = async (event: any) => {
      if (isSpeakingRef.current) {
        return;
      }

      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }

      // Ambil transkrip terbaru
      const currentIdx = event.resultIndex;
      const transcript = event.results[currentIdx][0].transcript.toLowerCase();

      const currentState = voiceStateRef.current;

      if (currentState === "passive") {
        const wakeWords = ["assalamualaikum kanda", "assalamu'alaikum kanda", "salamualaikum kanda", "assalamualaikum canda", "halo kanda", "hai kanda"];
        let detectedWakeWord = wakeWords.find(w => transcript.includes(w));
        
        if (detectedWakeWord) {
          const wakeWordIndex = transcript.indexOf(detectedWakeWord);
          const commandAfterWakeWord = transcript.slice(wakeWordIndex + detectedWakeWord.length).trim();
          
          if (commandAfterWakeWord.length > 3) {
            // Perintah Satu Tahap
            setVoiceState("processing");
            recognition.stop();
            await handleCommandWithAI(commandAfterWakeWord);
          } else {
            // Perintah Dua Tahap
            setVoiceState("processing");
            recognition.stop();
            speakResponse("Waalaikumsalam warahmatullahi wabarakatuh. Ada yang bisa saya bantu?", () => {
              setVoiceState("active");
              try { recognition.start(); } catch (e) {}
              toast({
                message: "SIMOSDA Aktif",
                description: "Silakan ucapkan perintah Anda...",
                type: "info",
              });
            });
          }
        }
      } else if (currentState === "active") {
        setVoiceState("processing");
        recognition.stop();
        await handleCommandWithAI(transcript);
      }
    };

    recognition.onerror = (event: any) => {
      // no-speech sangat wajar terjadi jika tidak ada suara terdeteksi dalam periode tertentu.
      // Kita abaikan agar tidak memenuhi console log, biarkan onend me-restart otomatis.
      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }
      
      console.error("Speech recognition error", event.error);
      if (event.error === "not-allowed") {
        setVoiceState("off");
        toast({ message: "Akses Ditolak", description: "Izin mikrofon diperlukan. Periksa pengaturan browser Anda.", type: "error" });
      } else if (event.error === "network") {
        // Chrome terkadang melempar error network saat recognition.stop() dipanggil
        // Jangan matikan voice state jika kita sedang memproses hasil.
        if (voiceStateRef.current !== "processing") {
          setVoiceState("off");
          toast({ message: "Koneksi Terputus", description: "Fitur suara memerlukan koneksi internet aktif.", type: "error" });
        }
      }
    };

    recognition.onend = () => {
      const state = voiceStateRef.current;
      if (state === "passive" || state === "active") {
        try {
          recognition.start();
        } catch (e) {
          // ignore
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
    };
  }, []);

  const speakResponse = useCallback((text: string, onEndCallback?: () => void) => {
    if (!("speechSynthesis" in window)) {
      if (onEndCallback) onEndCallback();
      return;
    }
    
    // Bersihkan teks secara menyeluruh dari format markdown (anti-asterisk)
    const naturalText = cleanSpeechText(text);
    if (!naturalText) {
      if (onEndCallback) onEndCallback();
      return;
    }
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(naturalText);
    utterance.lang = "id-ID";
    
    utterance.pitch = 1.2; 
    utterance.rate = 1.0; 
    
    const voices = window.speechSynthesis.getVoices();
    const idVoices = voices.filter(v => v.lang.includes('id'));
    
    const googleVoice = idVoices.find(v => v.name.includes('Google Bahasa Indonesia'));
    const femaleVoice = idVoices.find(v => v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('gadis') || v.name.toLowerCase().includes('wanita'));
    
    if (googleVoice) {
      utterance.voice = googleVoice;
      utterance.pitch = 1.0;
    } else if (femaleVoice) {
      utterance.voice = femaleVoice;
    } else if (idVoices.length > 0) {
      utterance.voice = idVoices[0];
    }

    const estimatedDurationMs = Math.max(1000, (naturalText.length / 12) * 1000);
    const startTime = Date.now();
    
    isSpeakingRef.current = true;
    let hasStarted = false;

    utterance.onstart = () => {
      hasStarted = true;
    };

    const checkSpeaking = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      if (!hasStarted) {
        if (elapsed > 3000) {
          clearInterval(checkSpeaking);
          isSpeakingRef.current = false;
          if (onEndCallback) onEndCallback();
        }
        return;
      }

      if (!window.speechSynthesis.speaking || elapsed > estimatedDurationMs + 10000) {
        clearInterval(checkSpeaking);
        setTimeout(() => {
          isSpeakingRef.current = false;
          if (onEndCallback) onEndCallback();
        }, 500);
      }
    }, 400);

    // Mencegah garbage collection di Chrome yang membuat suara terputus/tidak muncul
    (window as any)._simosdaUtterance = utterance;

    window.speechSynthesis.speak(utterance);
  }, []);

  const executeVoiceAction = (answer: { action: string; target?: string; speech: string; payload?: any }) => {
    const { action, target, speech } = answer;

    // 1. Eksekusi aksi pada UI/Aplikasi
    if (action === "NAVIGATE" && target) {
      navigate(target);
    } else if (action === "THEME" && target) {
      if (target === "dark" || target === "light" || target === "system") {
        setTheme(target as any);
      }
    } else if (action === "FILL_FORM" && target) {
      let targetPath = "";
      if (target === "employee_form") targetPath = "/pegawai";
      else if (target === "equipment_form") targetPath = "/inventaris";
      else if (target === "vehicle_form") targetPath = "/kendaraan";
      else if (target === "account_form") targetPath = "/kelola-akun";

      if (targetPath) {
        navigate(targetPath);
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('ai-action', { detail: answer }));
        }, 400);
      } else {
        window.dispatchEvent(new CustomEvent('ai-action', { detail: answer }));
      }
    } else if (action === "REPLY_ONLY" && answer.payload?.screenText) {
      if (window.location.pathname === "/tanya") {
        window.dispatchEvent(new CustomEvent('ai-action', { detail: { action: "SHOW_SCREEN_TEXT", payload: answer.payload } }));
      }
    }

    // 2. Balas dengan suara bersih (bebas asterisk)
    speakResponse(speech || "Perintah telah dilaksanakan.", () => {
      setVoiceState("active");
      try { recognitionRef.current?.start(); } catch (e) {}
      
      silenceTimeoutRef.current = setTimeout(() => {
        if (voiceStateRef.current === "active") {
          setVoiceState("passive");
          toast({ message: "Mode Pasif", description: "SIMOSDA masuk mode standby karena tidak ada suara.", type: "info" });
        }
      }, 15000);
    });
  };

  const handleCommandWithAI = async (command: string) => {
    // Tahap 1: Coba pencocokan instan lokal (0ms - zero latency untuk kontrol navigasi & UI)
    const instantIntent = matchInstantVoiceIntent(command);
    if (instantIntent) {
      executeVoiceAction(instantIntent);
      return;
    }

    // Tahap 2: Untuk kueri data kompleks, hubungi AI Edge Function
    try {
      toast({
        message: "Memproses Perintah",
        description: `Menganalisa: "${command}"`,
        type: "info",
      });

      const [feed, pegawai, kendaraan, alat] = await Promise.all([
        dataService.getNotificationFeed(),
        dataService.getPegawai(),
        dataService.getVehicles(),
        dataService.getEquipment(),
      ]);
      
      const dataContext = buildDataContext(pegawai, kendaraan, alat, feed, command);
      const result = await apiService.askAIVoice(command, dataContext);
      
      if (result.ok && result.answer) {
        executeVoiceAction(result.answer);
      } else {
        throw new Error("Invalid AI response");
      }
    } catch (err) {
      console.warn("AI Voice Error:", err);
      speakResponse("Maaf, terjadi kendala saat memproses pertanyaan Anda.", () => {
        setVoiceState("active");
        try { recognitionRef.current?.start(); } catch (e) {}
        
        silenceTimeoutRef.current = setTimeout(() => {
          if (voiceStateRef.current === "active") {
            setVoiceState("passive");
          }
        }, 15000);
      });
    }
  };

  const handleButtonClick = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    // Trik untuk "membuka kunci" Web Speech API di beberapa browser yang membutuhkan interaksi pengguna langsung
    if ("speechSynthesis" in window) {
      const unlockUtterance = new SpeechSynthesisUtterance(" ");
      unlockUtterance.volume = 0;
      (window as any)._simosdaUnlockUtterance = unlockUtterance;
      window.speechSynthesis.speak(unlockUtterance);
      if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.getVoices();
      }
    }

    if (voiceState === "off") {
      setVoiceState("active");
      try {
        recognitionRef.current?.start();
        toast({ message: "SIMOSDA Aktif", description: "Mendengarkan perintah...", type: "info" });
      } catch (e) {}
    } else if (voiceState === "passive") {
      setVoiceState("active");
      try { recognitionRef.current?.start(); } catch (e) {}
      toast({ message: "SIMOSDA Aktif", description: "Mendengarkan perintah...", type: "info" });
    } else {
      setVoiceState("off");
      recognitionRef.current?.stop();
      toast({ message: "Voice Control Dimatikan", description: "Mikrofon dinonaktifkan.", type: "warning" });
    }
  };

  if (!isSupported) return null;

  return (
    <div className="relative flex items-center justify-center">
      <AnimatePresence>
        {voiceState === "active" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: [0.2, 0.5, 0.2], scale: [1, 1.5, 1] }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="absolute inset-0 bg-blue-500 rounded-full z-0"
          />
        )}
      </AnimatePresence>
      <button
        onClick={handleButtonClick}
        title={voiceState === "passive" ? "Standby: Panggil 'Assalamualaikum Kanda'" : "Klik untuk Voice Control"}
        aria-label="Toggle Voice Control"
        className={`relative z-10 p-2 rounded-full transition-colors flex items-center justify-center ${
          voiceState === "active"
            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
            : voiceState === "passive"
            ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200"
            : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}
      >
        {voiceState === "processing" ? (
          <Loader2 size={20} className="animate-spin text-blue-500" />
        ) : voiceState === "passive" ? (
          <Ear size={20} />
        ) : voiceState === "active" ? (
          <Mic size={20} />
        ) : (
          <MicOff size={20} />
        )}
      </button>
    </div>
  );
}
