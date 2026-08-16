import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

export function PWAPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 p-4 bg-white rounded-lg shadow-xl border border-gray-200 w-80 max-w-[calc(100vw-2rem)]">
      <div className="flex items-start justify-between">
        <h3 className="font-semibold text-gray-800">
          {offlineReady ? 'Aplikasi Siap Offline' : 'Versi Baru Tersedia'}
        </h3>
        <button onClick={close} className="text-gray-500 hover:text-gray-700">
          <X className="w-5 h-5" />
        </button>
      </div>
      <p className="text-sm text-gray-600 mb-2">
        {offlineReady
          ? 'SIMOSDA kini dapat diakses secara offline dan memuat lebih cepat.'
          : 'Versi terbaru SIMOSDA telah dirilis. Silakan muat ulang untuk mengaplikasikan pembaruan.'}
      </p>
      {needRefresh && (
        <button
          onClick={() => updateServiceWorker(true)}
          className="flex items-center justify-center gap-2 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Muat Ulang Sekarang
        </button>
      )}
    </div>
  );
}
