import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '@/services/api-client';
export const SALE_STATUS = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmada',
  PARTIALLY_DISPATCHED: 'Parcialmente despachada',
  DISPATCHED: 'Despachada',
  CANCELLED: 'Cancelada',
} as const;
export type SaleOrderValues = {
  customerId: string;
  items: { productId: string; quantity: string; unitPrice: string }[];
};
export type SaleOrder = {
  id: string;
  number: string;
  status: keyof typeof SALE_STATUS;
  orderedAt: string;
  total: string;
  itemsCount: number;
  customer: { id: string; code: string; name: string };
  items: {
    id: string;
    productId: string;
    productCode: string;
    productName: string;
    productUnit: string;
    isLotTracked: boolean;
    quantity: string;
    quantityDispatched?: string;
    quantityPending?: string;
    unitPrice: string;
    lineTotal: string;
    availableQuantity?: string;
  }[];
  dispatches?: {
    id: string;
    number: string;
    dispatchedAt: string;
    createdBy: { id: string; fullName: string };
    items: {
      id: string;
      saleOrderItemId: string;
      productId: string;
      warehouse: { id: string; code: string; name: string };
      lot: { id: string; code: string; status: string } | null;
      quantity: string;
    }[];
  }[];
  createdAt: string;
  updatedAt: string;
};
export type SaleDispatchValues = {
  items: { saleOrderItemId: string; warehouseId: string; lotId?: string; quantity: string }[];
};
const base = '/sales/orders';
function result(path: string, options?: RequestInit) {
  return apiFetch<ApiResponse<SaleOrder>>(path, options).then((r) => r.data);
}
export function useSalesOrders(
  page: number,
  filters: { search?: string; status?: string; customerId?: string },
) {
  return useQuery({
    queryKey: ['sales-orders', 'list', page, filters],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
      return apiFetch<{ data: SaleOrder[]; meta: { page: number; limit: number; total: number } }>(
        base + '?' + params,
        { signal },
      );
    },
  });
}
export function useSalesOrder(id: string) {
  return useQuery({
    queryKey: ['sales-orders', 'detail', id],
    queryFn: ({ signal }) => result(base + '/' + id, { signal }),
  });
}
export function useSaveSalesOrder(id?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: SaleOrderValues) =>
      result(base + (id ? '/' + id : ''), {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(value),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['sales-orders'] }),
  });
}
export function useSalesOrderAction(id: string, action: 'confirm' | 'cancel') {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => result(`${base}/${id}/${action}`, { method: 'POST', body: '{}' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['sales-orders'] });
    },
  });
}

export function useCreateSaleDispatch(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: SaleDispatchValues) =>
      apiFetch<{ data: unknown; message: string }>(`${base}/${id}/dispatch`, {
        method: 'POST',
        body: JSON.stringify(value),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['sales-orders'] }),
        client.invalidateQueries({ queryKey: ['inventory'] }),
        client.invalidateQueries({ queryKey: ['lots'] }),
      ]);
    },
  });
}
