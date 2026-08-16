import { supabase, PHOTO_BUCKET } from "@/lib/supabaseClient";
import type { Pegawai } from "@/types";

// ── Mutation Observer ────────────────────────────────────────────────────────
// Setiap write operasi memanggil notifyMutation() agar dataService
// otomatis menghapus cache sessionStorage yang terpengaruh.
type MutationListener = (tables: string[]) => void;
const _mutationListeners: MutationListener[] = [];
export function onDataMutation(listener: MutationListener): () => void {
  _mutationListeners.push(listener);
  return () => { const i = _mutationListeners.indexOf(listener); if (i >= 0) _mutationListeners.splice(i, 1); };
}
function notifyMutation(tables: string[]) {
  for (const l of _mutationListeners) {
    try { l(tables); } catch (e) { console.error("[apiService] mutation listener error:", e); }
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

// Auto-sync: saat pegawai dengan email valid disimpan atau diedit, otomatis sinkronkan akun
// app_access (role pegawai) agar langsung terlihat dan dapat dikelola di Kelola Akun.
async function autoSeedAccessFromPegawai(p: Partial<Pegawai>): Promise<void> {
  const nip = String(p.nip || "").trim();
  const email = String(p.email || "").trim().toLowerCase();
  const nama = String(p.nama || "").trim();
  if (!nip || !email.includes('@') || String(p.is_active) === "false") return;

  try {
    // 1. Cek apakah ada record berdasarkan NIP
    const { data: existingByNip } = await supabase
      .from('app_access')
      .select('email, nip, nama, role, is_active')
      .eq('nip', nip)
      .maybeSingle();

    if (existingByNip) {
      // Jika sudah ada tapi email atau nama berbeda / tidak aktif, perbarui
      if (existingByNip.email.toLowerCase() !== email || (nama && existingByNip.nama !== nama) || !existingByNip.is_active) {
        if (!existingByNip.is_active) {
          // Re-aktivasi pegawai yang sebelumnya nonaktif -> siapkan untuk registrasi baru
          await supabase.rpc('simosda_activate_user', { target_email: email, target_role: existingByNip.role || 'pegawai' });
        }
        await supabase
          .from('app_access')
          .update({
            email,
            nama: nama || email,
            is_active: true,
          })
          .eq('nip', nip);
        notifyMutation(["app_access"]);
      }
      return;
    }

    // 2. Cek apakah ada record berdasarkan Email
    const { data: existingByEmail } = await supabase
      .from('app_access')
      .select('email, nip, nama, role, is_active')
      .eq('email', email)
      .maybeSingle();

    if (existingByEmail) {
      if (!existingByEmail.is_active) {
        await supabase.rpc('simosda_activate_user', { target_email: email, target_role: existingByEmail.role || 'pegawai' });
      }
      // Tautkan NIP dan perbarui nama
      await supabase
        .from('app_access')
        .update({
          nip,
          nama: nama || existingByEmail.nama || email,
          is_active: true,
        })
        .eq('email', email);
      notifyMutation(["app_access"]);
      return;
    }

    // 3. Jika belum ada sama sekali, buat baru dengan status Menunggu Aktivasi
    const { error: insError } = await supabase.from('app_access').insert({
      email,
      nip,
      nama: nama || email,
      role: 'pegawai',
      is_active: true,
      auth_status: 'ready',
      registered_at: null,
      auth_user_id: null,
    });
    if (insError) throw insError;
    notifyMutation(["app_access"]);
  } catch (e) {
    // Auto-sync tidak boleh menggagalkan penyimpanan pegawai.
    console.error("[apiService] auto-seed app_access gagal:", e);
  }
}

export interface UploadFotoResult { ok: true; fileId: string; url: string; viewUrl: string; storagePath?: string; provider?: "supabase"; }
export interface NotificationAgendaItem {
  nip: string; nama: string; jabatan: string; kategori: "KGB" | "PANGKAT" | "BUP";
  kategoriLabel: string; tanggal: string; selisihHari: number;
}
export interface NotificationFeed {
  ok: true; generated_at: string;
  birthdays: Array<{ nip: string; nama: string; jabatan: string; tanggal: string; daysUntil: number }>;
  overdue: NotificationAgendaItem[]; kgb: NotificationAgendaItem[]; pangkat: NotificationAgendaItem[]; bup: NotificationAgendaItem[];
}

// Tipe akses tetap di-re-export dari accessService agar kontrak lama tidak berubah.
export type { WhoamiResult, AccessUser } from "./accessService";

export const apiService = {
  ping: async () => { return { ok: true as const }; },

  whoami: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak ditemukan. Silakan masuk kembali.");

    const { data: access, error } = await supabase
      .from('app_access')
      .select('role, nip, is_active, auth_status, registered_at')
      .eq('email', user.email)
      .single();

    if (error || !access) {
      await supabase.auth.signOut();
      throw new Error("Akun Anda belum terdaftar di SIMOSDA.");
    }

    if (!access.is_active || access.auth_status === 'disabled') {
      await supabase.auth.signOut();
      throw new Error("Akun Anda telah dinonaktifkan oleh Administrator.");
    }

    if (access.auth_status === 'ready' || !access.registered_at) {
      await supabase.auth.signOut();
      throw new Error("Akun Anda belum menyelesaikan registrasi. Silakan klik tab 'Registrasi' untuk membuat password Anda.");
    }

    let nama = user.user_metadata?.nama || "Pengguna";
    let foto = "";

    const { data: pegawai } = await supabase
      .from('pegawai')
      .select('nama, foto')
      .eq('nip', access.nip)
      .maybeSingle();

    if (pegawai) {
      nama = pegawai.nama || nama;
      foto = pegawai.foto || foto;
    }

    // Pastikan status akun tersinkronisasi sebagai active dan last_login tercatat
    if (user.email) {
      Promise.resolve(
        supabase
          .from('app_access')
          .update({
            auth_status: 'active',
            auth_user_id: user.id,
            last_login: new Date().toISOString(),
          })
          .eq('email', user.email)
      ).then(() => notifyMutation(["app_access"])).catch(() => {});
    }

    return {
      ok: true as const,
      email: user.email!,
      role: access.role as "admin" | "pimpinan" | "pegawai",
      nip: access.nip,
      nama: nama,
      foto: foto,
      photoNip: access.nip
    };
  },

  savePegawai: async (data: Partial<Pegawai>, isNew: boolean) => {
    if (isNew) {
      const { error } = await supabase.from('pegawai').insert(data);
      if (error) throw error;
      notifyMutation(["pegawai"]);
      // Auto-sync: pegawai baru dengan email valid otomatis mendapat akun
      // (status MENUNGGU AKTIVASI) agar langsung terlihat di Kelola Akun.
      await autoSeedAccessFromPegawai(data);
      return { ok: true as const, mode: 'insert', nip: data.nip };
    } else {
      const { error } = await supabase.from('pegawai').update(data).eq('nip', data.nip);
      if (error) throw error;
      notifyMutation(["pegawai"]);
      // Sinkronisasi otomatis ke app_access jika email diisi/diubah saat edit
      await autoSeedAccessFromPegawai(data);
      return { ok: true as const, mode: 'update', nip: data.nip };
    }
  },

  deletePegawai: async (nip: string, options?: { hard?: boolean }) => {
    if (options?.hard) {
      const { error } = await supabase.from('pegawai').delete().eq('nip', nip);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('pegawai').update({ is_active: false }).eq('nip', nip);
      if (error) throw error;
    }
    notifyMutation(["pegawai"]);
    return { ok: true as const, nip };
  },

  saveAsset: async (table: "assets_vehicle" | "assets_equipment", data: Record<string, any>, isNew: boolean) => {
    if (isNew) {
      const { error } = await supabase.from(table).insert(data);
      if (error) throw error;
      notifyMutation([table]);
      return { ok: true as const, mode: 'insert', asset_id: data.asset_id };
    } else {
      const { error } = await supabase.from(table).update(data).eq('asset_id', data.asset_id);
      if (error) throw error;
      notifyMutation([table]);
      return { ok: true as const, mode: 'update', asset_id: data.asset_id };
    }
  },

  deleteAsset: async (table: "assets_vehicle" | "assets_equipment", assetId: string) => {
    const { error } = await supabase.from(table).delete().eq('asset_id', assetId);
    if (error) throw error;
    notifyMutation([table]);
    return { ok: true as const, asset_id: assetId };
  },

  uploadFoto: async (params: { nip: string; base64: string; mimeType: string; fileName: string }) => {
    const blob = base64ToBlob(params.base64, params.mimeType);
    const path = `pegawai/${params.nip}/${Date.now()}-${params.fileName}`;
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: params.mimeType });
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);

    if (params.nip) {
      await supabase.from('pegawai').update({
        foto: publicUrl,
        foto_storage_path: path,
        foto_provider: 'supabase',
      }).eq('nip', params.nip);
      notifyMutation(["pegawai"]);
    }

    return { ok: true as const, fileId: path, url: publicUrl, viewUrl: publicUrl, storagePath: path, provider: "supabase" as const };
  },

  uploadAssetFoto: async (params: {
    table: "assets_vehicle" | "assets_equipment";
    assetId: string;
    holderName?: string;
    base64: string;
    mimeType: string;
    fileName: string;
  }) => {
    const blob = base64ToBlob(params.base64, params.mimeType);
    const path = `${params.assetId}/${Date.now()}-${params.fileName}`;
    const { data, error } = await supabase.storage.from('asset-photos').upload(path, blob, { contentType: params.mimeType });
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage.from('asset-photos').getPublicUrl(path);

    if (params.assetId && (params.table === "assets_vehicle" || params.table === "assets_equipment")) {
      await supabase.from(params.table).update({
        foto: publicUrl,
        foto_storage_path: path,
        foto_provider: 'supabase',
      }).eq('asset_id', params.assetId);
      notifyMutation([params.table]);
    }

    return { ok: true as const, fileId: path, url: publicUrl, viewUrl: publicUrl, storagePath: path, provider: "supabase" as const };
  },

  importEquipment: async (records: Record<string, any>[], batchId?: string) => {
    if (!records || records.length === 0) {
      return { ok: true as const, received: 0, inserted: 0, skipped: 0, asset_ids: [] };
    }

    const currentYear = new Date().getFullYear();
    const insertedIds: string[] = [];
    const payload = records.map((record, index) => {
      const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
      const asset_id = record.asset_id || `AST-EQ-${currentYear}-${String(index + 1).padStart(4, "0")}-${randomSuffix}`;
      insertedIds.push(asset_id);

      return {
        asset_id,
        kode_barang: record.kode_barang || null,
        nama_aset: record.nama_aset || null,
        merk: record.merk || null,
        spesifikasi: record.spesifikasi || null,
        jenis: record.jenis || "Peralatan & Mesin",
        jumlah: Number(record.jumlah) || 1,
        satuan: record.satuan || "Unit",
        tahun: record.tahun || null,
        pengguna: record.pengguna || null,
        pengguna_nip: record.pengguna_nip || null,
        pengguna_raw: record.pengguna_raw || record.pengguna || null,
        pengguna_match_status: record.pengguna_nip ? "matched" : "unmatched",
        penanggung_jawab: record.penanggung_jawab || null,
        penanggung_jawab_nip: record.penanggung_jawab_nip || null,
        lokasi: record.lokasi || null,
        bidang: record.bidang || null,
        kondisi: record.kondisi ? String(record.kondisi).toUpperCase() : null,
        harga_pembelian: record.harga_pembelian ?? null,
        kib_index: record.kib_index || null,
        unit_indexes: Array.isArray(record.unit_indexes) ? record.unit_indexes : [],
        register_barang: record.register_barang || null,
        mutasi: record.mutasi || null,
        opd: record.opd || null,
        dokumentasi: Array.isArray(record.dokumentasi) ? record.dokumentasi : [],
      };
    });

    const BATCH_SIZE = 50;
    let inserted = 0;
    for (let i = 0; i < payload.length; i += BATCH_SIZE) {
      const chunk = payload.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('assets_equipment').insert(chunk);
      if (error) throw error;
      inserted += chunk.length;
    }

    notifyMutation(["assets_equipment"]);
    return {
      ok: true as const,
      received: records.length,
      inserted,
      skipped: 0,
      asset_ids: insertedIds,
    };
  },

  uploadEquipmentAttachment: async (params: {
    assetId: string; base64: string; mimeType: string; fileName: string;
  }) => {
    const blob = base64ToBlob(params.base64, params.mimeType);
    const path = `${params.assetId}/${Date.now()}-${params.fileName}`;
    const { data, error } = await supabase.storage.from('asset-attachments').upload(path, blob, { contentType: params.mimeType });
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage.from('asset-attachments').getPublicUrl(path);
    const newAttachment = { url: publicUrl, path, mime_type: params.mimeType, name: params.fileName, created_at: new Date().toISOString() };

    try {
      const { data: existing } = await supabase.from('assets_equipment').select('dokumentasi').eq('asset_id', params.assetId).maybeSingle();
      if (existing) {
        const currentDocs = Array.isArray(existing.dokumentasi) ? existing.dokumentasi : [];
        const updatedDocs = [...currentDocs, newAttachment];
        await supabase.from('assets_equipment').update({ dokumentasi: updatedDocs }).eq('asset_id', params.assetId);
        notifyMutation(["assets_equipment"]);
      }
    } catch (dbErr) {
      console.warn("[uploadEquipmentAttachment] Failed to sync dokumentasi column:", dbErr);
    }

    return { ok: true as const, attachment: newAttachment };
  },

  deleteEquipmentAttachment: async (assetId: string, attachmentPathOrUrl: string) => {
    const path = attachmentPathOrUrl.includes('/') ? attachmentPathOrUrl.split('asset-attachments/').pop() || attachmentPathOrUrl : attachmentPathOrUrl;
    const { error } = await supabase.storage.from('asset-attachments').remove([path]);
    if (error) throw error;

    try {
      const { data: existing } = await supabase.from('assets_equipment').select('dokumentasi').eq('asset_id', assetId).maybeSingle();
      if (existing && Array.isArray(existing.dokumentasi)) {
        const updatedDocs = existing.dokumentasi.filter((doc: any) => doc?.path !== path && doc?.url !== attachmentPathOrUrl);
        await supabase.from('assets_equipment').update({ dokumentasi: updatedDocs }).eq('asset_id', assetId);
        notifyMutation(["assets_equipment"]);
      }
    } catch (dbErr) {
      console.warn("[deleteEquipmentAttachment] Failed to sync dokumentasi column:", dbErr);
    }

    return { ok: true as const };
  },

  // Aset: tautkan pengguna ke identitas resmi pegawai (NIP adalah kunci utama).
  linkAssetEmployee: async (table: string, assetId: string, employeeNip: string) => {
    if (table !== "assets_vehicle" && table !== "assets_equipment") {
      throw new Error("Jenis aset tidak dikenali.");
    }
    const { data: emp, error: empErr } = await supabase.from('pegawai').select('nama').eq('nip', employeeNip).single();
    if (empErr || !emp) throw new Error("Pegawai tidak ditemukan.");
    
    const { error } = await supabase.from(table).update({
      pengguna_nip: employeeNip,
      pengguna: emp.nama,
      pengguna_match_status: 'matched'
    }).eq('asset_id', assetId);
    if (error) throw error;
    notifyMutation([table]);
    
    return { ok: true as const, table, assetId, employeeNip, employeeName: emp.nama };
  },

  // Kontrak lama tetap tersedia untuk kompatibilitas, tetapi backend selalu
  // menerjemahkan nama ke NIP sebelum menulis data.

  getConfig: async (): Promise<{ ok: true; config: Record<string, any> }> => {
    const { data, error } = await supabase.from('system_config').select('*');
    if (error) throw error;
    const config: Record<string, any> = {};
    data.forEach(r => { config[r.key || r.config_key] = r.value || r.config_value; });
    return { ok: true as const, config };
  },

  setConfig: async (key: string, value: string): Promise<{ ok: true }> => {
    const { error } = await supabase.from('system_config').upsert({ key, value }, { onConflict: 'key' });
    if (error) throw error;
    notifyMutation(["system_config"]);
    return { ok: true as const };
  },

  runNotifikasi: async (force = false) => {
    const { data, error } = await supabase.functions.invoke('send-penjagaan-notification', {
      body: { force }
    });
    if (error) throw new Error(error.message || "Gagal menjalankan notifikasi email.");
    if (data && data.ok === false) throw new Error(data.error || "Gagal memproses notifikasi.");
    return data || { ok: true, agenda: 0, email_pegawai_terkirim: 0, email_rekap_terkirim: 0 };
  },

  askAI: async (
    question: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    dataContext: string
  ): Promise<{ ok: true; answer: string; model?: string; route?: "database" | "gemini"; snapshot_at?: string }> => {
    const { data, error } = await supabase.functions.invoke('tanya-simosda', {
      body: { question, history, dataContext }
    });
    
    if (error) throw new Error(error.message || "Gagal menghubungi AI.");
    if (data?.error) throw new Error(data.error);
    
    return { ok: true as const, answer: data.answer };
  },

  askAIVoice: async (
    question: string,
    dataContext: string
  ): Promise<{ ok: true; answer: any }> => {
    let parsed = null;

    try {
      const { data, error } = await supabase.functions.invoke('tanya-simosda', {
        body: { question, mode: 'voice', dataContext }
      });
      
      if (error) throw new Error(error.message || "Gagal menghubungi AI.");
      if (data?.error) throw new Error(data.error);
      
      let textResponse = data.answer || "";
      
      // Attempt to extract JSON block using regex if it's wrapped in conversational text
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        textResponse = jsonMatch[0];
      }
      
      let cleanJson = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleanJson);
    } catch(e) {
      console.error("AI Error, menggunakan sistem fallback lokal:", e);
      
      const q = question.toLowerCase();
      
      // Logika Pencocokan Kata Kundi dengan sinonim
      if (/halo|hai|assalamu|salam|pagi|siang|sore|malam/.test(q)) {
        parsed = { action: "REPLY_ONLY", speech: "Halo, saya mendengarkan. Ada yang bisa saya bantu?" };
      } else if (/ulang\s*tahun|ultah|kelahiran|birthday/.test(q)) {
        parsed = { action: "NAVIGATE", target: "/buku-penjagaan", speech: "Untuk melihat daftar pegawai yang berulang tahun minggu ini, Anda bisa membukanya melalui halaman Buku Penjagaan." };
      } else if (/sinkron|sinkronisasi|sync|perbarui\s*data/.test(q)) {
        parsed = { action: "REPLY_ONLY", speech: "Sinkronisasi data berjalan secara otomatis. Anda juga dapat menekan tombol Sinkronisasi di Dashboard jika diperlukan." };
      } else if (/gelap|dark\s*mode|tema\s*gelap|hitam/.test(q)) {
        parsed = { action: "THEME", target: "dark", speech: "Baik, tema telah diganti ke mode gelap." };
      } else if (/terang|light\s*mode|tema\s*terang|putih/.test(q)) {
        parsed = { action: "THEME", target: "light", speech: "Baik, tema telah diganti ke mode terang." };
      } else if (/tambah|buat\s*baru|input\s*data|register\s*pegawai/.test(q)) {
        if (/kendaraan|mobil|motor|roda\s*empat|roda\s*dua/.test(q)) {
          parsed = { action: "FILL_FORM", target: "vehicle_form", payload: {}, speech: "Baik, form data kendaraan telah dibuka." };
        } else if (/pegawai|asn|pppk|karyawan|staff/.test(q)) {
          parsed = { action: "FILL_FORM", target: "employee_form", payload: {}, speech: "Baik, form data pegawai telah dibuka." };
        } else if (/alat|mesin|inventaris|barang/.test(q)) {
          parsed = { action: "FILL_FORM", target: "equipment_form", payload: {}, speech: "Baik, form data alat dan mesin telah dibuka." };
        } else {
          parsed = { action: "REPLY_ONLY", speech: "Silakan buka halaman menu yang ingin Anda tambahkan datanya, lalu tekan tombol Tambah Data." };
        }
      } else if (/buka|halaman|menu|ke\s+halaman|lihat\s+data|cek\s+data|show|navigasi/.test(q)) {
        if (/dashboard|beranda|utama|home/.test(q)) {
          parsed = { action: "NAVIGATE", target: "/dashboard", speech: "Membuka halaman Dashboard." };
        } else if (/pegawai|asn|pppk|data\s*peg|karyawan/.test(q)) {
          parsed = { action: "NAVIGATE", target: "/pegawai", speech: "Membuka halaman Data ASN / PPPK." };
        } else if (/penjagaan|agenda|jadwal|peringatan/.test(q)) {
          parsed = { action: "NAVIGATE", target: "/buku-penjagaan", speech: "Membuka halaman Buku Penjagaan." };
        } else if (/kendaraan|mobil|motor|kendaraan\s*dinas/.test(q)) {
          parsed = { action: "NAVIGATE", target: "/kendaraan", speech: "Membuka halaman Data Kendaraan." };
        } else if (/inventaris|aset\s*lain/.test(q)) {
          parsed = { action: "NAVIGATE", target: "/inventaris", speech: "Membuka halaman Inventaris." };
        } else if (/alat|mesin/.test(q)) {
          parsed = { action: "NAVIGATE", target: "/alat-mesin", speech: "Membuka halaman Alat dan Mesin." };
        } else if (/pagu|anggaran|budget/.test(q)) {
          parsed = { action: "NAVIGATE", target: "/pagu", speech: "Membuka halaman Pagu Anggaran." };
        } else if (/pemeliharaan|servis|service|perawatan/.test(q)) {
          parsed = { action: "NAVIGATE", target: "/pemeliharaan-kendaraan", speech: "Membuka halaman Pemeliharaan Kendaraan." };
        } else if (/pinjam|booking|peminjaman/.test(q)) {
          parsed = { action: "NAVIGATE", target: "/peminjaman", speech: "Membuka halaman Peminjaman." };
        } else if (/peta|sebaran|lokasi|map/.test(q)) {
          parsed = { action: "NAVIGATE", target: "/peta", speech: "Membuka halaman Peta Sebaran." };
        } else if (/laporan|rekap|lapor/.test(q)) {
          parsed = { action: "NAVIGATE", target: "/laporan", speech: "Membuka halaman Rekap Laporan." };
        } else if (/tanya|chat|asisten|ai|bot|simosda/.test(q)) {
          parsed = { action: "NAVIGATE", target: "/tanya", speech: "Membuka halaman Tanya SIMOSDA." };
        } else if (/akun|pengaturan|setting|kelola\s*user/.test(q)) {
          parsed = { action: "NAVIGATE", target: "/kelola-akun", speech: "Membuka halaman Kelola Akun." };
        } else if (/cleansing|bersih|bersihkan\s*data|validasi/.test(q)) {
          parsed = { action: "NAVIGATE", target: "/cleansing", speech: "Membuka halaman Data Cleansing." };
        } else {
          parsed = {
            action: 'UNKNOWN',
            speech: "Maaf suara Anda tidak terdengar jelas oleh saya. Coba gunakan menu Tanya SIMOSDA untuk jawaban yang lebih komprehensif."
          };
        }
      } else {
        parsed = {
          action: 'UNKNOWN',
          speech: "Maaf suara Anda tidak terdengar jelas oleh saya. Coba gunakan menu Tanya SIMOSDA untuk jawaban yang lebih komprehensif."
        };
      }
    }
    
    return { ok: true as const, answer: parsed };
  },

  userList: async () => {
    const { data, error } = await supabase.from('app_access').select('*');
    if (error) throw error;
    return { ok: true as const, users: data as import("./accessService").AccessUser[] };
  },

  userSave: async (data: Partial<import("./accessService").AccessUser>, isNew: boolean) => {
    const cleanEmail = (data.email || "").trim().toLowerCase();
    const cleanNip = (data.nip || "").trim();
    const cleanNama = (data.nama || "").trim();
    const role = data.role || "pegawai";
    const isActive = data.is_active !== false;

    if (isNew) {
      const { error } = await supabase.from('app_access').insert({
        email: cleanEmail,
        nip: cleanNip,
        nama: cleanNama,
        role,
        is_active: isActive,
        auth_status: 'ready',
        registered_at: null,
        auth_user_id: null,
      });
      if (error) throw error;
      notifyMutation(["app_access"]);
      return { ok: true as const, mode: 'insert', email: cleanEmail };
    } else {
      if (!isActive) {
        // Jika dinonaktifkan via Edit, panggil RPC simosda_deactivate_user agar auth.users terhapus dan status disabled
        const { error: rpcErr } = await supabase.rpc('simosda_deactivate_user', { target_email: cleanEmail });
        if (rpcErr) {
          await supabase.from('app_access').update({
            role,
            nip: cleanNip,
            nama: cleanNama,
            is_active: false,
            auth_status: 'disabled',
            registered_at: null,
            auth_user_id: null,
          }).eq('email', cleanEmail);
        }
      } else {
        // Jika diaktifkan kembali dari status nonaktif -> harus siap registrasi baru
        const { data: current } = await supabase.from('app_access').select('is_active, auth_status, registered_at').eq('email', cleanEmail).maybeSingle();
        if (!current?.is_active || current?.auth_status === 'disabled') {
          await supabase.rpc('simosda_activate_user', { target_email: cleanEmail, target_role: role });
        } else {
          const { error } = await supabase.from('app_access').update({
            role,
            nip: cleanNip,
            nama: cleanNama,
            is_active: true,
          }).eq('email', cleanEmail);
          if (error) throw error;
        }
      }
      notifyMutation(["app_access"]);
      return { ok: true as const, mode: 'update', email: cleanEmail };
    }
  },

  userDeactivate: async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const { error: rpcErr } = await supabase.rpc('simosda_deactivate_user', { target_email: cleanEmail });
    if (rpcErr) {
      const { error } = await supabase.from('app_access').update({
        is_active: false,
        auth_status: 'disabled',
        registered_at: null,
        auth_user_id: null,
      }).eq('email', cleanEmail);
      if (error) throw error;
    }
    notifyMutation(["app_access"]);
    return { ok: true as const, email: cleanEmail };
  },

  userDelete: async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    // Panggil RPC simosda_delete_user agar app_access dan auth.users terhapus tuntas
    const { error: rpcErr } = await supabase.rpc('simosda_delete_user', { target_email: cleanEmail });
    if (rpcErr) {
      const { error } = await supabase.from('app_access').delete().eq('email', cleanEmail);
      if (error) throw error;
    }
    notifyMutation(["app_access"]);
    return { ok: true as const, email: cleanEmail };
  },

  userResetRegistration: async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    // Panggil RPC simosda_reset_registration agar status app_access di-reset dan auth.users dihapus sehingga siap daftar ulang
    const { error: rpcErr } = await supabase.rpc('simosda_reset_registration', { target_email: cleanEmail });
    if (rpcErr) {
      const { error } = await supabase.from('app_access').update({
        is_active: true,
        registered_at: null,
        auth_status: 'ready',
        auth_user_id: null,
      }).eq('email', cleanEmail);
      if (error) throw error;
    }
    notifyMutation(["app_access"]);
    return { ok: true as const, email: cleanEmail };
  },

  userSeedFromPegawai: async () => {
    const { data: pegawais, error: pError } = await supabase
      .from('pegawai')
      .select('nip, email, nama')
      .or('is_active.is.true,is_active.is.null');
    if (pError) throw pError;
    
    const { data: users, error: uError } = await supabase
      .from('app_access')
      .select('nip, email, nama');
    if (uError) throw uError;
    
    const existingNips = new Set(users.map(u => String(u.nip || '').trim()).filter(Boolean));
    const existingEmails = new Set(users.map(u => String(u.email || '').trim().toLowerCase()));
    
    const toInsert = [];
    for (const p of pegawais || []) {
      const email = String(p.email || '').trim().toLowerCase();
      const nip = String(p.nip || '').trim();
      const nama = String(p.nama || '').trim();
      if (nip && email.includes('@')) {
        if (!existingNips.has(nip) && !existingEmails.has(email)) {
          toInsert.push({
            email,
            nip,
            nama: nama || email,
            role: 'pegawai',
            is_active: true
          });
          existingNips.add(nip);
          existingEmails.add(email);
        }
      }
    }
    
    if (toInsert.length > 0) {
      const { error: insError } = await supabase.from('app_access').insert(toInsert);
      if (insError) throw insError;
      notifyMutation(["app_access"]);
    }
    
    return { ok: true as const, added: toInsert.length, note: `${toInsert.length} akun berhasil disinkronkan.` };
  },

  getNotificationFeed: async (): Promise<NotificationFeed> => {
    // Return empty feed to avoid calling backend for now.
    // The feed logic will be rewritten to run client-side using dataService in the next step.
    return { ok: true as const, generated_at: new Date().toISOString(), birthdays: [], overdue: [], kgb: [], pangkat: [], bup: [] };
  },

  getDashboardSnapshot: async (): Promise<{ ok: true; generated_at: string; data: Record<string, any[]> }> => {
    // Supabase will handle this directly on the client side via dataService caching
    return { ok: true, generated_at: new Date().toISOString(), data: {} };
  },
};



// Helper: ubah File -> base64 (tanpa prefix data URL) untuk dikirim ke backend.
export function fileToBase64(file: File): Promise<{ base64: string; mimeType: string; fileName: string }> {
  return optimizeEmployeePhoto(file).then((optimized) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve({ base64, mimeType: optimized.type || "image/webp", fileName: optimized.name || "foto.webp" });
    };
    reader.onerror = () => reject(new Error("Gagal membaca berkas foto."));
    reader.readAsDataURL(optimized);
  }));
}

/** Batasi dimensi dan ukuran transfer. Foto profil tidak memerlukan resolusi kamera penuh. */
async function optimizeEmployeePhoto(file: File): Promise<File> {
  if (typeof document === "undefined" || typeof URL === "undefined") return file;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Foto tidak dapat dibaca oleh browser."));
      img.src = objectUrl;
    });
    const maxSide = 960;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "foto"}.webp`, { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
