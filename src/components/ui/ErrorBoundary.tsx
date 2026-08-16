import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  /** Label konteks untuk pesan error, mis. nama halaman. */
  context?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * ErrorBoundary — mencegat uncaught exception di sub-tree React agar
 * aplikasi tidak crash ke layar putih di production.
 *
 * Gunakan di App.tsx mengelilingi setiap <Route> terproteksi, atau
 * di level halaman/komponen mana pun yang berpotensi melempar error.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: unknown): State {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : "Terjadi kesalahan tak terduga.";
    return { hasError: true, errorMessage: msg };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Log untuk debugging — di production bisa dikirim ke Sentry/monitoring
    console.error("[SIMOSDA] Uncaught error di ErrorBoundary:", error, info.componentStack);
  }

  private handleReload = () => {
    // Reset state dan coba render ulang
    this.setState({ hasError: false, errorMessage: "" });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const context = this.props.context ?? "halaman ini";

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="w-full max-w-sm rounded-3xl border border-red-100 bg-white p-8 shadow-lg dark:border-red-900/30 dark:bg-gray-900">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-900/20">
            <AlertTriangle size={32} className="text-red-500" />
          </div>
          <h2 className="mb-2 text-lg font-black text-gray-900 dark:text-white">
            Terjadi Kesalahan
          </h2>
          <p className="mb-1 text-sm font-semibold text-gray-600 dark:text-gray-300">
            Gagal memuat {context}. Silakan coba muat ulang halaman.
          </p>
          {this.state.errorMessage && (
            <p className="mb-5 mt-2 rounded-xl bg-red-50 px-3 py-2 font-mono text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {this.state.errorMessage}
            </p>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow transition hover:bg-blue-700 active:scale-95"
          >
            <RefreshCw size={15} />
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }
}
