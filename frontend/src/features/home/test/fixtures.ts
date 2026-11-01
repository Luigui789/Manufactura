import type { ProductionDashboard } from '@/features/production/api/dashboard';
import type { InventoryDashboard } from '@/features/inventory/api/dashboard';
import type { PurchasesDashboard } from '@/features/purchases/api/dashboard';
import type { SalesDashboard } from '@/features/sales/api/dashboard';
import type { QualityDashboard } from '@/features/production/api/quality-dashboard';
import type { SessionUser } from '@/features/auth/types';

export const account: SessionUser = {
  id: 'u1',
  email: 'home@example.test',
  fullName: 'Persona EcoSoap',
  role: 'ADMIN',
  isActive: true,
  mustChangePassword: false,
  createdAt: '',
  updatedAt: '',
};
export const paths = [
  '/production/dashboard',
  '/inventory/dashboard',
  '/purchases/dashboard',
  '/sales/dashboard',
  '/production/quality/dashboard',
] as const;
export const period: ProductionDashboard['period'] = {
  from: '2026-10-03',
  to: '2026-11-01',
  timeZone: 'America/Managua',
  granularity: 'day',
};
export function fixtures(p = period) {
  const production: ProductionDashboard = {
    period: p,
    selectedProduct: null,
    orders: { total: 8, draft: 1, inProgress: 2, completed: 4, cancelled: 1 },
    quantity: null,
    productionByPeriod: [],
    recentOrders: [],
  };
  const inventory: InventoryDashboard = {
    period: p,
    selectedProduct: null,
    selectedWarehouse: null,
    catalog: {
      activeProducts: 10,
      activeWarehouses: 2,
      productsByType: { rawMaterial: 4, intermediate: 2, finishedGood: 3, consumable: 1 },
    },
    stockPositions: { withOnHand: 11 },
    lotsOnHand: { total: 7, released: 4, quarantined: 1, rejected: 1, rework: 1, scrapped: 0 },
    stock: null,
    movementQuantity: null,
    movements: {
      total: 20,
      byType: {
        adjustmentIn: 1,
        adjustmentOut: 0,
        purchaseReceipt: 4,
        productionConsumption: 7,
        productionOutput: 3,
        saleDispatch: 4,
        qualityScrap: 1,
      },
    },
    movementsByPeriod: [],
    recentMovements: [],
  };
  const purchases: PurchasesDashboard = {
    period: p,
    selectedSupplier: null,
    suppliers: { active: 3, usedInPeriod: 2 },
    pipeline: { awaitingReceipt: 6, overdue: 2 },
    orders: { total: 9, draft: 1, confirmed: 2, partiallyReceived: 1, received: 4, cancelled: 1 },
    amounts: { committed: '1234.56' },
    receipts: { total: 4, lines: 6 },
    activityByPeriod: [{ period: p.from, orders: 9, receipts: 4 }],
    topSuppliers: [],
    recentOrders: [],
  };
  const sales: SalesDashboard = {
    period: p,
    selectedCustomer: null,
    customers: { active: 4, usedInPeriod: 3 },
    pipeline: { awaitingDispatch: 5 },
    orders: {
      total: 10,
      draft: 1,
      confirmed: 2,
      partiallyDispatched: 3,
      dispatched: 3,
      cancelled: 1,
    },
    amounts: { confirmed: '9876.54' },
    dispatches: { total: 8, lines: 10 },
    activityByPeriod: [{ period: p.from, orders: 10, dispatches: 8 }],
    topCustomers: [],
    recentOrders: [],
  };
  const quality: QualityDashboard = {
    period: p,
    selectedProduct: null,
    current: { pendingInspection: 3, rejectedAwaitingDisposition: 1, rework: 2 },
    inspections: { total: 5, approved: 4, rejected: 1, approvalRatePct: '80.00' },
    dispositions: { total: 1, release: 0, rework: 0, scrap: 1 },
    inspectionsByPeriod: [{ period: p.from, approved: 4, rejected: 1 }],
    dispositionsByPeriod: [{ period: p.from, release: 0, rework: 0, scrap: 1 }],
    attention: [],
    recentInspections: [],
  };
  return { production, inventory, purchases, sales, quality };
}
export const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
export function dashboardResponse(url: string, source = fixtures()) {
  const parsed = new URL(url, 'http://localhost');
  const from = parsed.searchParams.get('from') ?? period.from;
  const to = parsed.searchParams.get('to') ?? period.to;
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  const p = {
    from,
    to,
    timeZone: 'America/Managua',
    granularity: days <= 31 ? 'day' : days <= 180 ? 'week' : 'month',
  };
  const key = paths.indexOf(parsed.pathname.replace(/^\/api/, '') as (typeof paths)[number]);
  if (key < 0) return null;
  return response({
    data: {
      ...[source.production, source.inventory, source.purchases, source.sales, source.quality][key],
      period: p,
    },
  });
}
