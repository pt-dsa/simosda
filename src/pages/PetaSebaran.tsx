import React, { useState, useEffect, useMemo } from "react";
import { dataService } from "@/services/dataService";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapLegend } from "@/components/maps/MapLegend";
import { MapFilters } from "@/components/maps/MapFilters";
import { Card, CardContent } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/LoadingState";
import { SafeImage } from "@/components/ui/SafeImage";
import { Car, Bike, Wrench, MapPin, Eye, Map as MapIcon, Layers, Radio, ZoomIn, X, Search, ChevronDown, ChevronUp } from "lucide-react";
import { renderToString } from "react-dom/server";
import { StatusBadge } from "@/components/ui/Badge";
import { resolveAssetPhotoCandidates, resolveAssetPhotoUrl } from "@/lib/media";
import type { Pegawai } from "@/types";
import { coordinatePairFromRow } from "@/lib/coordinates";
import { assetConditionLabel } from "@/lib/assetCondition";

// Fix Leaflet's default icon path issues in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface MapLocation {
  id: string;
  type: string; // 'Kendaraan' atau 'Inventaris'
  lat: number;
  lng: number;
  title: string;
  subtitle: string;
  condition: string;
  isMotorcycle?: boolean;
  pengguna?: string;
  qrUrl?: string;
  foto?: string;
  data: Record<string, any>;
}

const BASEMAPS = [
  { id: "osm", name: "OpenStreetMap", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "© OSM" },
  { id: "google", name: "Google Hybrid", url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", attribution: "© Google" },
  { id: "cartolight", name: "CartoDB Light", url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", attribution: "© CartoDB" },
  { id: "cartodark", name: "CartoDB Dark", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attribution: "© CartoDB" },
];

function MapResizeSync() {
  const map = useMap();
  useEffect(() => {
    let frame = 0;
    const refresh = () => {
      window.clearTimeout(frame);
      frame = window.setTimeout(() => map.invalidateSize({ animate: false }), 40);
    };
    refresh();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(refresh) : null;
    observer?.observe(map.getContainer());
    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);
    return () => {
      observer?.disconnect();
      window.clearTimeout(frame);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("orientationchange", refresh);
    };
  }, [map]);
  return null;
}

function canonicalEmployeeName(raw: unknown, nip: unknown, employees: Pegawai[]): string {
  const source = String(raw || "").trim();
  if (!source || source === "-") return "";
  const employeeNip = String(nip || "").trim();
  const linked = employeeNip && employees.find((employee) => String(employee.nip || "").trim() === employeeNip);
  if (linked) return linked.nama;
  return source;
}

function assetPhotoUrl(photo: unknown, type: string): string {
  return resolveAssetPhotoUrl(photo, type === "Inventaris" ? "alat_mesin" : "kendaraan");
}

export default function PetaSebaran() {
  const [locations, setLocations] = useState<MapLocation[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [filterType, setFilterType] = useState("Semua Tipe");
  const [filterCondition, setFilterCondition] = useState("Semua Kondisi");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeBasemap, setActiveBasemap] = useState("cartolight");
  const [radarPulse, setRadarPulse] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const [basemapOpen, setBasemapOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [vehicles, equipment, employees] = await Promise.all([
          dataService.getVehicles(),
          dataService.getEquipment(),
          dataService.getEmployeeDirectory(),
        ]);
        const employeeDirectory = employees as Pegawai[];

        const mapLocations: MapLocation[] = [];

        vehicles.forEach((v: any, index: number) => {
          const coordinates = coordinatePairFromRow(v);
          const lat = coordinates.latitude;
          const lng = coordinates.longitude;
          if (lat !== undefined && lng !== undefined) {
            const isMotor = String(v.jenis_kendaraan || "").toLowerCase().includes("motor") || 
                           String(v.jenis_kendaraan || "").toLowerCase().includes("roda 2") ||
                           String(v.jenis_kendaraan || "").toLowerCase().includes("roda dua");
            
            mapLocations.push({
              id: String(v.asset_id || v.id || `vehicle-${index}`),
              type: "Kendaraan",
              lat, 
              lng,
              title: v.no_polisi || v.nama_aset || "Kendaraan",
              subtitle: `${v.merk || ""} - ${v.jenis_kendaraan || ""}`,
              condition: assetConditionLabel(v.kondisi),
              isMotorcycle: isMotor,
              pengguna: canonicalEmployeeName(v.pengguna, v.pengguna_nip, employeeDirectory),
              qrUrl: v.qr_url,
              foto: v.foto,
              data: {
                "Kode Barang": v.kode_barang || "Belum diisi",
                "No. Polisi": v.no_polisi,
                "Merk": v.merk,
                "Tipe": v.tipe,
                "Tahun": v.tahun,
                "Pengguna": canonicalEmployeeName(v.pengguna, v.pengguna_nip, employeeDirectory),
                "Penanggung Jawab": canonicalEmployeeName(v.penanggung_jawab, v.penanggung_jawab_nip, employeeDirectory),
                "Unit Kerja": v.unit_kerja,
                "Lokasi / Unit": v.lokasi || v.unit_kerja,
                "Koordinat": `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
                "Kapasitas Mesin": v.kapasitas_mesin,
                "No. BPKB": v.no_bpkb,
                "No. Rangka": v.no_rangka,
                "No. Mesin": v.no_mesin,
                "Harga Pembelian": v.harga_pembelian,
              }
            });
          }
        });

        equipment.forEach((e: any, index: number) => {
          const coordinates = coordinatePairFromRow(e);
          const lat = coordinates.latitude;
          const lng = coordinates.longitude;
          if (lat !== undefined && lng !== undefined) {
            mapLocations.push({
              id: String(e.asset_id || e.id || `equipment-${index}`),
              type: "Inventaris",
              lat, 
              lng,
              title: e.nama_aset || "Inventaris",
              subtitle: e.merk || "-",
              condition: assetConditionLabel(e.kondisi),
              pengguna: canonicalEmployeeName(e.pengguna, e.pengguna_nip, employeeDirectory),
              qrUrl: e.qr_url,
              foto: e.foto,
              data: {
                "ID Aset": e.asset_id,
                "Kode Barang": e.kode_barang,
                "QR / ID Aset": e.qr_url || e.asset_id,
                "Nama Barang": e.nama_aset,
                "Merk": e.merk,
                "Jenis": e.jenis,
                "Jumlah": e.jumlah ? `${e.jumlah} ${e.satuan || ''}` : '',
                "Kondisi": assetConditionLabel(e.kondisi),
                "Tahun": e.tahun,
                "Pengguna": canonicalEmployeeName(e.pengguna, e.pengguna_nip, employeeDirectory),
                "Penanggung Jawab": canonicalEmployeeName(e.penanggung_jawab, e.penanggung_jawab_nip, employeeDirectory),
                "Lokasi / Unit": e.lokasi,
                "Koordinat": `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
                "Harga Pembelian": e.harga_pembelian,
              }
            });
          }
        });

        setLocations(mapLocations);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredLocations = useMemo(() => {
    const query = String(searchQuery || "").toLocaleLowerCase("id-ID");
    return locations.filter(loc => {
      const matchType = filterType === "Semua Tipe" || loc.type === filterType;
      const matchCond = filterCondition === "Semua Kondisi" || String(loc.condition || "").toUpperCase() === String(filterCondition || "").toUpperCase();
      const matchSearch = !query || [loc.title, loc.subtitle, loc.pengguna, ...Object.values(loc.data)]
        .some((value) => String(value ?? "").toLocaleLowerCase("id-ID").includes(query));
      return matchType && matchCond && matchSearch;
    });
  }, [locations, filterType, filterCondition, searchQuery]);

  // Jumlah titik per tipe atas SELURUH lokasi (untuk chip klikable → filterType).
  const typeSummary = useMemo(() => {
    const order = ["Kendaraan", "Inventaris"];
    const counts: Record<string, number> = {};
    locations.forEach((l) => { counts[l.type] = (counts[l.type] || 0) + 1; });
    const keys = Array.from(new Set([...order.filter((k) => counts[k]), ...Object.keys(counts)]));
    return keys.map((k) => ({ type: k, count: counts[k] || 0 }));
  }, [locations]);

  const markerIcons = useMemo(() => {
    const build = (type: "car" | "motorcycle" | "equipment") => {
      let color = "#0B57D0";
      let IconComponent = <MapPin size={16} />;
      if (type === "car" || type === "motorcycle") {
        color = "#4F46E5";
        IconComponent = type === "motorcycle" ? <Bike size={16} /> : <Car size={16} />;
      } else {
        color = "#16A34A";
        IconComponent = <Wrench size={16} />;
      }

      const iconHtml = renderToString(IconComponent);
      const pulseHtml = radarPulse
        ? `<div class="absolute inset-[-8px] rounded-full border-2 animate-radar-pulse opacity-0 pointer-events-none" style="border-color: ${color}"></div>`
        : "";
      return L.divIcon({
        className: "bg-transparent border-none",
        html: `<div class="relative group w-8 h-8">${pulseHtml}<div class="w-full h-full rounded-full border-2 border-white shadow-md flex items-center justify-center text-white relative z-10" style="background-color: ${color}">${iconHtml}</div></div>`,
        iconAnchor: [16, 16],
        tooltipAnchor: [16, 0],
        popupAnchor: [0, -16],
      });
    };
    return { car: build("car"), motorcycle: build("motorcycle"), equipment: build("equipment") };
  }, [radarPulse]);

  if (loading) {
    return <LoadingState />;
  }

  const center: [number, number] = filteredLocations.length > 0
    ? [filteredLocations[0].lat, filteredLocations[0].lng]
    : [-6.2866, 106.6888]; // default to area info

  const getMarkerIcon = (loc: MapLocation) => loc.type === "Inventaris"
    ? markerIcons.equipment
    : (loc.isMotorcycle ? markerIcons.motorcycle : markerIcons.car);

  const getStats = () => {
    const stats: Record<string, number> = {};
    filteredLocations.forEach(l => {
      stats[l.type] = (stats[l.type] || 0) + 1;
    });
    return stats;
  };
  const stats = getStats();
  const selectedBasemap = BASEMAPS.find(b => b.id === activeBasemap) || BASEMAPS[0];

  const uniqueConditions = ["Semua Kondisi", ...Array.from(new Set(locations.map(l => l.condition.toUpperCase())))];

  return (
    <div className="h-full min-h-0 w-full max-w-none flex flex-col relative bg-gray-50 border-t border-gray-100 overflow-hidden touch-pan-y">
      <MapFilters
        locationsLength={locations.length}
        typeSummary={typeSummary}
        filterType={filterType}
        setFilterType={setFilterType}
        filterCondition={filterCondition}
        setFilterCondition={setFilterCondition}
        uniqueConditions={uniqueConditions}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        radarPulse={radarPulse}
        setRadarPulse={setRadarPulse}
        activeBasemap={activeBasemap}
        setActiveBasemap={setActiveBasemap}
        basemapOpen={basemapOpen}
        setBasemapOpen={setBasemapOpen}
        baseMaps={BASEMAPS}
      />

      <div className="absolute inset-0 z-10 bg-gray-100">
        <MapContainer center={center} zoom={16} style={{ height: "100%", width: "100%", zIndex: 10 }} maxZoom={20} zoomAnimation={false} fadeAnimation={false} markerZoomAnimation={false}>
          <MapResizeSync />
          <TileLayer
            key={activeBasemap}
            attribution={selectedBasemap.attribution}
            url={selectedBasemap.url}
            maxZoom={20}
            updateWhenIdle
            updateWhenZooming={false}
            keepBuffer={1}
          />
          {filteredLocations.map((item, idx) => (
            <Marker key={`${item.type}-${item.id}-${idx}`} position={[item.lat, item.lng]} icon={getMarkerIcon(item)}>
              <Popup className="rounded-xl overflow-hidden min-w-0 w-[min(320px,calc(100vw-2rem))]">
                <div className="p-0 -m-3">
                  {item.foto && (
                    <div 
                      className="w-full h-32 sm:h-36 bg-gray-100 relative overflow-hidden group cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setZoomedImage(assetPhotoUrl(item.foto, item.type)); }}
                    >
                      <SafeImage 
                        src={assetPhotoUrl(item.foto, item.type)} 
                        fallbackSrcs={resolveAssetPhotoCandidates(item.foto, item.type === "Inventaris" ? "alat_mesin" : "kendaraan").slice(1)}
                        alt={item.title} 
                        className="w-full h-full object-contain bg-gray-900 group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <ZoomIn size={32} className="text-white drop-shadow-md" />
                      </div>
                    </div>
                  )}
                  <div className="p-4 space-y-3 bg-white dark:bg-gray-900">
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg leading-tight">{item.title}</h3>
                      <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{item.subtitle}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                        <span className="block text-gray-400 dark:text-gray-500 mb-1">Tipe Aset</span>
                        <span className="font-semibold text-gray-700 dark:text-gray-300">{item.type}</span>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                        <span className="block text-gray-400 dark:text-gray-500 mb-1">Kondisi</span>
                        <StatusBadge status={item.condition} className="!text-[10px] !py-0.5" />
                      </div>
                    </div>

                    {/* Detailed Data View */}
                    <div className="border-t border-gray-100 dark:border-gray-800/60 pt-3 mt-3 space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1 relative">
                      {Object.entries(item.data).map(([key, value]) => {
                         if (!value || value === '-') return null;
                         return (
                           <div key={key} className="flex justify-between items-start gap-4 border-b border-gray-50 dark:border-gray-800/50 pb-1.5 last:border-0 last:pb-0">
                             <span className="text-[11px] text-gray-500 dark:text-gray-400 w-1/3 flex-shrink-0">{key}</span>
                             <span className="text-[11px] font-medium text-right text-gray-800 dark:text-gray-200 break-words flex-1 pl-2">{value as React.ReactNode}</span>
                           </div>
                         );
                      })}
                    </div>

                    <div className="flex gap-2 border-t border-gray-100 dark:border-gray-800 pt-3 mt-3">
                      <a 
                        href={`https://maps.google.com/?q=${item.lat},${item.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg py-2 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                      >
                        <MapIcon size={14} /> Maps
                      </a>
                      <a 
                        href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${item.lat},${item.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg py-2 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
                      >
                        <Eye size={14} /> Street View
                      </a>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        
        <MapLegend 
          totalLocations={filteredLocations.length} 
          stats={stats} 
          isOpen={isLegendOpen} 
          setIsOpen={setIsLegendOpen} 
        />
      </div>

      {zoomedImage && (
        <div className="fixed inset-0 z-[9999] p-2 sm:p-4 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setZoomedImage(null)}>
          <button onClick={() => setZoomedImage(null)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
            <X size={24} />
          </button>
          <SafeImage 
            src={zoomedImage} 
            alt="Zoomed Asset" 
            className="w-full h-auto max-h-[90vh] object-contain rounded-xl shadow-2xl" 
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
