import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '@/services/api-client';
import type { PurchaseOrderValues, ReceiptValues } from '../order-schemas';
export const PURCHASE_STATUS = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmada',
  PARTIALLY_RECEIVED: 'Recibida parcialmente',
  RECEIVED: 'Recibida',
  CANCELLED: 'Cancelada',
} as const;
export type PurchaseOrder = {
  id: string;
  number: string;
  supplier: { id: string; code: string; name: string };
  status: keyof typeof PURCHASE_STATUS;
  orderedAt: string;
  expectedDate: string | null;
  total: string;
  itemsCount: number;
  items: {
    id: string;
    productId: string;
    productCode: string;
    productName: string;
    productUnit: string;
    isLotTracked: boolean;
    requiresQualityInspection: boolean;
    quantityOrdered: string;
    quantityReceived: string;
    quantityPending: string;
    unitPrice: string;
    lineTotal: string;
  }[];
  receipts: {
    id: string;
    number: string;
    receivedAt: string;
    receivedByFullName: string;
    notes: string | null;
    items: {
      id: string;
      purchaseOrderItemId: string;
      productId: string;
      warehouse: { id: string; code: string; name: string };
      quantity: string;
      lot: { id: string; code: string; status: string; expiresAt: string | null } | null;
    }[];
  }[];
};
export type PurchaseOrderSummary = Omit<PurchaseOrder, 'items' | 'receipts'>;
const base = '/purchase-orders';
async function data(path: string, options?: RequestInit) {
  return (await apiFetch<ApiResponse<PurchaseOrder>>(path, options)).data;
}
export function usePurchaseOrders(
  page: number,
  filters: { search?: string; status?: string; supplierId?: string },
) {
  return useQuery({
    queryKey: ['purchase-orders', 'list', page, filters],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
      return apiFetch<{
        data: PurchaseOrderSummary[];
        meta: { page: number; limit: number; total: number };
      }>(base + '?' + params, { signal });
    },
  });
}
export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: ['purchase-orders', 'detail', id],
    queryFn: ({ signal }) => data(base + '/' + id, { signal }),
  });
}
export function useSavePurchaseOrder(id?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: PurchaseOrderValues) =>
      data(base + (id ? '/' + id : ''), {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...value, expectedDate: value.expectedDate || null }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });
}
export function usePurchaseAction(id: string, action: 'confirm' | 'cancel' | 'receive') {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value?: ReceiptValues) =>
      data(base + '/' + id + '/' + action, {
        method: 'POST',
        body: JSON.stringify(
          value
            ? {
                ...value,
                receivedAt: value.receivedAt ? value.receivedAt + ':00-06:00' : undefined,
                items: value.items.map((item) => ({
                  ...item,
                  expiresAt: item.expiresAt || undefined,
                })),
              }
            : {},
        ),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['purchase-orders'] }),
        client.invalidateQueries({ queryKey: ['products'] }),
        client.invalidateQueries({ queryKey: ['production-orders', 'requirements'] }),
        ...(action === 'receive'
          ? [
              client.invalidateQueries({ queryKey: ['inventory'] }),
              client.invalidateQueries({ queryKey: ['lots'] }),
            ]
          : []),
      ]);
    },
  });
}
