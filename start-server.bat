@echo off
setlocal enabledelayedexpansion
title SIMOSDA - Localhost Manager
color 0B

:: Cek argument yang masuk (untuk dieksekusi via VBScript secara background)
if /i "%~1"=="dev" goto dev
if /i "%~1"=="prod" goto prod
if /i "%~1"=="install" goto install

:menu
cls
echo ========================================================
echo        SIMOSDA - ADVANCED LOCALHOST MANAGER
echo ========================================================
echo.
echo Pilihan Mode:
echo 1. Start Development Server (Fast, Auto-Reload / HMR)
echo 2. Build ^& Start Production Server (Optimized)
echo 3. Update / Install Dependencies (npm install)
echo 4. Exit
echo.
echo * Catatan: Gunakan Opsi 1 untuk masa pengembangan (Revisi).
echo            Gunakan Opsi 2 untuk simulasi final production.
echo.
set /p choice="Pilih menu (1-4): "

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto prod
if "%choice%"=="3" goto install
if "%choice%"=="4" goto end
goto menu

:dev
cls
echo ========================================================
echo Memulai SIMOSDA Vite Development Server...
echo Hot Module Replacement (HMR) AKTIF.
echo Setiap perubahan koding akan otomatis refresh di browser!
echo ========================================================
:dev_loop
echo Membersihkan port 3000 dari server lama yang masih nyangkut...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":3000 " ^| find "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
cd /d "%~dp0"
call npm run dev
echo.
echo [WARNING] Server Vite terhenti. Memulai ulang secara otomatis dalam 2 detik...
timeout /t 2 >nul
goto dev_loop

:prod
cls
echo ========================================================
echo Membangun Aplikasi SIMOSDA (Production Build)...
echo Mohon tunggu, proses ini membutuhkan beberapa waktu.
echo ========================================================
echo Membersihkan port 3000 dari server lama yang masih nyangkut...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":3000 " ^| find "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
cd /d "%~dp0"
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build gagal! Silakan periksa kodingan Anda.
    if "%~1"=="" pause
    goto end
)
echo.
echo ========================================================
echo Memulai SIMOSDA Production Server...
echo Aplikasi berjalan di http://localhost:3000
echo ========================================================
call npm run serve
if "%~1"=="" pause
goto end

:install
cls
echo ========================================================
echo Mengunduh dan Memperbarui Dependencies (NPM)...
echo ========================================================
cd /d "%~dp0"
call npm install
echo.
echo Update selesai!
if "%~1"=="" pause
goto menu

:end
exit
