import React from 'react';
import { Search, X, Layers, Radio } from 'lucide-react';

export interface BasemapOption {
  id: string;
  name: string;
  url: string;
  attribution: string;
}

interface TypeSummaryItem {
  type: string;
  count: number;
}

interface MapFiltersProps {
  locationsLength: number;
  typeSummary: TypeSummaryItem[];
  filterType: string;
  setFilterType: (val: string) => void;
  filterCondition: string;
  setFilterCondition: (val: string) => void;
  uniqueConditions: string[];
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  radarPulse: boolean;
  setRadarPulse: (val: boolean) => void;
  activeBasemap: string;
  setActiveBasemap: (val: string) => void;
  basemapOpen: boolean;
  setBasemapOpen: React.Dispatch<React.SetStateAction<boolean>>;
  baseMaps: BasemapOption[];
}

export function MapFilters({
  locationsLength,
  typeSummary,
  filterType,
  setFilterType,
  filterCondition,
  setFilterCondition,
  uniqueConditions,
  searchQuery,
  setSearchQuery,
  radarPulse,
  setRadarPulse,
  activeBasemap,
  setActiveBasemap,
  basemapOpen,
  setBasemapOpen,
  baseMaps,
}: MapFiltersProps) {
  return (
    <div className="absolute top-3 left-3 right-3 z-[25] flex flex-col sm:flex-row gap-2 sm:gap-4 justify-between items-start pointer-events-none">
      <div className="flex flex-col gap-2 w-full sm:w-auto pointer-events-auto">
        <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 transition-all w-full sm:w-auto">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Peta Sebaran Aset</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Visualisasi geografis real-time</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterType("Semua Tipe")}
            aria-pressed={filterType === "Semua Tipe"}
            className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-sm border transition-colors ${
              filterType === "Semua Tipe"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white/95 dark:bg-gray-900/95 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700"
            }`}
          >
            Semua · {locationsLength}
          </button>
          {typeSummary.map((t) => (
            <button
              key={t.type}
              onClick={() => setFilterType(t.type)}
              aria-pressed={filterType === t.type}
              className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-sm border transition-colors ${
                filterType === t.type
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white/95 dark:bg-gray-900/95 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700"
              }`}
            >
              {t.type} · {t.count}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 pointer-events-auto w-full md:w-auto mt-2 sm:mt-0">
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input 
              type="text" 
              placeholder="Cari aset..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-40 px-3 pl-8 pr-8 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold shadow-sm focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Hapus pencarian"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <select 
            value={filterType} 
            onChange={(e) => setFilterType(e.target.value)}
            className="flex-1 sm:flex-none px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold shadow-sm focus:ring-2 focus:ring-blue-500 appearance-none"
          >
            <option value="Semua Tipe">Jenis Aset</option>
            <option value="Kendaraan">Kendaraan</option>
            <option value="Inventaris">Inventaris</option>
          </select>
          <select 
            value={filterCondition} 
            onChange={(e) => setFilterCondition(e.target.value)}
            className="flex-1 sm:flex-none px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold shadow-sm focus:ring-2 focus:ring-blue-500 appearance-none max-w-[140px] truncate"
          >
            {uniqueConditions.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => setRadarPulse(!radarPulse)}
            className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm border transition-colors flex justify-center items-center gap-2
              ${radarPulse ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400' : 'bg-white border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'}`}
          >
            <Radio size={14} className={radarPulse ? "animate-pulse" : ""} /> Radar 
          </button>
          <div className="relative flex-1 sm:flex-none">
            <button type="button" onClick={() => setBasemapOpen((open) => !open)} aria-expanded={basemapOpen} className="w-full h-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold shadow-sm flex items-center justify-center gap-2 text-gray-700 dark:text-gray-300 touch-manipulation">
              <Layers size={14} /> Basemaps
            </button>
            {basemapOpen && <div className="absolute right-0 left-auto top-full pt-2 w-48 z-[35] pointer-events-auto max-h-[50dvh] overflow-y-auto">
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-2">
                {baseMaps.map(map => (
                  <button 
                    key={map.id}
                    onClick={() => { setActiveBasemap(map.id); setBasemapOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-xs font-medium rounded-lg transition-colors ${activeBasemap === map.id ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'hover:bg-gray-50 text-gray-700 dark:text-gray-300 dark:hover:bg-gray-700'}`}
                  >
                    {map.name}
                  </button>
                ))}
              </div>
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
}
