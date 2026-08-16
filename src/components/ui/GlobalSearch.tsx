import React, { useState, useEffect, useRef } from "react";
import { Search, CarFront, Wrench, FileText, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { dataService } from "@/services/dataService";
import { cn, toSearchText } from "@/lib/utils";

interface SearchResult {
  id: string;
  type: "module" | "vehicle" | "equipment";
  title: string;
  subtitle: string;
  url: string;
  icon: React.ReactNode;
}

const MODULES: SearchResult[] = [
  { id: "m1", type: "module", title: "Dashboard", subtitle: "Ringkasan Aset Daerah", url: "/dashboard", icon: <FileText size={18} /> },
  { id: "m2", type: "module", title: "Data Kendaraan", subtitle: "Kelola aset kendaraan", url: "/kendaraan", icon: <CarFront size={18} /> },
  { id: "m3", type: "module", title: "Inventaris", subtitle: "Kelola data inventaris", url: "/alat-mesin", icon: <Wrench size={18} /> },
  { id: "m8", type: "module", title: "Peta Sebaran", subtitle: "Lokasi geografis aset", url: "/peta", icon: <FileText size={18} /> },
  { id: "m9", type: "module", title: "Rekap Laporan", subtitle: "Unduh laporan data", url: "/laporan", icon: <FileText size={18} /> },
];

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  
  const [assetData, setAssetData] = useState<{
    vehicles: any[];
    equipment: any[];
  }>({ vehicles: [], equipment: [] });

  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const inputRef = useRef<HTMLInputElement>(null);

  // Close search when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fetch data only when search is focused for the first time
  const handleFocus = async () => {
    setIsOpen(true);
    if (!assetsLoaded && !isLoading) {
      setIsLoading(true);
      try {
        const [v, e] = await Promise.all([
          dataService.getVehicles(),
          dataService.getEquipment()
        ]);
        setAssetData({ vehicles: v, equipment: e });
        setAssetsLoaded(true);
      } catch (error) {
        console.error("Failed to load assets for search:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Run search
  useEffect(() => {
    if (!query) {
      setResults(MODULES.slice(0, 5)); // Show some default modules when empty
      return;
    }

    const q = toSearchText(query);
    const searchResults: SearchResult[] = [];

    // Search modules
    const matchedModules = MODULES.filter(m => 
      toSearchText(m.title).includes(q) || toSearchText(m.subtitle).includes(q)
    );
    searchResults.push(...matchedModules);

    // Search vehicles
    if (assetsLoaded) {
      const vMatches = assetData.vehicles
        .filter(v => [v.no_polisi, v.merk, v.kode_barang].some((value) => toSearchText(value).includes(q)))
        .map(v => ({
          id: `v_${v.asset_id || v.no_polisi}`,
          type: "vehicle" as const,
          title: `${v.merk || "Kendaraan"} - ${v.no_polisi || ""}`,
          subtitle: v.jenis_kendaraan || "Data Kendaraan",
          url: `/kendaraan?search=${encodeURIComponent(String(v.no_polisi || ""))}`,
          icon: <CarFront size={18} />
        }))
        .slice(0, 5); // Limit results
      
      searchResults.push(...vMatches);

      const eMatches = assetData.equipment
        .filter(e => [e.nama_aset, e.nama_barang, e.kode_barang, e.kib_index].some((value) => toSearchText(value).includes(q)))
        .map(e => ({
          id: `e_${e.equipment_id || e.kode_barang}`,
          type: "equipment" as const,
          title: String(e.nama_aset || e.nama_barang || "Inventaris"),
          subtitle: String(e.kode_barang || "Data Inventaris"),
          url: `/alat-mesin?search=${encodeURIComponent(String(e.nama_aset || e.nama_barang || ""))}`,
          icon: <Wrench size={18} />
        }))
        .slice(0, 5);
        
      searchResults.push(...eMatches);

    }

    setResults(searchResults.slice(0, 8)); // Max 8 results overall
  }, [query, assetsLoaded, assetData]);

  const handleSelect = (url: string) => {
    setIsOpen(false);
    setQuery("");
    navigate(url);
  };

  return (
    <div className="relative z-50 w-full max-w-sm" ref={containerRef}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search size={18} className="text-gray-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          className="block w-full pl-10 pr-10 py-2 border border-gray-200 dark:border-gray-700 rounded-full bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm text-sm placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-800 transition-all"
          placeholder="Cari aset atau modul (Ctrl+K)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleFocus}
        />
        {query && (
          <button 
            type="button"
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            onClick={() => { setQuery(""); setIsOpen(false); }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden break-words">
          {isLoading && !assetsLoaded ? (
             <div className="p-4 text-center text-sm text-gray-500">Memuat data aset...</div>
          ) : results.length > 0 ? (
            <ul className="max-h-[60vh] overflow-y-auto w-full">
              {results.map((result, idx) => (
                <li key={`${result.id}-${idx}`}>
                  <button
                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-50 dark:border-gray-700/30 last:border-0"
                    onClick={() => handleSelect(result.url)}
                  >
                    <div className={cn(
                      "mt-0.5 p-2 rounded-lg flex-shrink-0",
                      result.type === "module" ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" :
                      result.type === "vehicle" ? "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400" :
                      result.type === "equipment" ? "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" :
                      "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
                    )}>
                      {result.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{result.title}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{result.subtitle}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 text-center text-sm text-gray-500">
              Tidak ada hasil yang ditemukan untuk "{query}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
