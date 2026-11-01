import { apiFetch, type ApiResponse } from '@/services/api-client';
import type { CreateProductData, Product, ProductFilters, UpdateProductData } from '../types';

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
  filters: ProductFilters = {},
  signal?: AbortSignal,
): Promise<ProductsListResponse> => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (filters.isActive !== undefined) {
    params.set('isActive', String(filters.isActive));
  }

  if (filters.type) {
    params.set('type', filters.type);
  }

  const search = filters.search?.trim();

  if (search) {
    params.set('search', search);
  }

  return apiFetch<ProductsListResponse>(`/products?${params.toString()}`, { signal });
};

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
