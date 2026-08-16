import React from "react";

// Pola props mandiri + index signature (lihat catatan §3 handoff: @types/react
// tidak terpasang → hindari `extends React.*HTMLAttributes`).
export interface SummaryCardItem {
  key: string;                       // nilai kanonik (value filter); "" = Total
  label: string;
  count: number;
  tone?: { bg: string; text: string };
}

interface SummaryCardsProps {
  items: SummaryCardItem[];          // bucket selain Total
  totalLabel?: string;
  totalCount: number;
  activeKey: string;                 // "" berarti Total/semua sedang aktif
  onSelect: (key: string) => void;   // "" untuk Total
  className?: string;
  totalTone?: { bg: string; text: string };
  [key: string]: any;
}

/**
 * Baris kartu ringkasan klikable. Kartu pertama selalu "Total" (key ""), diikuti
 * tiap bucket. Klik kartu memanggil onSelect(key). Kartu aktif diberi ring biru.
 * Angka pada kartu HARUS berasal dari hitungan nyata pemanggil — komponen ini
 * hanya menyajikan, tidak menghitung ulang.
 */
export function SummaryCards({
  items,
  totalLabel = "Total",
  totalCount,
  activeKey,
  onSelect,
  className = "",
  totalTone = {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-700 dark:text-blue-300",
  },
}: SummaryCardsProps) {
  const cards: SummaryCardItem[] = [
    { key: "", label: totalLabel, count: totalCount, tone: totalTone },
    ...items,
  ];

  // Kolom adaptif: 2 di mobile, sampai 6 di desktop.
  const cols = Math.min(cards.length, 6);
  const lgCols = ["lg:grid-cols-1", "lg:grid-cols-2", "lg:grid-cols-3", "lg:grid-cols-4", "lg:grid-cols-5", "lg:grid-cols-6"][cols - 1] || "lg:grid-cols-6";

  return (
    <div className={`grid grid-cols-2 ${lgCols} gap-3 ${className}`}>
      {cards.map((c) => {
        const active = activeKey === c.key;
        const tone = c.tone || { bg: "bg-gray-50 dark:bg-gray-800/40", text: "text-gray-600 dark:text-gray-300" };
        return (
          <button
            type="button"
            key={c.key || "__total__"}
            onClick={() => onSelect(c.key)}
            aria-pressed={active}
            className={`${tone.bg} text-left rounded-3xl neu-raised p-4 border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
              active ? "border-blue-500 ring-2 ring-blue-500/40" : "border-white/40 dark:border-white/5"
            }`}
          >
            <p className="text-sm font-extrabold text-gray-700 dark:text-gray-200 pr-2 leading-snug line-clamp-2" title={c.label}>
              {c.label}
            </p>
            <p className={`text-2xl font-bold mt-1 ${tone.text}`}>{c.count}</p>
          </button>
        );
      })}
    </div>
  );
}
