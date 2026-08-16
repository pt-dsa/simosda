import React, { useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { getLoadingProgressSnapshot, subscribeLoadingProgress } from "@/lib/loadingProgress";

export function LoadingState({ label, compact = false }: { label?: string; compact?: boolean }) {
  const state = useSyncExternalStore(
    subscribeLoadingProgress,
    getLoadingProgressSnapshot,
    getLoadingProgressSnapshot,
  );
  const progress = state.progress;
  return (
    <div className={`flex flex-col items-center justify-center w-full max-w-[420px] mx-auto space-y-4 ${compact ? "py-8" : "py-20 h-[50vh]"}`} role="status" aria-live="polite">
      <p className="text-gray-700 dark:text-gray-300 font-bold text-center text-base sm:text-lg">
        {label || state.label}
      </p>
      <div className="w-full" aria-label={`Proses ${progress} persen`}>
        <div className="mb-2 flex items-center justify-between text-xs font-bold text-gray-500 dark:text-gray-400">
          <span>{progress < 100 ? "Sedang diproses" : "Selesai"}</span>
          <span className="tabular-nums text-blue-700 dark:text-blue-300">{progress}%</span>
        </div>
        <div className="w-full h-3 bg-gray-200/70 dark:bg-gray-700/60 rounded-full overflow-hidden shadow-inner border border-gray-300/30 dark:border-gray-600/30">
          <motion.div
            className="h-full rounded-full shadow-[0_0_10px_rgba(37,99,235,0.35)]"
            style={{ background: "linear-gradient(90deg, #2563eb 0%, #22c55e 100%)" }}
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          />
        </div>
      </div>
      <span className="sr-only">
        Kemajuan mengikuti tahap permintaan data yang benar-benar telah selesai.
      </span>
    </div>
  );
}
