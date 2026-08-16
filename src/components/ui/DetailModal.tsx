import React from "react";
import { X } from "lucide-react";

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: any | null;
  children?: React.ReactNode;
}

export function DetailModal({ isOpen, onClose, title, data, children }: DetailModalProps) {
  if (!isOpen || !data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm transition-all duration-300">
      <div 
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-none sm:rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[90dvh] animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">{title}</h3>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 sm:p-6 overflow-y-auto w-full flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mb-6">
            {Object.entries(data).map(([key, value]) => {
              if (value === undefined || value === null || value === "") return null;
              
              const formattedKey = key
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');

              return (
                <div key={key} className="flex flex-col border-b border-gray-100 dark:border-gray-800/50 pb-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 mb-1">{formattedKey}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
                    {String(value)}
                  </span>
                </div>
              );
            })}
          </div>
          {children}
        </div>
        
        <div className="safe-area-bottom p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex justify-end">
          <button
            onClick={onClose}
            className="min-h-11 w-full sm:w-auto px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-full font-medium text-sm transition-all border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
