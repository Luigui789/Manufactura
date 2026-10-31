import { useQuery } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '@/services/api-client';

export type ProductionDashboard = {
  period: { from: string; to: string; timeZone: string; granularity: 'day' | 'week' | 'month' };
  orders: {
    draft: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    total: number;
  };
  quantity: { planned: string; produced: string; completionRate: string | null };
  productionByPeriod: { period: string; planned: string; produced: string }[];
  recentOrders: {
    id: string;
    number: string;
    status: string;
    quantityPlanned: string;
    quantityProduced: string;
    activityAt: string;
    plannedStartAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    product: { id: string; code: string; name: string };
    unit: string;
  }[];
};

export function useProductionDashboard(filters: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['production-dashboard', filters],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const query = params.size ? `?${params.toString()}` : '';
      return (
        await apiFetch<ApiResponse<ProductionDashboard>>(`/production/dashboard${query}`, {
          signal,
        })
      ).data;
    },
  });
}
