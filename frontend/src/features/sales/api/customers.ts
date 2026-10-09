import { apiFetch, type ApiResponse } from '@/services/api-client';
import type { CreateCustomerPayload, Customer, UpdateCustomerPayload } from '../types';

export type CustomersListResponse = {
  data: Customer[];
  meta: { page: number; limit: number; total: number };
};

export const getCustomers = (
  page = 1,
  limit = 20,
  signal?: AbortSignal,
): Promise<CustomersListResponse> =>
  apiFetch<CustomersListResponse>(`/customers?page=${page}&limit=${limit}`, { signal });

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
