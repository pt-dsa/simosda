import React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, containerClassName, ...props }: React.HTMLAttributes<HTMLTableElement> & { containerClassName?: string }) {
  return (
    <div className={cn("w-full overflow-auto rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm", containerClassName)}>
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  // sticky top-0 → header "freeze" saat body tabel digulir (item d).
  // bg dibuat hampir pekat + blur agar baris tidak menembus header.
  return <thead className={cn("sticky top-0 z-20 [&_tr]:border-b border-gray-100 dark:border-gray-800 bg-gray-100/95 dark:bg-gray-800/95 backdrop-blur-sm", className)} {...props} />;
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("border-b border-gray-50 dark:border-gray-800/50 transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-900/20 data-[state=selected]:bg-gray-100 dark:data-[state=selected]:bg-gray-800", className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("h-12 px-4 text-left align-middle font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
  );
}
