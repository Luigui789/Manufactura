import { apiFetch, type ApiResponse } from '@/services/api-client';
import type { CreateProductData, Product, UpdateProductData } from '../types';

export type ProductsListResponse = {
  data: Product[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
};

export const getProducts = (
  page = 1,
  limit = 20,
  signal?: AbortSignal,
): Promise<ProductsListResponse> =>
  apiFetch<ProductsListResponse>(`/products?page=${page}&limit=${limit}`, { signal });

export const getProduct = async (id: string, signal?: AbortSignal): Promise<Product> => {
  const response = await apiFetch<ApiResponse<Product>>(`/products/${id}`, { signal });
  return response.data;
};

export const createProduct = async (data: CreateProductData): Promise<Product> => {
  const response = await apiFetch<ApiResponse<Product>>('/products', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.data;
};

export const updateProduct = async (id: string, data: UpdateProductData): Promise<Product> => {
  const response = await apiFetch<ApiResponse<Product>>(`/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return response.data;
};

export const setProductStatus = async (id: string, isActive: boolean): Promise<Product> => {
  const response = await apiFetch<ApiResponse<Product>>(`/products/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
  return response.data;
};
