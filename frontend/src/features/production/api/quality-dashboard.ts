import { useQuery } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '@/services/api-client';

type Product = { id: string; code: string; name: string };
type ProductionOrder = { id: string; number: string };
export type QualityDashboard = {
  period: { from: string; to: string; timeZone: string; granularity: 'day' | 'week' | 'month' };
  selectedProduct: Product | null;
  current: { pendingInspection: number; rejectedAwaitingDisposition: number; rework: number };
  inspections: {
    total: number;
    approved: number;
    rejected: number;
    approvalRatePct: string | null;
  };
  dispositions: { total: number; release: number; rework: number; scrap: number };
  inspectionsByPeriod: { period: string; approved: number; rejected: number }[];
  dispositionsByPeriod: { period: string; release: number; rework: number; scrap: number }[];
  attention: {
    kind: 'REJECTED_AWAITING_DISPOSITION' | 'PENDING_INSPECTION';
    lot: { id: string; code: string };
    product: Product;
    productionOrder: ProductionOrder;
    since: string;
  }[];
  recentInspections: {
    id: string;
    result: 'APPROVED' | 'REJECTED';
    inspectedAt: string;
    lot: { id: string; code: string; status: string };
    product: Product;
    productionOrder: ProductionOrder | null;
    inspectedBy: { id: string; fullName: string };
    disposition: { type: 'RELEASE' | 'REWORK' | 'SCRAP'; decidedAt: string } | null;
  }[];
};
export type QualityDashboardFilters = { from?: string; to?: string; productId?: string };
export function useQualityDashboard(filters: QualityDashboardFilters) {
  return useQuery({
    queryKey: ['quality-dashboard', filters],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
      return (
        await apiFetch<ApiResponse<QualityDashboard>>(
          `/production/quality/dashboard${params.size ? `?${params}` : ''}`,
          { signal },
        )
      ).data;
    },
  });
}
