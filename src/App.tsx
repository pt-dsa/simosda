import React, { Suspense, lazy, useContext } from "react";
import { HashRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, AppShell, AuthContext } from "@/components/layout/AppShell";
import { canViewMenu, type MenuKey } from "@/lib/rbac";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { LoadingState } from "@/components/ui/LoadingState";
import { PWAPrompt } from "@/components/layout/PWAPrompt";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

// Login dimuat eager (paint pertama untuk pengguna belum login — tanpa kedip Suspense).
import Login from "@/pages/Login";

// Halaman terproteksi dimuat lazy (code-splitting). Pustaka berat ikut terpisah:
// recharts → chunk Dashboard, leaflet/react-leaflet → chunk PetaSebaran, qrcode.react → chunk masing-masing.
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const PegawaiPage = lazy(() => import("@/pages/Pegawai"));
const BukuPenjagaan = lazy(() => import("@/pages/BukuPenjagaan"));
const Kendaraan = lazy(() => import("@/pages/Kendaraan"));
const Inventaris = lazy(() => import("@/pages/Inventaris"));
const AlatMesin = lazy(() => import("@/pages/AlatMesin"));
const PaguAnggaran = lazy(() => import("@/pages/PaguAnggaran"));
const PemeliharaanKendaraan = lazy(() => import("@/pages/PemeliharaanKendaraan"));
const Peminjaman = lazy(() => import("@/pages/Peminjaman"));
const PetaSebaran = lazy(() => import("@/pages/PetaSebaran"));
const Laporan = lazy(() => import("@/pages/Laporan"));
const KelolaAkun = lazy(() => import("@/pages/KelolaAkun"));
const Cleansing = lazy(() => import("@/pages/Cleansing"));
const TanyaSimosda = lazy(() => import("@/pages/TanyaSimosda"));

// Penjaga route per-peran: menolak akses via URL langsung bila peran tak berhak.
// (Sidebar sudah menyembunyikan menunya; ini lapis kedua untuk URL manual.)
function MenuGuard({ menu, children }: { menu: MenuKey; children: React.ReactNode }) {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;
  if (!canViewMenu(user.role, menu)) {
    return <Navigate to={user.role === "pegawai" ? "/pegawai" : "/dashboard"} replace />;
  }
  return <>{children}</>;
}

function GuardedPage({ menu, children }: { menu: MenuKey; children: React.ReactNode }) {
  return <MenuGuard menu={menu}>{children}</MenuGuard>;
}

function ProtectedLayout() {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      {/* Fallback Suspense WAJIB pakai LoadingState (anti layar putih).
          Berada DI DALAM AppShell → sidebar & topbar tetap tampil saat halaman dimuat.
          ErrorBoundary menangkap runtime error di level halaman agar tidak crash ke layar putih. */}
      <ErrorBoundary context="halaman ini">
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <ToastProvider>
        <AuthProvider>
          <HashRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />

              <Route element={<ProtectedLayout />}>
                <Route path="/dashboard" element={<GuardedPage menu="dashboard"><Dashboard /></GuardedPage>} />
                <Route path="/pegawai" element={<GuardedPage menu="pegawai"><PegawaiPage /></GuardedPage>} />
                <Route path="/buku-penjagaan" element={<GuardedPage menu="buku-penjagaan"><BukuPenjagaan /></GuardedPage>} />
                <Route path="/kendaraan" element={<GuardedPage menu="kendaraan"><Kendaraan /></GuardedPage>} />
                <Route path="/inventaris" element={<GuardedPage menu="inventaris"><Inventaris /></GuardedPage>} />
                <Route path="/alat-mesin" element={<GuardedPage menu="alat-mesin"><AlatMesin /></GuardedPage>} />
                <Route path="/pagu" element={<GuardedPage menu="pagu"><PaguAnggaran /></GuardedPage>} />
                <Route path="/pemeliharaan-kendaraan" element={<GuardedPage menu="pemeliharaan-kendaraan"><PemeliharaanKendaraan /></GuardedPage>} />
                <Route path="/peminjaman" element={<GuardedPage menu="peminjaman"><Peminjaman /></GuardedPage>} />
                <Route path="/peta" element={<GuardedPage menu="peta"><PetaSebaran /></GuardedPage>} />
                <Route path="/laporan" element={<GuardedPage menu="laporan"><Laporan /></GuardedPage>} />
                <Route path="/tanya" element={<GuardedPage menu="tanya"><TanyaSimosda /></GuardedPage>} />
                <Route
                  path="/kelola-akun"
                  element={
                    <MenuGuard menu="kelola-akun">
                      <KelolaAkun />
                    </MenuGuard>
                  }
                />
                <Route
                  path="/cleansing"
                  element={
                    <MenuGuard menu="cleansing">
                      <Cleansing />
                    </MenuGuard>
                  }
                />
                </Route>
            </Routes>
          </HashRouter>
        </AuthProvider>
      </ToastProvider>
      <PWAPrompt />
    </ThemeProvider>
  );
}
