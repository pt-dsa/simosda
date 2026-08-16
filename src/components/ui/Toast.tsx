import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, XCircle, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  description?: string;
  duration?: number;
}

interface ToastContextType {
  toast: (toast: Omit<ToastMessage, "id">) => void;
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  warning: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast = { ...toast, id };
    // Satu masalah tidak boleh memenuhi layar dengan toast identik ketika
    // pengguna menekan Simpan beberapa kali. Pertahankan pesan terbaru saja.
    setToasts((prev) => [
      ...prev.filter((item) => !(
        item.type === newToast.type
        && item.message === newToast.message
        && item.description === newToast.description
      )),
      newToast,
    ]);

    if (toast.duration !== 0) {
      setTimeout(() => {
        removeToast(id);
      }, toast.duration || 3000);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback((message: string, description?: string) => addToast({ type: "success", message, description }), [addToast]);
  const error = useCallback((message: string, description?: string) => addToast({ type: "error", message, description }), [addToast]);
  const warning = useCallback((message: string, description?: string) => addToast({ type: "warning", message, description }), [addToast]);
  const info = useCallback((message: string, description?: string) => addToast({ type: "info", message, description }), [addToast]);

  return (
    <ToastContext.Provider value={{ toast: addToast, success, error, warning, info }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const icons = {
    success: <CheckCircle2 className="h-5 w-5 text-green-500" />,
    error: <XCircle className="h-5 w-5 text-red-500" />,
    warning: <AlertCircle className="h-5 w-5 text-amber-500" />,
    info: <Info className="h-5 w-5 text-blue-500" />,
  };

  const bgColors = {
    success: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900",
    error: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900",
    warning: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",
    info: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-xl border p-4 shadow-lg backdrop-blur-md",
        "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800",
        // bgColors[toast.type] // Optionally use colored backgrounds
      )}
    >
      <div className="mt-0.5 shrink-0">{icons[toast.type]}</div>
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{toast.message}</p>
        {toast.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{toast.description}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded-md p-1 text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
