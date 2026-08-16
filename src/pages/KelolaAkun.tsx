import React, { useEffect, useState, useContext, useMemo } from "react";
import {
  UserCog, Plus, Save, X, RefreshCw, ShieldAlert, ShieldCheck, Download,
  CheckCircle2, Ban, Pencil, Mail, Lock, IdCard, Users as UsersIcon, RotateCcw,
  Search, Filter, Activity, UserPlus, Trash2, CheckCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { apiService, type AccessUser } from "@/services/apiService";
import { dataService } from "@/services/dataService";
import type { Pegawai } from "@/types";
import { AuthContext } from "@/components/layout/AppShell";
import { LoadingState } from "@/components/ui/LoadingState";
import { Card, CardContent } from "@/components/ui/Card";
import { ConfirmModal, CONFIRM_CLOSED, type ConfirmState } from "@/components/ui/ConfirmModal";
import { employmentStatusLabel, matchesEmploymentStatus } from "@/lib/employmentStatus";
import { useToast } from "@/components/ui/Toast";
import Papa from "papaparse";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  pimpinan: "Pimpinan",
  pegawai: "Pegawai",
};
const ROLE_BADGE: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  pimpinan: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  pegawai: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

const inputCls =
  "w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none read-only:opacity-60";
const labelCls = "block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1";

function accountStatus(user: AccessUser) {
  if (!user.is_active || user.auth_status === "disabled") return { label: "Dinonaktifkan", className: "text-gray-500 dark:text-gray-400", icon: Ban };
  if (user.auth_status === "active" || !!user.registered_at || !!user.auth_user_id) return { label: "Aktif", className: "text-emerald-600 dark:text-emerald-400", icon: ShieldCheck };
  return { label: "Menunggu Aktivasi", className: "text-amber-600 dark:text-amber-400", icon: Lock };
}

interface FormState {
  email: string;
  role: "admin" | "pimpinan" | "pegawai";
  nip: string;
  nama: string;
  is_active: boolean;
  auth_status: "ready" | "active" | "disabled";
}
const emptyForm: FormState = { email: "", role: "pegawai", nip: "", nama: "", is_active: true, auth_status: "ready" };

export default function KelolaAkun() {
  const toast = useToast();
  const { user } = useContext(AuthContext);
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [pegawai, setPegawai] = useState<Pegawai[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pegawaiStatusFilter, setPegawaiStatusFilter] = useState("all");
  const [jabatanFilter, setJabatanFilter] = useState("all");
  const [bidangFilter, setBidangFilter] = useState("all");

  // Ganti window.confirm — aman di dalam iframe
  const [confirm, setConfirm] = useState<ConfirmState>(CONFIRM_CLOSED);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const searchStr = searchQuery.toLowerCase();
      const matchSearch = !searchQuery || (
        (u.nama || "").toLowerCase().includes(searchStr) ||
        (u.email || "").toLowerCase().includes(searchStr) ||
        (u.nip || "").includes(searchQuery)
      );
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      
      let matchStatus = true;
      if (statusFilter !== "all") {
        const statusLabel = accountStatus(u).label;
        if (statusFilter === "aktif" && statusLabel !== "Aktif") matchStatus = false;
        if (statusFilter === "siap_registrasi" && statusLabel !== "Menunggu Aktivasi") matchStatus = false;
        if (statusFilter === "nonaktif" && statusLabel !== "Dinonaktifkan") matchStatus = false;
      }

      const p = pegawai.find((p) => p.nip === u.nip);

      let matchPegawaiStatus = true;
      if (pegawaiStatusFilter !== "all") {
        if (!p) {
          matchPegawaiStatus = false;
        } else {
          matchPegawaiStatus = matchesEmploymentStatus(p, pegawaiStatusFilter);
        }
      }

      let matchJabatan = true;
      if (jabatanFilter !== "all") {
        if (!p || p.jabatan !== jabatanFilter) matchJabatan = false;
      }

      let matchBidang = true;
      if (bidangFilter !== "all") {
        if (!p || (p as any).bidang !== bidangFilter) matchBidang = false;
      }

      return matchSearch && matchRole && matchStatus && matchPegawaiStatus && matchJabatan && matchBidang;
    });
  }, [users, pegawai, searchQuery, roleFilter, statusFilter, pegawaiStatusFilter, jabatanFilter, bidangFilter]);

  const handleDownloadCSV = () => {
    if (filteredUsers.length === 0) return;
    const data = filteredUsers.map((u) => ({
      Email: u.email,
      NIP: u.nip || "-",
      Nama: u.nama || "-",
      Peran: u.role,
      Status: accountStatus(u).label,
    }));
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Data_Akun_SIMOSDA_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  function askConfirm(opts: Omit<ConfirmState, "open">) {
    setConfirm({ ...opts, open: true });
  }

  function closeConfirm() { setConfirm(CONFIRM_CLOSED); }

  async function load(showFullLoading = true, force = false) {
    if (showFullLoading) setLoading(true);
    if (force) dataService.clearCache();
    setError(null);
    setDenied(false);
    try {
      const [res, employeeRows] = await Promise.all([
        apiService.userList(),
        dataService.getPegawai(),
      ]);
      const sorted = (res.users || []).slice().sort((a, b) => a.email.localeCompare(b.email));
      setUsers(sorted);
      setPegawai((employeeRows || []).filter((p: Pegawai) => p.is_active !== false));
      return true;
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (/admin|akses ditolak|ditolak/i.test(msg)) setDenied(true);
      else setError(msg);
      return false;
    } finally {
      if (showFullLoading) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const seedRes = await apiService.userSeedFromPegawai();
      await load(false, true);
      if (seedRes.added > 0) {
        toast.success("Sinkronisasi Berhasil", `${seedRes.added} akun pegawai baru berhasil disinkronkan dari data kepegawaian.`);
      } else {
        toast.success("Sinkronisasi Selesai", "Semua data pegawai dengan email valid telah tersinkronisasi ke daftar akun.");
      }
    } catch (e: any) {
      toast.error("Sinkronisasi Gagal", String(e?.message || e));
    } finally {
      setSyncing(false);
    }
  }

  function openAdd() {
    setForm(emptyForm);
    setEmployeeQuery("");
    setSuggestionsOpen(false);
    setIsEdit(false);
    setError(null);
    setIsFormOpen(true);
  }

  // Listener untuk AI Voice Command (Event: ai-action)
  useEffect(() => {
    const handleAIAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { action, target } = customEvent.detail || {};
      if (action === "FILL_FORM" && target === "account_form") {
        openAdd();
      }
    };
    window.addEventListener('ai-action', handleAIAction);
    return () => window.removeEventListener('ai-action', handleAIAction);
  }, []);

  function openEdit(u: AccessUser) {
    setForm({ email: u.email, role: u.role, nip: String(u.nip || ""), nama: u.nama || "", is_active: u.is_active, auth_status: u.auth_status || "ready" });
    setEmployeeQuery(u.nama || "");
    setSuggestionsOpen(false);
    setIsEdit(true);
    setError(null);
    setIsFormOpen(true);
  }

  async function handleSave(e: any) {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);
    const email = form.email.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError("Email yang valid wajib diisi.");
      return;
    }
    if (!isEdit && !/^\d{18}$/.test(form.nip.trim())) {
      setError("Pilih nama dari daftar pegawai terlebih dahulu.");
      return;
    }
    setSaving(true);
    try {
      await apiService.userSave(
        { email, role: form.role, nip: form.nip.trim(), nama: form.nama.trim(), is_active: form.is_active },
        !isEdit
      );
      setNotice(isEdit ? `Akun ${email} diperbarui.` : `Akun ${email} ditambahkan.`);
      toast.success(isEdit ? "Perubahan Data Berhasil Disimpan" : "Akun Berhasil Ditambahkan", isEdit ? `Perubahan akun ${email} telah tersimpan.` : `Akun ${email} telah terhubung dengan data pegawai.`);
      setIsFormOpen(false);
      await load();
    } catch (e: any) {
      const message = String(e?.message || e);
      setError(message);
      toast.error("Penyimpanan Akun Gagal", message);
    } finally {
      setSaving(false);
    }
  }

  const candidateEmployees = useMemo(() => {
    const query = employeeQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    const registeredNips = new Set(users.map((u) => String(u.nip || "").trim()).filter(Boolean));
    return pegawai
      .filter((p) => {
        const text = `${p.nama || ""} ${p.nip || ""} ${p.email || ""}`.toLowerCase();
        return text.includes(query) && !registeredNips.has(String(p.nip || "").trim());
      })
      .slice(0, 8);
  }, [employeeQuery, pegawai, users]);
  const selectedEmployee = useMemo(() => pegawai.find((p) => String(p.nip) === String(form.nip)), [pegawai, form.nip]);

  function selectEmployee(employee: Pegawai) {
    const email = String(employee.email || "").toLowerCase().trim();
    setForm((current) => ({
      ...current,
      nip: String(employee.nip || "").trim(),
      nama: String(employee.nama || "").trim(),
      email,
    }));
    setEmployeeQuery(String(employee.nama || "").trim());
    setSuggestionsOpen(false);
    setError(null);
  }

  function handleDeactivate(u: AccessUser) {
    if (u.email === (user?.email || "").toLowerCase()) {
      askConfirm({
        title: "Tidak Dapat Menonaktifkan",
        message: "Anda tidak dapat menonaktifkan akun yang sedang Anda gunakan.",
        confirmLabel: "Mengerti",
        confirmClass: "bg-gray-600 hover:bg-gray-700",
        onConfirm: () => {},
      });
      return;
    }
    askConfirm({
      title: "Nonaktifkan Akun",
      message: `Nonaktifkan akses untuk "${u.email}"?\n\nAkses SIMOSDA dan kredensial login akan dinonaktifkan. User tidak dapat login sampai diaktifkan kembali.`,
      confirmLabel: "Nonaktifkan",
      confirmClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        try {
          await apiService.userDeactivate(u.email);
          setNotice(`Akses ${u.email} dinonaktifkan.`);
          toast.success("Akun Dinonaktifkan", `Akses ${u.email} berhasil dinonaktifkan.`);
          await load();
        } catch (e: any) {
          const message = String(e?.message || e);
          setError(message);
          toast.error("Perubahan Akun Gagal", message);
        }
      },
    });
  }

  function handleActivate(u: AccessUser) {
    askConfirm({
      title: "Aktifkan Kembali Akun",
      message: `Aktifkan kembali akses untuk "${u.email}"?\n\nAkun akan disiapkan dengan status "Menunggu Aktivasi". User dapat membuat password baru melalui halaman Registrasi SIMOSDA.`,
      confirmLabel: "Aktifkan Akun",
      confirmClass: "bg-emerald-600 hover:bg-emerald-700",
      onConfirm: async () => {
        try {
          await apiService.userSave({ email: u.email, nip: u.nip, nama: u.nama, role: u.role, is_active: true }, false);
          setNotice(`Akses ${u.email} telah diaktifkan kembali.`);
          toast.success("Akun Berhasil Diaktifkan", `Akun ${u.email} berstatus Menunggu Aktivasi dan siap diregistrasikan.`);
          await load();
        } catch (e: any) {
          const message = String(e?.message || e);
          setError(message);
          toast.error("Aktivasi Akun Gagal", message);
        }
      },
    });
  }

  function handleDelete(u: AccessUser) {
    if (u.email === (user?.email || "").toLowerCase()) {
      askConfirm({
        title: "Tidak Dapat Menghapus",
        message: "Anda tidak dapat menghapus akun yang sedang Anda gunakan.",
        confirmLabel: "Mengerti",
        confirmClass: "bg-gray-600 hover:bg-gray-700",
        onConfirm: () => {},
      });
      return;
    }
    askConfirm({
      title: "Hapus Akun Permanen",
      message: `Hapus akun "${u.email}" secara permanen dari daftar akses SIMOSDA?\n\nData pegawai di master ASN/PPPK tetap aman dan tidak akan terhapus.`,
      confirmLabel: "Hapus Permanen",
      confirmClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        try {
          await apiService.userDelete(u.email);
          setNotice(`Akun ${u.email} dihapus permanen.`);
          toast.success("Akun Dihapus", `Data akses ${u.email} telah dihapus.`);
          await load();
        } catch (e: any) {
          const message = String(e?.message || e);
          setError(message);
          toast.error("Gagal Menghapus Akun", message);
        }
      },
    });
  }

  function handleResetRegistration(u: AccessUser) {
    askConfirm({
      title: "Reset Registrasi",
      message: `Reset password dan registrasi untuk "${u.email}"?\n\nKredensial lama akan dihapus. User harus membuka menu Registrasi dan membuat password baru menggunakan NIP serta email yang sama.`,
      confirmLabel: "Reset Registrasi",
      confirmClass: "bg-amber-600 hover:bg-amber-700",
      onConfirm: async () => {
        try {
          await apiService.userResetRegistration(u.email);
          setNotice(`Registrasi ${u.email} telah direset. User dapat membuat password baru.`);
          toast.success("Reset Berhasil", `Akun ${u.email} kembali berstatus Menunggu Aktivasi.`);
          await load();
        } catch (e: any) {
          const message = String(e?.message || e);
          setError(message);
          toast.error("Reset Registrasi Gagal", message);
        }
      },
    });
  }

  function handleSeed() {
    askConfirm({
      title: "Buat dari Data Pegawai",
      message:
        "Buat akun untuk setiap pegawai aktif ber-NIP yang belum terdaftar?\n\n" +
        "• Bila email pegawai valid, akses dibuat dengan status MENUNGGU AKTIVASI.\n" +
        "• User membuat password sendiri melalui halaman Registrasi.\n" +
        "• Bila email kosong/tidak valid, data dilewati dan harus dilengkapi melalui Data ASN/PPPK.",
      confirmLabel: "Tarik Sekarang",
      confirmClass: "bg-blue-600 hover:bg-blue-700",
      onConfirm: async () => {
        setSeeding(true);
        setError(null);
        try {
          const res = await apiService.userSeedFromPegawai();
          setNotice(`Selesai. ${res.added} akun pegawai ditambahkan. ${res.note || ""}`);
          toast.success("Sinkronisasi Akun Berhasil", `${res.added} akun pegawai berhasil ditambahkan. ${res.note || ""}`);
          await load();
        } catch (e: any) {
          const message = String(e?.message || e);
          setError(message);
          toast.error("Sinkronisasi Akun Gagal", message);
        } finally {
          setSeeding(false);
        }
      },
    });
  }

  if (loading) return <LoadingState />;

  if (denied) {
    return (
      <div className="max-w-xl mx-auto mt-10">
        <Card>
          <CardContent className="p-8 text-center">
            <ShieldAlert className="mx-auto mb-3 text-red-500" size={40} />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Akses Ditolak</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Halaman Kelola Akun hanya untuk Administrator dan Pimpinan. Peran akun Anda saat ini tidak memiliki izin ini.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeCount = users.filter((u: AccessUser) => accountStatus(u).label === "Aktif").length;
  const pendingCount = users.filter((u: AccessUser) => accountStatus(u).label === "Menunggu Aktivasi").length;
  const disabledCount = users.filter((u: AccessUser) => accountStatus(u).label === "Dinonaktifkan").length;

  const jabatans = Array.from(new Set(pegawai.map((p: Pegawai) => p.jabatan).filter(Boolean))) as string[];
  jabatans.sort();
  const bidangs = Array.from(new Set(pegawai.map((p: any) => p.bidang).filter(Boolean))) as string[];
  bidangs.sort();

  return (
    <>
      {/* Modal konfirmasi (menggantikan window.confirm) */}
      <AnimatePresence>
        {confirm.open && <ConfirmModal state={confirm} onClose={closeConfirm} />}
      </AnimatePresence>

      <div className="space-y-6 pb-20">
        {/* Top Action Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between bg-gradient-to-r from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 p-4 rounded-xl border-b-4 border-indigo-100 dark:border-indigo-900 shadow-md gap-4">
          <h1 className="text-xl font-extrabold flex items-center gap-2 drop-shadow-sm text-gray-900 dark:text-white">
            <Activity className="text-indigo-600 dark:text-indigo-400" /> Akses & Keamanan
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 md:flex-initial">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={14} />
              <input
                type="text"
                placeholder="Cari akun..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full md:w-64 pl-8 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 dark:text-gray-100"
              />
            </div>
            <button
              onClick={handleDownloadCSV}
              className="px-3 py-2 text-sm font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-md hover:shadow-lg active:translate-y-px transition-all flex items-center gap-2"
            >
              <Download size={14} /> Ekspor CSV
            </button>
            <button
              onClick={handleSync}
              className="px-3 py-2 text-sm font-bold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm active:translate-y-px transition-all flex items-center gap-2"
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> Sinkronisasi
            </button>
          </div>
        </div>

        {/* Dashboard Stats (Clickable Filter Cards) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`text-left bg-white dark:bg-gray-800 p-4 rounded-xl border-b-4 shadow-md flex items-center gap-4 transition-all duration-200 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 ${
              statusFilter === "all"
                ? "border-indigo-500 ring-2 ring-indigo-500/50 bg-indigo-50/20 dark:bg-indigo-950/20"
                : "border-indigo-200 dark:border-indigo-800"
            }`}
          >
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-lg shrink-0">
              <UsersIcon size={24} />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wide">Total Akun</p>
              <p className="text-2xl font-black text-gray-900 dark:text-white drop-shadow-sm">{users.length}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === "aktif" ? "all" : "aktif")}
            className={`text-left bg-white dark:bg-gray-800 p-4 rounded-xl border-b-4 shadow-md flex items-center gap-4 relative overflow-hidden transition-all duration-200 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 ${
              statusFilter === "aktif"
                ? "border-emerald-500 ring-2 ring-emerald-500/50 bg-emerald-50/20 dark:bg-emerald-950/20"
                : "border-emerald-200 dark:border-emerald-800"
            }`}
          >
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-lg shrink-0">
              <ShieldCheck size={24} />
            </div>
            <div className="relative z-10">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wide">Aktif</p>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 drop-shadow-sm">{activeCount}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === "siap_registrasi" ? "all" : "siap_registrasi")}
            className={`text-left bg-white dark:bg-gray-800 p-4 rounded-xl border-b-4 shadow-md flex items-center gap-4 transition-all duration-200 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 ${
              statusFilter === "siap_registrasi"
                ? "border-amber-500 ring-2 ring-amber-500/50 bg-amber-50/20 dark:bg-amber-950/20"
                : "border-amber-200 dark:border-amber-800"
            }`}
          >
            <div className="p-3 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-lg shrink-0">
              <Lock size={24} />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wide">Menunggu Aktivasi</p>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400 drop-shadow-sm">{pendingCount}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === "nonaktif" ? "all" : "nonaktif")}
            className={`text-left bg-white dark:bg-gray-800 p-4 rounded-xl border-b-4 shadow-md flex items-center gap-4 transition-all duration-200 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 ${
              statusFilter === "nonaktif"
                ? "border-gray-500 ring-2 ring-gray-500/50 bg-gray-50/50 dark:bg-gray-700/50"
                : "border-gray-200 dark:border-gray-700"
            }`}
          >
            <div className="p-3 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-lg shrink-0">
              <Ban size={24} />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wide">Dinonaktifkan</p>
              <p className="text-2xl font-black text-gray-700 dark:text-gray-300 drop-shadow-sm">{disabledCount}</p>
            </div>
          </button>
        </div>

        {/* Sinkronisasi Info */}
        {pegawai.length - users.length > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 p-4 rounded-xl shadow-sm flex items-start gap-4">
            <div className="p-2 bg-blue-200/50 dark:bg-blue-900/50 rounded-lg shrink-0">
              <Activity size={20} className="text-blue-700 dark:text-blue-300" />
            </div>
            <div>
              <h4 className="font-extrabold text-sm mb-1 text-blue-900 dark:text-blue-200">
                Status Sinkronisasi: {pegawai.length - users.length} Pegawai Belum Memiliki Akun
              </h4>
              <p className="text-sm text-blue-900/80 dark:text-blue-300/80 leading-relaxed">
                Total pegawai aktif di sistem adalah <strong>{pegawai.length}</strong>, namun jumlah akun terdaftar baru <strong>{users.length}</strong>. 
                Terdapat <strong>{pegawai.length - users.length}</strong> pegawai yang belum dibuatkan akun karena data <strong>Email belum diisi atau formatnya tidak valid</strong> pada halaman Data ASN / PPPK. 
                Mohon lengkapi alamat email pegawai tersebut, lalu klik tombol <strong>Sinkronisasi</strong> agar sistem dapat membuatkan akun secara otomatis.
              </p>
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 bg-gray-50 dark:bg-gray-800/60 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase flex items-center gap-1">
            <Filter size={12} /> Filter
          </span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 font-medium text-gray-700 dark:text-gray-200 outline-none cursor-pointer"
          >
            <option value="all">Peran: Semua</option>
            <option value="admin">Peran: Admin</option>
            <option value="pimpinan">Peran: Pimpinan</option>
            <option value="pegawai">Peran: Pegawai</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 font-medium text-gray-700 dark:text-gray-200 outline-none cursor-pointer"
          >
            <option value="all">Status: Semua</option>
            <option value="aktif">Status: Aktif</option>
            <option value="siap_registrasi">Menunggu Aktivasi</option>
            <option value="nonaktif">Status: Dinonaktifkan</option>
          </select>
          <select
            value={pegawaiStatusFilter}
            onChange={(e) => setPegawaiStatusFilter(e.target.value)}
            className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 font-medium text-indigo-700 dark:text-indigo-300 outline-none cursor-pointer"
          >
            <option value="all">Pegawai: Semua</option>
            <option value="ASN">Pegawai: ASN</option>
            <option value="PPPK_PENUH_WAKTU">Pegawai: PPPK (Penuh Waktu)</option>
            <option value="PPPK_PARUH_WAKTU">Pegawai: PPPK (Paruh Waktu)</option>
          </select>
          <select
            value={jabatanFilter}
            onChange={(e) => setJabatanFilter(e.target.value)}
            className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 font-medium text-gray-700 dark:text-gray-200 outline-none cursor-pointer max-w-[150px] truncate"
          >
            <option value="all">Jabatan: Semua</option>
            {jabatans.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
          <select
            value={bidangFilter}
            onChange={(e) => setBidangFilter(e.target.value)}
            className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 font-medium text-gray-700 dark:text-gray-200 outline-none cursor-pointer max-w-[150px] truncate"
          >
            <option value="all">Bidang: Semua</option>
            {bidangs.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          {(roleFilter !== 'all' || statusFilter !== 'all' || pegawaiStatusFilter !== 'all' || jabatanFilter !== 'all' || bidangFilter !== 'all' || searchQuery !== '') && (
            <button 
              onClick={() => {
                setRoleFilter('all');
                setStatusFilter('all');
                setPegawaiStatusFilter('all');
                jabatanFilter !== 'all' && setJabatanFilter('all');
                setBidangFilter('all');
                setSearchQuery('');
              }}
              className="ml-auto text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-indigo-600 px-2 py-1 rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 flex items-center gap-1 transition-colors"
            >
              <X size={12}/> Reset Filter
            </button>
          )}
        </div>

        {/* Dense Data Grid */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden flex flex-col relative">
          <div className="grid grid-cols-1 gap-3 p-3 md:hidden">
            {filteredUsers.map((u: AccessUser) => (
              <article key={u.email} className="rounded-2xl border border-gray-200/80 dark:border-gray-700 bg-white/50 dark:bg-gray-800/40 p-4 shadow-sm min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 break-all">
                      {u.email || <span className="text-amber-500 italic font-normal">Email belum diisi</span>}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 truncate">{u.nama || "Nama belum ditautkan"}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${ROLE_BADGE[u.role] || ""}`}>
                    {ROLE_LABEL[u.role] || u.role}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400 break-all">NIP {u.nip || "—"}</span>
                  {(() => { const status = accountStatus(u); const StatusIcon = status.icon; return <span className={`inline-flex items-center gap-1 text-xs font-bold ${status.className}`}><StatusIcon size={14} /> {status.label}</span>; })()}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => openEdit(u)} className="min-h-11 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded-xl" title="Edit">
                    <Pencil size={15} /> Edit
                  </button>
                  {u.is_active ? (
                    <button onClick={() => handleDeactivate(u)} className="min-h-11 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-red-600 bg-red-50 dark:bg-red-900/30 rounded-xl" title="Nonaktifkan">
                      <Ban size={15} /> Nonaktifkan
                    </button>
                  ) : (
                    <button onClick={() => handleActivate(u)} className="min-h-11 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl" title="Aktifkan Kembali">
                      <CheckCircle size={15} /> Aktifkan
                    </button>
                  )}
                  {accountStatus(u).label === "Aktif" && u.email.toLowerCase() !== (user?.email || "").toLowerCase() && (
                    <button onClick={() => handleResetRegistration(u)} className="col-span-2 min-h-11 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded-xl" title="Reset registrasi dan password">
                      <RotateCcw size={15} /> Reset Registrasi
                    </button>
                  )}
                  {!u.is_active && u.email.toLowerCase() !== (user?.email || "").toLowerCase() && (
                    <button onClick={() => handleDelete(u)} className="col-span-2 min-h-11 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-xl" title="Hapus Akun Permanen">
                      <Trash2 size={15} /> Hapus Akun
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="hidden md:block overflow-auto max-h-[calc(100vh-22rem)]">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="sticky top-0 z-20 shadow-sm border-b-2 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">
                <tr className="bg-gray-100 dark:bg-gray-800 font-extrabold uppercase tracking-wider text-xs">
                  <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 w-12 text-center">No</th>
                  <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20">Pengguna</th>
                  <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20">Kontak</th>
                  <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20">Peran</th>
                  <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20">Status Akses</th>
                  <th className="px-4 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800 z-20 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredUsers.map((u: AccessUser, idx: number) => {
                  const emp = pegawai.find((p: any) => p.nip === u.nip);
                  const st = accountStatus(u);
                  const StatusIcon = st.icon;
                  return (
                    <tr key={u.email} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 group">
                      <td className="px-4 py-3 text-center text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-gray-900 dark:text-gray-100">{u.nama || "—"}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">{u.nip || "—"} • {emp ? employmentStatusLabel(emp) : ""}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-900 dark:text-gray-100 font-medium">{u.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-md ${ROLE_BADGE[u.role] || ""}`}>
                          {ROLE_LABEL[u.role] || u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon size={14} className={st.className} />
                          <span className={`font-semibold text-xs ${st.className}`}>{st.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(u)} className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded transition-colors" title="Edit"><Pencil size={14} /></button>
                          {accountStatus(u).label === "Aktif" && u.email.toLowerCase() !== (user?.email || "").toLowerCase() && (
                            <button onClick={() => handleResetRegistration(u)} className="p-1.5 text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded transition-colors" title="Reset Registrasi"><RotateCcw size={14}/></button>
                          )}
                          {u.is_active ? (
                            <button onClick={() => handleDeactivate(u)} className="p-1.5 text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors" title="Nonaktifkan"><Ban size={14} /></button>
                          ) : (
                            <>
                              <button onClick={() => handleActivate(u)} className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded transition-colors" title="Aktifkan Kembali"><CheckCircle size={14} /></button>
                              {u.email.toLowerCase() !== (user?.email || "").toLowerCase() && (
                                <button onClick={() => handleDelete(u)} className="p-1.5 text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors" title="Hapus Akun Permanen"><Trash2 size={14} /></button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400 font-medium">Data tidak ditemukan.</div>
            )}
          </div>
        </div>
      </div>

      {/* Modal form tambah/edit */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-gray-900 rounded-none sm:rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-200 dark:border-gray-800 flex flex-col max-h-[100dvh] sm:max-h-[90dvh]"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                <h2 className="font-bold text-lg text-gray-900 dark:text-white">
                  {isEdit ? "Edit Akun" : "Tambah Akun"}
                </h2>
                <button onClick={() => setIsFormOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto overscroll-contain">
                {error && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm flex items-start gap-2 border border-red-200">
                    <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {!isEdit && (
                  <div className="relative">
                    <label className={labelCls}>Nama Pegawai <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      autoComplete="off"
                      value={employeeQuery}
                      onFocus={() => setSuggestionsOpen(true)}
                      onChange={(e: any) => {
                        setEmployeeQuery(e.target.value);
                        setSuggestionsOpen(true);
                        setForm((current) => ({ ...current, nip: "", nama: "", email: "" }));
                        setError(null);
                      }}
                      placeholder="Ketik minimal 2 huruf nama pegawai..."
                      className={inputCls}
                    />
                    {suggestionsOpen && employeeQuery.trim().length >= 2 && (
                      <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl">
                        {candidateEmployees.length > 0 ? candidateEmployees.map((p) => (
                          <button
                            type="button"
                            key={p.nip}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectEmployee(p)}
                            className="w-full px-3 py-2.5 text-left hover:bg-blue-50 dark:hover:bg-blue-900/30 border-b last:border-b-0 border-gray-100 dark:border-gray-800"
                          >
                            <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">{p.nama}</span>
                            <span className="block text-xs text-gray-500">NIP {p.nip} · {employmentStatusLabel(p)} · {p.jabatan || "jabatan belum tersedia"} · {p.email || "email belum tersedia"}</span>
                          </button>
                        )) : (
                          <div className="px-3 py-3 text-xs text-gray-500">Nama tidak ditemukan atau pegawai sudah memiliki akun.</div>
                        )}
                      </div>
                    )}
                    <p className="text-[11px] text-gray-400 mt-1">Daftar hanya menampilkan pegawai aktif yang belum memiliki akun.</p>
                  </div>
                )}

                <div>
                  <label className={labelCls}><Mail size={12} className="inline mr-1" />Email untuk Registrasi</label>
                  <input
                    type="email"
                    value={form.email}
                    readOnly={isEdit && form.auth_status === "active"}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    placeholder="Masukkan email yang akan diverifikasi saat registrasi"
                    className={inputCls}
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    {isEdit && form.auth_status === "active" ? "Jalankan Reset Registrasi sebelum mengganti email akun aktif." : "Email ini akan dicocokkan saat user melakukan registrasi."}
                  </p>
                </div>

                <div>
                  <label className={labelCls}>Peran <span className="text-red-500">*</span></label>
                  <select
                    value={form.role}
                    onChange={(e: any) => setForm({ ...form, role: e.target.value })}
                    className={inputCls}
                  >
                    <option value="admin">Administrator — CRUD penuh, konfigurasi, dan kelola akun</option>
                    <option value="pimpinan">Pimpinan — kewenangan penuh setara Administrator</option>
                    <option value="pegawai">Pegawai — akses baca dan perubahan profil sendiri yang diizinkan</option>
                  </select>
                </div>

                <div>
                  <label className={labelCls}><IdCard size={12} className="inline mr-1" />NIP</label>
                  <input
                    type="text"
                    value={form.nip}
                    readOnly
                    placeholder="Terisi otomatis dari data pegawai"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className={labelCls}>Nama</label>
                  <input
                    type="text"
                    value={form.nama}
                    readOnly
                    placeholder="Terisi otomatis dari data pegawai"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className={labelCls}>Status Pegawai</label>
                  <input type="text" value={selectedEmployee ? employmentStatusLabel(selectedEmployee) : "-"} readOnly className={inputCls} />
                </div>

                <div>
                  <label className={labelCls}>Jabatan Pegawai</label>
                  <input type="text" value={selectedEmployee?.jabatan || "-"} readOnly placeholder="Terisi otomatis dari data pegawai" className={inputCls} />
                </div>

                {isEdit && <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e: any) => setForm({ ...form, is_active: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  Izinkan akses akun (user tetap harus menyelesaikan registrasi)
                </label>}
              </div>

              <div className="p-3 sm:p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex justify-end gap-3 safe-area-bottom">
                <button onClick={() => setIsFormOpen(false)} disabled={saving} className="flex-1 sm:flex-none min-h-11 px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                  Batal
                </button>
                <button onClick={handleSave} disabled={saving} className="flex-1 sm:flex-none min-h-11 flex items-center justify-center gap-2 px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-sm">
                  {saving ? <><RefreshCw size={16} className="animate-spin" /> Menyimpan...</> : <><Save size={16} /> Simpan</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
