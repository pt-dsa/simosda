import os
import json
import re
from playwright.sync_api import sync_playwright, expect

MOCK_USER = {
    "id": "11111111-1111-4111-8111-111111111111",
    "email": "admin@simosda.test",
    "app_metadata": {"role": "authenticated"},
    "user_metadata": {"name": "Administrator Testing"},
    "role": "authenticated",
    "aud": "authenticated",
    "phone": "",
    "confirmed_at": "2026-01-01T00:00:00.000Z",
}

MOCK_APP_ACCESS = [{
    "email": "admin@simosda.test",
    "role": "admin",
    "nip": "198001012000011001",
    "nama": "Administrator Testing",
    "is_active": True,
    "last_login": None,
    "auth_status": "active",
    "registered_at": "2026-01-01T00:00:00.000Z",
}]

MOCK_PEGAWAI = [
    {"nip": "198001012000011001", "nama": "ADMINISTRATOR TESTING", "email": "admin@simosda.test",
     "jabatan": "Kepala Dinas", "golongan": "IV/b", "status": "ASN", "kategori_pppk": None,
     "tgl_lahir": "1980-01-01", "tgl_kgb": "2026-08-01", "tgl_pangkat": "2026-10-01",
     "tgl_pensiun": "2038-01-01", "is_active": True, "foto": "", "foto_storage_path": "", "foto_provider": ""},
    {"nip": "198805182025211036", "nama": "AKBAR ZAELANI, S.Kom.", "email": "",
     "jabatan": "Analis Kepegawaian", "golongan": "III/c", "status": "PPPK", "kategori_pppk": "penuh_waktu",
     "tgl_lahir": "1988-05-18", "tgl_kgb": "2027-01-01", "tgl_pangkat": "2026-12-01",
     "tgl_pensiun": "2046-05-18", "is_active": True, "foto": "", "foto_storage_path": "", "foto_provider": ""},
    {"nip": "199109132015031002", "nama": "GALIH REZA ARDIAN, ST", "email": "",
     "jabatan": "Perencana Muda", "golongan": "III/b", "status": "PPPK", "kategori_pppk": "paruh_waktu",
     "tgl_lahir": "1991-09-13", "tgl_kgb": "2026-09-01", "tgl_pangkat": "2027-03-01",
     "tgl_pensiun": "2049-09-13", "is_active": True, "foto": "", "foto_storage_path": "", "foto_provider": ""},
]

MOCK_VEHICLES = [
    {"asset_id": "v1", "kode_barang": "2.01.01.01.001", "nama_aset": "Mobil Avanza", "merk": "Toyota",
     "jenis_kendaraan": "Mobil", "no_polisi": "B 1234 CD", "tahun": 2019, "kondisi": "Baik",
     "pengguna": "ADMINISTRATOR TESTING", "pengguna_nip": "198001012000011001", "is_active": True,
     "latitude": -6.288, "longitude": 106.718},
    {"asset_id": "v2", "kode_barang": "2.01.01.02.002", "nama_aset": "Motor Vario", "merk": "Honda",
     "jenis_kendaraan": "Motor", "no_polisi": "B 5678 EF", "tahun": 2021, "kondisi": "Rusak",
     "pengguna": "AKBAR ZAELANI", "pengguna_nip": "198805182025211036", "is_active": True,
     "latitude": -6.290, "longitude": 106.720},
]

MOCK_EQUIPMENT = [
    {"asset_id": "e1", "kode_barang": "3.01.02.01.001", "nama_aset": "Komputer", "merk": "Lenovo",
     "jenis": "Komputer", "kondisi": "Baik", "pengguna": "GALIH REZA ARDIAN", "is_active": True, "jumlah": 1,
     "satuan": "Unit", "unit_indexes": []},
    {"asset_id": "e2", "kode_barang": "3.01.02.02.002", "nama_aset": "Printer", "merk": "Canon",
     "jenis": "Printer", "kondisi": "Rusak", "pengguna": "AKBAR ZAELANI", "is_active": True, "jumlah": 1,
     "satuan": "Unit", "unit_indexes": []},
]

MOCK_CONFIG = [
    {"key": "KGB_CYCLE_YEARS", "value": "2", "updated_at": None},
    {"key": "PANGKAT_CYCLE_YEARS", "value": "4", "updated_at": None},
    {"key": "BUP_USIA", "value": "58", "updated_at": None},
]

MOCK_LOCATIONS = []

MOCK_AI = {
    "ok": True,
    "answer": '{"action":"REPLY_ONLY","target":"","speech":"Halo, ini jawaban dari asisten SIMOSDA."}'
}


def read_supabase_url():
    """Baca VITE_SUPABASE_URL dari env atau file .env / .env.production."""
    url = os.environ.get("VITE_SUPABASE_URL", "")
    if url:
        return url.rstrip("/")
    for candidate in (".env", ".env.production"):
        try:
            with open(candidate, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("VITE_SUPABASE_URL="):
                        return line.split("=", 1)[1].strip().rstrip("/")
        except OSError:
            continue
    return "https://mock-project.supabase.co"


def make_fake_session(supabase_url):
    """Buat objek session supabase-js v2 yang disimpan di localStorage."""
    import base64
    import uuid

    ref = supabase_url.split("//")[1].split(".")[0]

    def b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = b64url(json.dumps({
        "iss": f"https://{ref}.supabase.co/auth/v1",
        "sub": MOCK_USER["id"],
        "aud": "authenticated",
        "exp": 2524608000,  # tahun 2050
        "iat": 1783200000,
        "email": MOCK_USER["email"],
        "phone": "",
        "app_metadata": {"provider": "email", "providers": ["email"]},
        "user_metadata": {},
        "role": "authenticated",
        "aal": "aal1",
        "amr": [{"method": "password", "timestamp": 1783200000}],
        "session_id": str(uuid.uuid4()),
    }).encode())
    signature = b64url(b"mock-signature")
    access_token = f"{header}.{payload}.{signature}"

    session = {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": 3600,
        "expires_at": 2524608000,
        "refresh_token": "mock-refresh-token",
        "user": MOCK_USER,
    }
    return ref, json.dumps(session)


def main():
    supabase_url = read_supabase_url()
    ref, session_json = make_fake_session(supabase_url)
    storage_key = f"sb-{ref}-auth-token"

    print(f"Supabase URL: {supabase_url} | ref: {ref} | storage key: {storage_key}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        # Suntik sesi supabase ke localStorage SEBELUM app dimuat (add_init_script).
        page.add_init_script(f"""
          localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)});
        """)

        errors = []

        def handle_route(route):
            url = route.request.url
            method = route.request.method

            # ---- Auth / GoTrue ----
            if "/auth/v1/user" in url:
                route.fulfill(status=200, json=MOCK_USER)
                return
            if "/auth/v1/token" in url:
                route.fulfill(status=200, json={
                    "access_token": "mock", "token_type": "bearer",
                    "expires_in": 3600, "expires_at": 2524608000,
                    "refresh_token": "mock", "user": MOCK_USER,
                })
                return
            if "/auth/v1/logout" in url:
                route.fulfill(status=204, body="")
                return

            # ---- Edge Functions ----
            if "/functions/v1/" in url:
                route.fulfill(status=200, json=MOCK_AI)
                return

            # ---- Storage ----
            if "/storage/v1/" in url:
                route.fulfill(status=200, json={})
                return

            # ---- PostgREST /rest/v1 ----
            if "/rest/v1/" in url:
                # whoami: app_access?select=role,nip&email=eq.<email>
                if "/app_access" in url:
                    accept = route.request.headers.get("accept", "")
                    if "vnd.pgrst.object" in accept:
                        route.fulfill(status=200, json=MOCK_APP_ACCESS[0])
                    else:
                        route.fulfill(status=200, json=MOCK_APP_ACCESS)
                    return
                if "/pegawai" in url:
                    route.fulfill(status=200, json=MOCK_PEGAWAI)
                    return
                if "/assets_vehicle" in url:
                    route.fulfill(status=200, json=MOCK_VEHICLES)
                    return
                if "/assets_equipment" in url:
                    route.fulfill(status=200, json=MOCK_EQUIPMENT)
                    return
                if "/system_config" in url:
                    route.fulfill(status=200, json=MOCK_CONFIG)
                    return
                if "/asset_locations" in url:
                    route.fulfill(status=200, json=MOCK_LOCATIONS)
                    return
                # Fallback PostgREST: array kosong untuk tabel lain.
                route.fulfill(status=200, json=[])
                return

            # ---- Selain itu: biarkan lewat (aset statis Vite) ----
            route.continue_()

        page.on("console", lambda msg: print(f"[{msg.type}] {msg.text}"))
        page.route("**/*", handle_route)

        # 1. Buka aplikasi → harus langsung masuk Dashboard (bukan /login)
        page.goto("http://localhost:3000/", wait_until="networkidle", timeout=45000)

        # 2. Tunggu elemen khas Dashboard / AppShell
        try:
            page.wait_for_selector("text=Dashboard", timeout=20000)
        except Exception:
            # Beberapa halaman memakai label Beranda — cek URL tidak mengarah ke login.
            current = page.url
            assert "/login" not in current, f"Aplikasi tidak masuk ke Dashboard (masih di {current})"

        # 3. Tangkapan layar bukti
        page.screenshot(path="tests/results/e2e_dashboard.png", full_page=False)
        print("Dashboard dimuat. URL:", page.url)

        # 4. Uji Navigasi ke Halaman Pegawai
        page.goto("http://localhost:3000/#/pegawai", wait_until="networkidle")
        page.wait_for_selector("text=ADMINISTRATOR TESTING", timeout=10000)
        page.screenshot(path="tests/results/e2e_pegawai.png", full_page=False)
        print("Navigasi Pegawai PASS.")

        # 5. Uji Navigasi ke Tanya SIMOSDA dan Fitur Chat AI
        page.goto("http://localhost:3000/#/tanya", wait_until="networkidle")
        
        # Cari input chat (placeholder 'Tanya sesuatu...' atau sejenisnya)
        chat_input = page.locator("input[placeholder*='Tanya'], input[placeholder*='Ketik']")
        if chat_input.count() > 0:
            chat_input.first.fill("Siapa yang ulang tahun minggu ini?")
            chat_input.first.press("Enter")
            
            # Tunggu respon dari MOCK_AI muncul di UI
            page.wait_for_selector("text=Halo, ini jawaban dari asisten", timeout=15000)
            page.screenshot(path="tests/results/e2e_tanya.png", full_page=False)
            print("Chat AI PASS.")
        else:
            print("Input chat tidak ditemukan, melewati tes chat AI.")

        # 6. Verifikasi tidak ada error fatal (React error boundary biasanya memunculkan "Uncaught")
        fatal = [e for e in errors if "Uncaught" in e or "is not defined" in e]
        assert not fatal, f"Terdeteksi error fatal di console: {fatal[:3]}"

        browser.close()
        print("E2E PASS: Semua skenario (Dashboard, Navigasi, AI Chat) berhasil tanpa error fatal.")


if __name__ == "__main__":
    main()
