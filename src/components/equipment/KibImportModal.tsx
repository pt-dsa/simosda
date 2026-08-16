import React, { useRef, useState } from "react";
import { AlertTriangle, FileUp, LoaderCircle, X } from "lucide-react";
import type { Equipment } from "@/types";
import { prepareKibImport, type KibImportResult } from "@/lib/kibImport";
import { apiService } from "@/services/apiService";

export function KibImportModal({ open, existing, onClose, onImported, onError }: { open: boolean; existing: Equipment[]; onClose: () => void; onImported: (message: string) => void; onError: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<KibImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  async function choose(file?: File) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) { onError("Pilih file dengan format .CSV."); return; }
    setBusy(true); setResult(null); setFileName(file.name);
    try { setResult(await prepareKibImport(file, existing)); }
    catch (error: any) { onError(error?.message || "CSV tidak dapat dibaca."); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!result || !result.importable.length || result.invalid.length) return;
    setBusy(true);
    try {
      const response = await apiService.importEquipment(result.importable, crypto.randomUUID());
      onImported(`${response.inserted} data berhasil diimpor; ${response.skipped} data yang sama dilewati. Total barang: ${result.sourceUnits} unit.`);
    } catch (error: any) { onError(error?.message || "Import belum berhasil."); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm">
    <div className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-gray-900">
      <div className="flex items-center justify-between border-b p-4 dark:border-gray-800"><div><h3 className="font-bold">Import Data</h3><p className="text-xs text-gray-500">Pilih file dengan format .CSV. Data akan diperiksa sebelum disimpan.</p></div><button onClick={onClose} className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={20}/></button></div>
      <div className="space-y-4 overflow-y-auto p-5">
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => choose(e.target.files?.[0])}/>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 p-6 font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300"><FileUp size={22}/>{busy ? "Memeriksa file..." : fileName || "Pilih File .CSV"}</button>
        {result && <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {[["Baris dibaca",result.sourceRows],["Total barang",result.sourceUnits],["Data siap",result.importable.length],["Baris digabung",result.aggregatedRows],["Kode pernah ada",result.codeWarnings],["Data sama",result.exactDuplicates]].map(([label,value]) => <div key={String(label)} className="rounded-2xl bg-gray-50 p-3 dark:bg-gray-800"><div className="text-xs text-gray-500">{label}</div><div className="text-xl font-black">{value}</div></div>)}
          </div>
          {result.invalid.length > 0 && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><div className="mb-2 flex items-center gap-2 font-bold"><AlertTriangle size={17}/>Import diblokir: {result.invalid.length} baris bermasalah</div>{result.invalid.slice(0,10).map((e) => <div key={e.row}>Baris {e.row}: {e.message}</div>)}</div>}
          <div className="overflow-x-auto rounded-2xl border dark:border-gray-800"><table className="min-w-full text-left text-xs"><thead className="bg-gray-50 dark:bg-gray-800"><tr>{["INDEX","Kode Barang","Nama Barang","Tahun","Kategori","Bidang","Pengguna","Jumlah","Status"].map(h=><th key={h} className="whitespace-nowrap p-3">{h}</th>)}</tr></thead><tbody>{result.records.slice(0,50).map((r,i)=><tr key={i} className="border-t dark:border-gray-800"><td className="p-3">{r.kib_index || <span className="text-amber-600">Belum diisi</span>}</td><td className="p-3">{r.kode_barang}</td><td className="p-3">{r.nama_aset}</td><td className="p-3">{r.tahun}</td><td className="p-3">{r.jenis||"-"}</td><td className="p-3">{r.bidang||"-"}</td><td className="p-3">{r.pengguna||"-"}</td><td className="p-3 font-bold">{r.jumlah}</td><td className="p-3">{r.exact_duplicate?<span className="text-red-600">Duplikat—dilewati</span>:r.code_exists?<span className="text-amber-600">Kode pernah digunakan</span>:<span className="text-emerald-600">Siap</span>}</td></tr>)}</tbody></table></div>
          {result.records.length>50 && <p className="text-xs text-gray-500">Menampilkan 50 dari {result.records.length} data. Seluruh data tetap diproses.</p>}
        </>}
      </div>
      <div className="flex justify-end gap-2 border-t bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900"><button onClick={onClose} disabled={busy} className="rounded-full border px-5 py-2 font-semibold">Batal</button><button onClick={submit} disabled={busy || !result?.importable.length || !!result?.invalid.length} className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 font-bold text-white disabled:opacity-50">{busy&&<LoaderCircle size={16} className="animate-spin"/>}Import Data</button></div>
    </div>
  </div>;
}
