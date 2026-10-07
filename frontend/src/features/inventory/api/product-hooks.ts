import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateProductData, UpdateProductData } from '../types';
import {
  createProduct,
  getProduct,
  getProducts,
  setProductStatus,
  updateProduct,
} from './products';

export function useProducts(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['products', 'list', page, limit],
    queryFn: ({ signal }) => getProducts(page, limit, signal),
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['products', 'detail', id],
    queryFn: ({ signal }) => getProduct(id, signal),
  });
}

function useRefreshProducts() {
  const client = useQueryClient();

  return () => client.invalidateQueries({ queryKey: ['products'] });
}

export function useCreateProduct() {
  const onSuccess = useRefreshProducts();

  return useMutation({
    mutationFn: (data: CreateProductData) => createProduct(data),
    onSuccess,
  });
}

export function useUpdateProduct() {
  const onSuccess = useRefreshProducts();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProductData }) => updateProduct(id, data),
    onSuccess,
  });
}

export function useSetProductStatus() {
  const onSuccess = useRefreshProducts();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setProductStatus(id, isActive),
    onSuccess,
  });
}
