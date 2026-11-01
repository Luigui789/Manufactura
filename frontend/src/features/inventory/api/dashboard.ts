import { useQuery } from '@tanstack/react-query';
import { apiFetch, type ApiResponse } from '@/services/api-client';
import type { InventoryMovementRow } from './inventory-data';

type Entity = { id: string; code: string; name: string };
export type InventoryDashboard = {
  period: { from: string; to: string; timeZone: string; granularity: 'day' | 'week' | 'month' };
  selectedProduct: (Entity & { unit: string; isLotTracked: boolean }) | null;
  selectedWarehouse: Entity | null;
  catalog: {
    activeProducts: number;
    activeWarehouses: number;
    productsByType: {
      rawMaterial: number;
      intermediate: number;
      finishedGood: number;
      consumable: number;
    };
  };
  stockPositions: { withOnHand: number };
  lotsOnHand: {
    total: number;
    quarantined: number;
    released: number;
    rejected: number;
    rework: number;
    scrapped: number;
  };
  stock: {
    onHand: string;
    consumable: string;
    unit: string;
    byWarehouse: {
      warehouse: Entity;
      onHand: string;
      consumable: string;
    }[];
  } | null;
  movements: {
    total: number;
    byType: {
      adjustmentIn: number;
      adjustmentOut: number;
      purchaseReceipt: number;
      productionConsumption: number;
      productionOutput: number;
      saleDispatch: number;
      qualityScrap: number;
    };
  };
  movementQuantity: { in: string; out: string; net: string; unit: string } | null;
  movementsByPeriod: { period: string; count: number }[];
  recentMovements: InventoryMovementRow[];
};
export type DashboardFilters = {
  from?: string;
  to?: string;
  productId?: string;
  warehouseId?: string;
};

export function useInventoryDashboard(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['inventory-dashboard', filters],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
      return (
        await apiFetch<ApiResponse<InventoryDashboard>>(
          `/inventory/dashboard${params.size ? `?${params}` : ''}`,
          { signal },
        )
      ).data;
    },
  });
}
