import { apiService } from "@/services/apiService";

export type AccessRole = "admin" | "pimpinan" | "pegawai";

export interface WhoamiResult {
  ok: true;
  email: string;
  role: AccessRole;
  nip: string;
  nama: string;
}

export interface AccessUser {
  email: string;
  role: AccessRole;
  nip: string;
  nama: string;
  is_active: boolean;
  last_login?: string;
  auth_status?: "ready" | "active" | "disabled";
  auth_user_id?: string;
  registered_at?: string;
}

export const accessService = {
  whoami: async () => apiService.whoami(),
  userList: async () => apiService.userList(),
  userSave: async (data: Partial<AccessUser>, isNew: boolean) => apiService.userSave(data, isNew),
  userDelete: async (email: string) => apiService.userDelete(email),
  userSeedFromPegawai: async () => apiService.userSeedFromPegawai(),
};
