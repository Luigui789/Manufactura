import { apiFetch } from '@/services/api-client';
import type { CreateWarehouseData, Warehouse } from '../types';

export type UpdateWarehouseData = Partial<Omit<CreateWarehouseData, 'isActive'>>;

export type WarehouseFilters = {
  isActive?: boolean;
  search?: string;
};

export type WarehousesListResponse = {
  data: Warehouse[];
  meta: { page: number; limit: number; total: number };
};

type WarehouseResponse = { data: Warehouse; message: string };

export const getWarehouses = (
  page = 1,
  limit = 20,
  filters: WarehouseFilters = {},
  signal?: AbortSignal,
): Promise<WarehousesListResponse> => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (filters.isActive !== undefined) {
    params.set('isActive', String(filters.isActive));
  }

  const search = filters.search?.trim();

  if (search) {
    params.set('search', search);
  }

  return apiFetch<WarehousesListResponse>(`/warehouses?${params.toString()}`, { signal });
};

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
