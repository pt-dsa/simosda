import React from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
  children?: React.ReactNode;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    success: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400",
    danger: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400",
    info: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export function getStatusBadgeVariant(status: string): BadgeProps["variant"] {
  if (!status) return "default";
  const s = String(status || "").toLowerCase();
  if (s.includes("rusak berat") || s.includes("kritis") || s.includes("ditolak")) return "danger";
  if (s.includes("rusak ringan") || s.includes("kurang baik") || s.includes("monitoring") || s.includes("pengajuan") || s.includes("dipinjam")) return "warning";
  if (s === "baik" || s.includes("selesai") || s.includes("aman") || s.includes("disetujui") || s.includes("dikembalikan")) return "success";
  return "default";
}

export function StatusBadge({ status, className, ...props }: { status: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Badge variant={getStatusBadgeVariant(status)} className={className} {...props}>
      {status || "-"}
    </Badge>
  );
}
