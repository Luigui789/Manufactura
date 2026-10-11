import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '@/services/api-client';
import type { Product } from '@/features/inventory/types';
import type { BomVersionFormData, CalculationFormData, CreateBomFormData } from '../schemas';

export type BomProduct = Pick<Product, 'id' | 'code' | 'name' | 'type' | 'unit' | 'isActive'>;
export type BomVersion = {
  id: string;
  bomId: string;
  version: number;
  outputQuantity: string;
  isActive: boolean;
  createdAt: string;
  createdByUserId: string;
  items: {
    id: string;
    componentProductId: string;
    quantity: string;
    componentProduct: BomProduct;
  }[];
};
export type Bom = {
  id: string;
  productId: string;
  name: string;
  isActive: boolean;
  product: BomProduct;
  versions: BomVersion[];
  createdAt: string;
  updatedAt: string;
};
export type BomCalculation = {
  bomId: string;
  bomVersionId: string;
  version: number;
  product: BomProduct;
  outputQuantity: string;
  quantityPlanned: string;
  items: {
    productId: string;
    code: string;
    name: string;
    unit: Product['unit'];
    quantity: string;
    requiredQuantity: string;
  }[];
};
const base = '/production/boms';
async function data<T>(route: string, options?: RequestInit) {
  return (await apiFetch<ApiResponse<T>>(route, options)).data;
}
const post = (value: unknown) => ({ method: 'POST', body: JSON.stringify(value) });
const patch = (value: unknown) => ({ method: 'PATCH', body: JSON.stringify(value) });

export function useBoms(page: number, search: string, status: string) {
  return useQuery({
    queryKey: ['boms', 'list', page, search, status],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (status !== 'all') params.set('isActive', String(status === 'active'));
      return apiFetch<{ data: Bom[]; meta: { page: number; limit: number; total: number } }>(
        base + '?' + params.toString(),
        { signal },
      );
    },
  });
}
export function useBom(id: string) {
  return useQuery({
    queryKey: ['boms', 'detail', id],
    queryFn: ({ signal }) => data<Bom>(base + '/' + id, { signal }),
  });
}
function useRefreshBoms() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['boms'] });
}
export function useCreateBom() {
  return useMutation({
    mutationFn: (value: CreateBomFormData) => data<Bom>(base, post(value)),
    onSuccess: useRefreshBoms(),
  });
}
export function useRenameBom(id: string) {
  return useMutation({
    mutationFn: (value: { name: string }) => data<Bom>(base + '/' + id, patch(value)),
    onSuccess: useRefreshBoms(),
  });
}
export function useBomStatus(id: string) {
  return useMutation({
    mutationFn: (isActive: boolean) => data<Bom>(base + '/' + id + '/status', patch({ isActive })),
    onSuccess: useRefreshBoms(),
  });
}
export function useCreateVersion(id: string) {
  return useMutation({
    mutationFn: (value: BomVersionFormData) =>
      data<BomVersion>(base + '/' + id + '/versions', post(value)),
    onSuccess: useRefreshBoms(),
  });
}
export function useActivateVersion(id: string) {
  return useMutation({
    mutationFn: (versionId: string) =>
      data<BomVersion>(base + '/' + id + '/versions/' + versionId + '/activate', post({})),
    onSuccess: useRefreshBoms(),
  });
}
export function useCalculateBom(id: string) {
  return useMutation({
    mutationFn: ({ versionId, value }: { versionId: string; value: CalculationFormData }) =>
      data<BomCalculation>(base + '/' + id + '/versions/' + versionId + '/calculate', post(value)),
  });
}
