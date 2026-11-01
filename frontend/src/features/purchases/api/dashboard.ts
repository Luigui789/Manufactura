import { useQuery } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '@/services/api-client';
import type { PurchaseOrder } from './orders';

type Supplier = { id: string; code: string; name: string };
export type PurchasesDashboard = {
  period: { from: string; to: string; timeZone: string; granularity: 'day' | 'week' | 'month' };
  selectedSupplier: Supplier | null;
  suppliers: { active: number; usedInPeriod: number };
  pipeline: { awaitingReceipt: number; overdue: number };
  orders: {
    total: number;
    draft: number;
    confirmed: number;
    partiallyReceived: number;
    received: number;
    cancelled: number;
  };
  amounts: { committed: string };
  receipts: { total: number; lines: number };
  activityByPeriod: { period: string; orders: number; receipts: number }[];
  topSuppliers: { supplier: Supplier; orders: number; committedAmount: string }[];
  recentOrders: {
    id: string;
    number: string;
    status: PurchaseOrder['status'];
    orderedAt: string;
    expectedDate: string | null;
    total: string;
    itemsCount: number;
    receiptsCount: number;
    supplier: Supplier;
  }[];
};
export type DashboardFilters = { from?: string; to?: string; supplierId?: string };

export function usePurchasesDashboard(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['purchases-dashboard', filters],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
      return (
        await apiFetch<ApiResponse<PurchasesDashboard>>(
          `/purchases/dashboard${params.size ? `?${params}` : ''}`,
          { signal },
        )
      ).data;
    },
  });
}
