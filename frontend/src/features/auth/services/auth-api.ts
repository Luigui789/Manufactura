import { apiFetch, ApiError, type ApiResponse } from '@/services/api-client';
import type { SessionUser } from '../types';

export async function getMe(signal?: AbortSignal): Promise<SessionUser | null> {
  try {
    return (await apiFetch<ApiResponse<SessionUser>>('/auth/me', { signal })).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
export async function login(input: { email: string; password: string }) {
  return (
    await apiFetch<ApiResponse<SessionUser>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).data;
}
export async function logout() {
  await apiFetch('/auth/logout', { method: 'POST' });
}
export async function changePassword(input: { currentPassword: string; newPassword: string }) {
  return (
    await apiFetch<ApiResponse<SessionUser>>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).data;
}
