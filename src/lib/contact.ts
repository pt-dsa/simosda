/**
 * Normalisasi nomor seluler Indonesia untuk penyimpanan dan tautan WhatsApp.
 * Hanya pola yang tidak ambigu yang diubah: 08..., 8..., +62..., atau 62....
 */
export function normalizeIndonesianPhoneNumber(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("08")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  if (digits.startsWith("62")) return digits;
  return digits;
}

export function isValidWhatsAppNumber(value: unknown): boolean {
  const normalized = normalizeIndonesianPhoneNumber(value);
  return /^628\d{7,12}$/.test(normalized);
}

export function whatsappChatUrl(value: unknown): string | null {
  const normalized = normalizeIndonesianPhoneNumber(value);
  return isValidWhatsAppNumber(normalized) ? `https://wa.me/${normalized}` : null;
}

