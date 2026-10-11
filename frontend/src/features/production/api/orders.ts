import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '@/services/api-client';
import type { BomProduct, BomVersion } from './boms';
import type { ProductionOrderFormValues } from '../order-schemas';
import { planningInstant, planningInputValue } from '../planning-dates';

export const ORDER_STATUS = {
  DRAFT: 'Borrador',
  IN_PROGRESS: 'En proceso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
} as const;
export type ProductionOrder = {
  id: string;
  number: string;
  productId: string;
  bomVersionId: string;
  warehouseId: string;
  quantityPlanned: string;
  quantityProduced: string;
  status: keyof typeof ORDER_STATUS;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  product: BomProduct;
  warehouse: { id: string; code: string; name: string; isActive: boolean };
  bomVersion: BomVersion & { bom: { id: string; name: string; isActive: boolean } };
};
export type OrderRequirements = {
  orderId: string;
  bomVersionId: string;
  version: number;
  quantityPlanned: string;
  warehouseId: string;
  updatedAt: string;
  canStart: boolean;
  eligibilityIssues: string[];
  items: { product: BomProduct; required: string; available: string; shortage: string }[];
};
const base = '/production/orders';
async function data<T>(path: string, options?: RequestInit) {
  return (await apiFetch<ApiResponse<T>>(path, options)).data;
}
export function useOrders(
  page: number,
  filters: { search?: string; status?: string; productId?: string; warehouseId?: string },
) {
  return useQuery({
    queryKey: ['production-orders', 'list', page, filters],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
      return apiFetch<{
        data: ProductionOrder[];
        meta: { page: number; limit: number; total: number };
      }>(base + '?' + params.toString(), { signal });
    },
  });
}
export function useOrder(id: string) {
  return useQuery({
    queryKey: ['production-orders', 'detail', id],
    queryFn: ({ signal }) => data<ProductionOrder>(base + '/' + id, { signal }),
  });
}
export function useOrderRequirements(id: string) {
  return useQuery({
    queryKey: ['production-orders', 'requirements', id],
    queryFn: ({ signal }) => data<OrderRequirements>(base + '/' + id + '/requirements', { signal }),
  });
}
function useRefreshOrders() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['production-orders'] });
}
function payload(value: ProductionOrderFormValues) {
  return {
    ...value,
    plannedStartAt: planningInstant(value.plannedStartAt ?? ''),
    plannedEndAt: planningInstant(value.plannedEndAt ?? ''),
  };
}
export function useCreateOrder() {
  return useMutation({
    mutationFn: (value: ProductionOrderFormValues) =>
      data<ProductionOrder>(base, { method: 'POST', body: JSON.stringify(payload(value)) }),
    onSuccess: useRefreshOrders(),
  });
}
export function useUpdateOrder(id: string, original?: ProductionOrder) {
  return useMutation({
    mutationFn: (value: ProductionOrderFormValues) => {
      const body = payload(value);
      // Editing quantity must preserve seconds/milliseconds from a date entered through the API.
      if (original && (value.plannedStartAt ?? '') === planningInputValue(original.plannedStartAt))
        body.plannedStartAt = original.plannedStartAt;
      if (original && (value.plannedEndAt ?? '') === planningInputValue(original.plannedEndAt))
        body.plannedEndAt = original.plannedEndAt;
      return data<ProductionOrder>(base + '/' + id, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    },
    onSuccess: useRefreshOrders(),
  });
}
export function useCancelOrder(id: string) {
  return useMutation({
    mutationFn: () =>
      data<ProductionOrder>(base + '/' + id + '/cancel', { method: 'POST', body: '{}' }),
    onSuccess: useRefreshOrders(),
  });
}
