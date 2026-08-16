import os
import json
from playwright.sync_api import sync_playwright

MOCK_USER = {
    "id": "22222222-2222-4222-8222-222222222222",
    "email": "admin@simosda.test",
    "app_metadata": {"role": "authenticated"},
    "user_metadata": {"name": "Admin Test"},
    "role": "authenticated",
    "aud": "authenticated",
    "phone": "",
}
MOCK_APP_ACCESS = [{"email": "admin@simosda.test", "role": "admin", "nip": "198001012000011001", "is_active": True, "nama": "Admin Test", "auth_status": "active", "registered_at": "2026-01-01T00:00:00.000Z"}]


def read_supabase_url():
    url = os.environ.get("VITE_SUPABASE_URL", "")
    if url:
        return url.rstrip("/")
    for candidate in (".env", ".env.production"):
        try:
            with open(candidate, "r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("VITE_SUPABASE_URL="):
                        return line.split("=", 1)[1].strip().rstrip("/")
        except OSError:
            continue
    return "https://mock-project.supabase.co"


def make_fake_session(supabase_url):
    import base64
    ref = supabase_url.split("//")[1].split(".")[0]
    def b64url(d):
        return base64.urlsafe_b64encode(d).rstrip(b"=").decode()
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = b64url(json.dumps({
        "iss": f"https://{ref}.supabase.co/auth/v1", "sub": MOCK_USER["id"],
        "aud": "authenticated", "exp": 2524608000, "iat": 1783200000,
        "email": MOCK_USER["email"], "role": "authenticated",
    }).encode())
    token = f"{header}.{payload}.mock"
    session = {
        "access_token": token, "token_type": "bearer", "expires_in": 3600,
        "expires_at": 2524608000, "refresh_token": "mock", "user": MOCK_USER,
    }
    return ref, json.dumps(session)


def main():
    supabase_url = read_supabase_url()
    ref, session_json = make_fake_session(supabase_url)
    storage_key = f"sb-{ref}-auth-token"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.add_init_script(f"localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)});")

        def handle_route(route):
            url = route.request.url
            method = route.request.method
            if "/auth/v1/user" in url:
                route.fulfill(status=200, json=MOCK_USER)
                return
            if "/auth/v1/token" in url:
                route.fulfill(status=200, json={"access_token": "mock", "token_type": "bearer", "expires_in": 3600, "expires_at": 2524608000, "refresh_token": "mock", "user": MOCK_USER})
                return
            if "/rest/v1/" in url:
                if method in ("POST", "PATCH", "DELETE"):
                    route.fulfill(status=201, json=[{}])
                    return
                if "/app_access" in url:
                    accept = route.request.headers.get("accept", "")
                    if "vnd.pgrst.object" in accept:
                        route.fulfill(status=200, json=MOCK_APP_ACCESS[0])
                    else:
                        route.fulfill(status=200, json=MOCK_APP_ACCESS)
                    return
                route.fulfill(status=200, json=[])
                return
            route.continue_()

        page.route("**/*", handle_route)
        page.goto("http://localhost:3000/", wait_until="domcontentloaded", timeout=20000)
        page.wait_for_selector("body", timeout=15000)

        result = page.evaluate("""
        async () => {
          const { apiService } = await import('/src/services/apiService.ts');
          const { dataService } = await import('/src/services/dataService.ts');

          const CACHE_KEY = 'supabase_v2_backend_pegawai';
          const seed = { timestamp: Date.now(), data: [{ nip: 'OLD-NIP', nama: 'Data Lama' }] };

          // 1. Tabur cache palsu (seolah-olah data lama masih tersimpan)
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(seed));
          const before = sessionStorage.getItem(CACHE_KEY) !== null;

          // 2. Simulasikan tambah pegawai baru via apiService (write + notifyMutation)
          await apiService.savePegawai({
            nip: '199999999999999999', nama: 'PEGAWAI BARU', email: 'baru@simosda.test'
          }, true);

          // 3. Verifikasi data basi 'OLD-NIP' tidak lagi ada
          const rawAfter = sessionStorage.getItem(CACHE_KEY);
          const afterData = rawAfter ? JSON.parse(rawAfter).data : [];
          const hasStaleData = Array.isArray(afterData) && afterData.some(d => d.nip === 'OLD-NIP');

          // 4. getPegawai() harus mem-fetch data segar (bukan cache lama)
          const rows = await dataService.getPegawai();
          const gotFresh = Array.isArray(rows) && !rows.some(d => d.nip === 'OLD-NIP');

          return { before, hasStaleData, gotFresh };
        }
        """)

        print("Hasil test sinkronisasi cache:")
        print("  1. Cache terisi data lama sebelum write :", result["before"])
        print("  2. Data lama terhapus setelah write     :", not result["hasStaleData"])
        print("  3. getPegawai mem-fetch data segar      :", result["gotFresh"])

        passed = result["before"] and not result["hasStaleData"] and result["gotFresh"]
        assert passed, f"FAIL: {result}"
        print("RESULT: ALL PASS — sinkronisasi realtime berfungsi")
        browser.close()


if __name__ == "__main__":
    main()
