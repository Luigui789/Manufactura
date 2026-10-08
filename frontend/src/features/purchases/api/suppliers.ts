import { apiFetch } from '@/services/api-client';
import type { Supplier, CreateSupplierPayload, UpdateSupplierPayload } from '../types';

export const getSuppliers = async (): Promise<Supplier[]> => {
  return apiFetch<Supplier[]>('/api/suppliers');
};

export const createSupplier = async (payload: CreateSupplierPayload): Promise<Supplier> => {
  return apiFetch<Supplier>('/api/suppliers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const updateSupplier = async ({ id, payload }: { id: string; payload: UpdateSupplierPayload }): Promise<Supplier> => {
  return apiFetch<Supplier>(`/api/suppliers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
};

export const toggleSupplierStatus = async ({ id, isActive }: { id: string; isActive: boolean }): Promise<Supplier> => {
  return apiFetch<Supplier>(`/api/suppliers/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
};