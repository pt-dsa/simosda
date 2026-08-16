import React, { useMemo, useState } from "react";
import type { Pegawai } from "@/types";
import { Search, UserRound, X } from "lucide-react";

interface EmployeeAutocompleteProps {
  label: string;
  value: string;
  employees: Pegawai[];
  onChange: (employeeName: string) => void;
  onSelect?: (employee: Pegawai | null) => void;
  selectedNip?: string;
  placeholder?: string;
  required?: boolean;
}

function employeeKey(value: unknown): string {
  return String(value || "").trim().toLocaleUpperCase("id-ID").replace(/\s+/g, " ");
}

export function isOfficialEmployeeName(value: unknown, employees: Pegawai[]): boolean {
  const key = employeeKey(value);
  return !key || employees.some((employee) => employeeKey(employee.nama) === key);
}

export function isOfficialEmployeeSelection(name: unknown, nip: unknown, employees: Pegawai[]): boolean {
  const expectedName = employeeKey(name);
  const expectedNip = String(nip || "").trim();
  if (!expectedName && !expectedNip) return true;
  return Boolean(expectedNip) && employees.some((employee) =>
    String(employee.nip || "").trim() === expectedNip && employeeKey(employee.nama) === expectedName
  );
}

export function EmployeeAutocomplete({
  label,
  value,
  employees,
  onChange,
  onSelect,
  selectedNip = "",
  placeholder = "Ketik minimal 2 huruf nama pegawai...",
  required = false,
}: EmployeeAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const query = String(value || "");
  const matches = useMemo(() => {
    const needle = employeeKey(query);
    if (needle.length < 2) return [];
    return employees
      .filter((employee) => employeeKey(`${employee.nama} ${employee.nip} ${employee.jabatan}`).includes(needle))
      .slice(0, 10);
  }, [employees, query]);
  const selected = useMemo(
    () => String(selectedNip || "").trim()
      ? employees.find((employee) => String(employee.nip || "").trim() === String(selectedNip || "").trim())
      : undefined,
    [employees, selectedNip],
  );

  return (
    <div className="relative flex flex-col gap-1">
      <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={query}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            onChange(event.target.value);
            onSelect?.(null);
            setOpen(true);
          }}
          placeholder={placeholder}
          className="w-full pl-9 pr-10 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
        />
        {query && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onChange("");
              onSelect?.(null);
              setOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="Hapus"
          >
            <X size={16} />
          </button>
        )}
      </div>
      {selected && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 truncate">
          NIP {selected.nip} · {selected.jabatan || "Jabatan belum tersedia"}
        </p>
      )}
      {open && query.trim().length >= 2 && (
        <div className="absolute z-[130] top-full mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl">
          {matches.length ? matches.map((employee) => (
            <button
              type="button"
              key={employee.nip}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(employee.nama);
                onSelect?.(employee);
                setOpen(false);
              }}
              className="w-full px-3 py-2.5 text-left hover:bg-blue-50 dark:hover:bg-blue-900/30 border-b last:border-b-0 border-gray-100 dark:border-gray-800"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-gray-100">
                <UserRound size={14} className="text-blue-600 shrink-0" /> {employee.nama}
              </span>
              <span className="block pl-6 text-xs text-gray-500 truncate">
                NIP {employee.nip} · {employee.jabatan || "Jabatan belum tersedia"} · {employee.unit_kerja || "Unit kerja belum tersedia"}
              </span>
            </button>
          )) : (
            <div className="px-3 py-3 text-xs text-gray-500">Pegawai tidak ditemukan. Pilih nama yang tersedia pada daftar pegawai.</div>
          )}
        </div>
      )}
    </div>
  );
}
