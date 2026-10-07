import { apiFetch } from '@/services/api-client';
import type { CreateWarehouseData, Warehouse } from '../types';

export type UpdateWarehouseData = Partial<Omit<CreateWarehouseData, 'isActive'>>;

export type WarehousesListResponse = {
  data: Warehouse[];
  meta: { page: number; limit: number; total: number };
};

type WarehouseResponse = { data: Warehouse; message: string };

export const getWarehouses = (
  page = 1,
  limit = 20,
  signal?: AbortSignal,
): Promise<WarehousesListResponse> =>
  apiFetch<WarehousesListResponse>(`/warehouses?page=${page}&limit=${limit}`, { signal });

export const getWarehouse = async (id: string): Promise<Warehouse> => {
  const response = await apiFetch<WarehouseResponse>(`/warehouses/${id}`);
  return response.data;
};

export const createWarehouse = async (data: CreateWarehouseData): Promise<Warehouse> => {
  const response = await apiFetch<WarehouseResponse>('/warehouses', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.data;
};

export const updateWarehouse = async (
  id: string,
  data: UpdateWarehouseData,
): Promise<Warehouse> => {
  const response = await apiFetch<WarehouseResponse>(`/warehouses/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return response.data;
};

export const setWarehouseStatus = async (id: string, isActive: boolean): Promise<Warehouse> => {
  const response = await apiFetch<WarehouseResponse>(`/warehouses/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
  return response.data;
};
