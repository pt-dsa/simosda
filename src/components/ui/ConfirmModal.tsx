import React from "react";
import { motion } from "motion/react";
import { AlertTriangle } from "lucide-react";

// ---------------------------------------------------------------------------
// ConfirmModal — menggantikan window.confirm() yang diblokir iframe.
// Digunakan oleh: Pegawai.tsx, KelolaAkun.tsx, Cleansing.tsx, BukuPenjagaan.tsx
// ---------------------------------------------------------------------------

export interface ConfirmState {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  confirmClass?: string;
  onConfirm: () => void;
}

export const CONFIRM_CLOSED: ConfirmState = {
  open: false,
  title: "",
  message: "",
  confirmLabel: "Ya",
  confirmClass: "bg-red-600 hover:bg-red-700",
  onConfirm: () => {},
};

export function ConfirmModal({
  state,
  onClose,
}: {
  state: ConfirmState;
  onClose: () => void;
}) {
  if (!state.open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-800 overflow-hidden"
      >
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-3 mb-3">
            <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={22} />
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-base">
                {state.title}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-line">
                {state.message}
              </p>
            </div>
          </div>
        </div>
        <div className="safe-area-bottom px-4 sm:px-5 pb-4 sm:pb-5 grid grid-cols-2 sm:flex sm:justify-end gap-3">
          <button
            onClick={onClose}
            className="min-h-11 px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={() => {
              onClose();
              state.onConfirm();
            }}
            className={`min-h-11 px-5 py-2 text-sm font-bold text-white rounded-xl shadow-sm transition-colors ${
              state.confirmClass ?? "bg-red-600 hover:bg-red-700"
            }`}
          >
            {state.confirmLabel ?? "Ya"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
