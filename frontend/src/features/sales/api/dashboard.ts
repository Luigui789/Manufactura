import { useQuery } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '@/services/api-client';
import type { SaleOrder } from '../orders/api/sales-orders';

type Customer = { id: string; code: string; name: string };
export type SalesDashboard = {
  period: { from: string; to: string; timeZone: string; granularity: 'day' | 'week' | 'month' };
  selectedCustomer: Customer | null;
  customers: { active: number; usedInPeriod: number };
  pipeline: { awaitingDispatch: number };
  orders: {
    total: number;
    draft: number;
    confirmed: number;
    partiallyDispatched: number;
    dispatched: number;
    cancelled: number;
  };
  amounts: { confirmed: string };
  dispatches: { total: number; lines: number };
  activityByPeriod: { period: string; orders: number; dispatches: number }[];
  topCustomers: { customer: Customer; orders: number; confirmedAmount: string }[];
  recentOrders: {
    id: string;
    number: string;
    status: SaleOrder['status'];
    orderedAt: string;
    total: string;
    itemsCount: number;
    dispatchesCount: number;
    customer: Customer;
  }[];
};
export type DashboardFilters = { from?: string; to?: string; customerId?: string };

export function useSalesDashboard(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['sales-dashboard', filters],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
      return (
        await apiFetch<ApiResponse<SalesDashboard>>(
          `/sales/dashboard${params.size ? `?${params}` : ''}`,
          { signal },
        )
      ).data;
    },
  });
}
