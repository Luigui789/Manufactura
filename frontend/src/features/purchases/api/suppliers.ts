import { apiFetch, type ApiResponse } from '@/services/api-client';
import type { CreateSupplierPayload, Supplier, UpdateSupplierPayload } from '../types';

export type SuppliersListResponse = {
  data: Supplier[];
  meta: { page: number; limit: number; total: number };
};

export const getSuppliers = (
  page = 1,
  limit = 20,
  signal?: AbortSignal,
): Promise<SuppliersListResponse> =>
  apiFetch<SuppliersListResponse>(`/suppliers?page=${page}&limit=${limit}`, { signal });

export const createSupplier = async (payload: CreateSupplierPayload): Promise<Supplier> => {
  const response = await apiFetch<ApiResponse<Supplier>>('/suppliers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.data;
};

export const updateSupplier = async (
  id: string,
  payload: UpdateSupplierPayload,
): Promise<Supplier> => {
  const response = await apiFetch<ApiResponse<Supplier>>(`/suppliers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return response.data;
};

export const setSupplierStatus = async (id: string, isActive: boolean): Promise<Supplier> => {
  const response = await apiFetch<ApiResponse<Supplier>>(`/suppliers/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
  return response.data;
};
