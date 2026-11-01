import type { PurchasesDashboard } from '@/features/purchases/api/dashboard';
import type { SalesDashboard } from '@/features/sales/api/dashboard';
import { compatibleHomePeriods, type HomePeriod } from './period';

export function commercialActivity(
  purchases: PurchasesDashboard,
  sales: SalesDashboard,
  expected: HomePeriod,
) {
  if (!compatibleHomePeriods([purchases.period, sales.period], expected)) return null;
  const rows = new Map<
    string,
    {
      period: string;
      purchaseOrders: number;
      receipts: number;
      saleOrders: number;
      dispatches: number;
    }
  >();
  for (const p of purchases.activityByPeriod)
    rows.set(p.period, {
      period: p.period,
      purchaseOrders: p.orders,
      receipts: p.receipts,
      saleOrders: 0,
      dispatches: 0,
    });
  for (const s of sales.activityByPeriod) {
    const row = rows.get(s.period) ?? {
      period: s.period,
      purchaseOrders: 0,
      receipts: 0,
      saleOrders: 0,
      dispatches: 0,
    };
    row.saleOrders = s.orders;
    row.dispatches = s.dispatches;
    rows.set(s.period, row);
  }
  return [...rows.values()].sort((a, b) => a.period.localeCompare(b.period));
}
