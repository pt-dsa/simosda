import React from 'react';
import { Car, Wrench, ChevronDown, ChevronUp } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';

interface MapLegendProps {
  totalLocations: number;
  stats: Record<string, number>;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function MapLegend({ totalLocations, stats, isOpen, setIsOpen }: MapLegendProps) {
  return (
    <div className="absolute bottom-4 left-3 sm:bottom-6 sm:left-6 z-[25] bg-white/95 dark:bg-gray-900/95 backdrop-blur-md p-3 sm:p-4 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 text-xs font-medium space-y-3 min-w-[210px] max-w-[calc(100vw-1.5rem)] pointer-events-auto transition-all duration-300">
      <div 
        className="flex justify-between items-center cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm flex items-center gap-2">
          <span>Legenda</span>
          <span className="bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-bold text-[10px]">{totalLocations} Titik</span>
        </h3>
        {isOpen ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronUp size={14} className="text-gray-500" />}
      </div>
      
      {isOpen && (
        <div className="space-y-4 pt-2 border-t border-gray-100 dark:border-gray-800">
          <div className="space-y-2.5">
            <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Jenis Aset (Warna Marker)</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-[#4F46E5] flex items-center justify-center text-white ring-2 ring-white dark:ring-gray-900 shadow-sm"><Car size={12} /></div>
                <span className="text-gray-700 dark:text-gray-300">Kendaraan</span>
              </div>
              <span className="font-bold text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded-md">{stats['Kendaraan'] || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-[#16A34A] flex items-center justify-center text-white ring-2 ring-white dark:ring-gray-900 shadow-sm"><Wrench size={12} /></div>
                <span className="text-gray-700 dark:text-gray-300">Inventaris</span>
              </div>
              <span className="font-bold text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded-md">{stats['Inventaris'] || 0}</span>
            </div>
          </div>
          
          <div className="space-y-2.5 pt-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Status Kondisi</p>
            <div className="grid grid-cols-2 gap-2">
              <StatusBadge status="BAIK" className="justify-center !text-[10px]" />
              <StatusBadge status="RUSAK RINGAN" className="justify-center !text-[10px]" />
              <StatusBadge status="KURANG BAIK" className="justify-center !text-[10px]" />
              <StatusBadge status="RUSAK BERAT" className="justify-center !text-[10px]" />
              <StatusBadge status="BELUM DIISI" className="justify-center !text-[10px] col-span-2" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
