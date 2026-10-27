import { apiFetch, type ApiResponse } from '@/services/api-client';
import type { CreateCustomerPayload, Customer, UpdateCustomerPayload } from '../types';

export type CustomersListResponse = {
  data: Customer[];
  meta: { page: number; limit: number; total: number };
};

export type CustomerFilters = { search?: string; isActive?: boolean };

export const getCustomers = (
  page = 1,
  limit = 20,
  signal?: AbortSignal,
  filters: CustomerFilters = {},
): Promise<CustomersListResponse> => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters.search?.trim()) params.set('search', filters.search.trim());
  if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive));
  return apiFetch<CustomersListResponse>(`/customers?${params}`, { signal });
};

export const createCustomer = async (payload: CreateCustomerPayload): Promise<Customer> => {
  const response = await apiFetch<ApiResponse<Customer>>('/customers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.data;
};

export const updateCustomer = async (
  id: string,
  payload: UpdateCustomerPayload,
): Promise<Customer> => {
  const response = await apiFetch<ApiResponse<Customer>>(`/customers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return response.data;
};

export const setCustomerStatus = async (id: string, isActive: boolean): Promise<Customer> => {
  const response = await apiFetch<ApiResponse<Customer>>(`/customers/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
  return response.data;
};
