import { useState, useEffect } from "react";

export interface TypewriterOptions {
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDuration?: number;
  enabled?: boolean;
}

/**
 * Hook untuk menghasilkan animasi pengetikan placeholder secara dinamis (typewriter effect).
 * Sangat berguna untuk memberikan panduan kontekstual dan contoh format pengisian kepada pengguna.
 */
export function useTypewriterPlaceholder(
  phrases: string[],
  options: TypewriterOptions = {}
): string {
  const {
    typingSpeed = 70,
    deletingSpeed = 35,
    pauseDuration = 1800,
    enabled = true,
  } = options;

  const [currentText, setCurrentText] = useState("");
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!enabled || phrases.length === 0) {
      setCurrentText(phrases[0] || "");
      return;
    }

    const targetPhrase = phrases[phraseIndex % phrases.length];
    let timer: any;

    if (!isDeleting) {
      // Mengetik karakter maju satu per satu
      if (currentText.length < targetPhrase.length) {
        timer = setTimeout(() => {
          setCurrentText(targetPhrase.slice(0, currentText.length + 1));
        }, typingSpeed);
      } else {
        // Tahan teks lengkap sejenak sebelum mulai menghapus
        timer = setTimeout(() => {
          setIsDeleting(true);
        }, pauseDuration);
      }
    } else {
      // Menghapus karakter mundur satu per satu
      if (currentText.length > 0) {
        timer = setTimeout(() => {
          setCurrentText(targetPhrase.slice(0, currentText.length - 1));
        }, deletingSpeed);
      } else {
        // Pindah ke contoh teks berikutnya
        setIsDeleting(false);
        setPhraseIndex((prev) => (prev + 1) % phrases.length);
      }
    }

    return () => clearTimeout(timer);
  }, [currentText, isDeleting, phraseIndex, phrases, typingSpeed, deletingSpeed, pauseDuration, enabled]);

  return currentText;
}
