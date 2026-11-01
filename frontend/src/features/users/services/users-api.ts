import { apiFetch, type ApiResponse } from '@/services/api-client';
import type { SessionUser, RoleCode } from '@/features/auth/types';

export type User = SessionUser;
export type Paginated<T> = { data: T[]; meta: { page: number; limit: number; total: number } };
export type CreateUserInput = {
  email: string;
  fullName: string;
  role: RoleCode;
  temporaryPassword: string;
};
export function listUsers(page: number, signal?: AbortSignal) {
  return apiFetch<Paginated<User>>(`/users?page=${page}&limit=20`, { signal });
}
export function createUser(input: CreateUserInput) {
  return apiFetch<ApiResponse<User>>('/users', { method: 'POST', body: JSON.stringify(input) });
}
export function setUserActive(id: string, active: boolean) {
  return apiFetch<ApiResponse<User>>(`/users/${id}/${active ? 'enable' : 'disable'}`, {
    method: 'POST',
  });
}
export function changeRole(id: string, role: RoleCode) {
  return apiFetch<ApiResponse<User>>(`/users/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}
export function resetPassword(id: string, temporaryPassword: string) {
  return apiFetch<ApiResponse<User>>(`/users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ temporaryPassword }),
  });
}
