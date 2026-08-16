import React from "react";
import { cn } from "@/lib/utils";
import logoKotaTangerangSelatan from "@/assets/logo_kota_tangerang_selatan.png";

/** Logo resmi Kota Tangerang Selatan, dibundel oleh Vite agar aman pada base path apa pun. */
export function BrandLogo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("inline-flex items-center justify-center", className)} aria-label="SIMOSDA Kota Tangerang Selatan">
      <img
        src={logoKotaTangerangSelatan}
        alt="Logo Kota Tangerang Selatan"
        className="h-full w-full object-contain drop-shadow-sm"
        draggable={false}
      />
      {!compact && <span className="sr-only">SIMOSDA</span>}
    </div>
  );
}
