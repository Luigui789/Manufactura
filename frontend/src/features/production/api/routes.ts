import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '@/services/api-client';
import type { BomProduct } from './boms';
export type RouteOperationInput = {
  sequence: number;
  name: string;
  description?: string | null;
  standardMinutes: string;
};
export type RouteOperation = RouteOperationInput & { id: string };
export type ProductionRoute = {
  id: string;
  productId: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  product: BomProduct;
  operationCount: number;
  totalStandardMinutes: string;
};
export type ProductionRouteDetail = ProductionRoute & { operations: RouteOperation[] };
export type CreateProductionRouteInput = {
  productId: string;
  code: string;
  name: string;
  description?: string | null;
  operations: RouteOperationInput[];
};
export type UpdateProductionRouteInput = Partial<
  Pick<CreateProductionRouteInput, 'code' | 'name' | 'description'>
>;
const base = '/production/routes';
export type RouteFilters = {
  page: number;
  search?: string;
  isActive?: boolean;
  productId?: string;
};
export function useProductionRoutes(filters: RouteFilters) {
  return useQuery({
    queryKey: ['production-routes', filters],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: String(filters.page), limit: '20' });
      if (filters.search) params.set('search', filters.search);
      if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive));
      if (filters.productId) params.set('productId', filters.productId);
      return apiFetch<{
        data: ProductionRoute[];
        meta: { page: number; limit: number; total: number };
      }>(base + '?' + params.toString(), { signal });
    },
  });
}
export function useProductionRoute(id: string) {
  return useQuery({
    queryKey: ['production-route', id],
    queryFn: async ({ signal }) =>
      (await apiFetch<ApiResponse<ProductionRouteDetail>>(base + '/' + id, { signal })).data,
  });
}
function useRouteMutation<T>(path: string, method: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (value: T) =>
      (
        await apiFetch<ApiResponse<ProductionRouteDetail>>(base + path, {
          method,
          body: JSON.stringify(value),
        })
      ).data,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['production-routes'] }),
        client.invalidateQueries({ queryKey: ['production-route'] }),
      ]);
    },
  });
}
export function useCreateProductionRoute() {
  return useRouteMutation<CreateProductionRouteInput>('', 'POST');
}
export function useUpdateProductionRoute(id: string) {
  return useRouteMutation<UpdateProductionRouteInput>('/' + id, 'PATCH');
}
export function useSetProductionRouteStatus(id: string) {
  return useRouteMutation<{ isActive: boolean }>('/' + id + '/status', 'PATCH');
}
export function useReplaceRouteOperations(id: string) {
  return useRouteMutation<{ operations: RouteOperationInput[] }>('/' + id + '/operations', 'PUT');
}
