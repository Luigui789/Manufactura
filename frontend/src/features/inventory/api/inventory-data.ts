import { apiFetch } from '@/services/api-client';

export type Paginated<T> = { data: T[]; meta: { page: number; limit: number; total: number } };
export type InventoryStockRow = {
  id: string;
  quantity: string;
  updatedAt: string;
  product: {
    id: string;
    code: string;
    name: string;
    type: string;
    unit: string;
    isLotTracked: boolean;
  };
  warehouse: { id: string; code: string; name: string };
};
export type PurchaseOrigin = {
  type: 'PURCHASE_RECEIPT';
  purchaseReceiptItemId: string;
  purchaseReceipt: { id: string; number: string; receivedAt: string };
  purchaseOrder: { id: string; number: string };
  supplier: { id: string; code: string; name: string };
};
export type InventoryMovementRow = {
  id: string;
  type: string;
  quantity: string;
  purchaseReceiptItemId: string | null;
  businessReference: {
    type: 'PURCHASE_RECEIPT';
    id: string;
    number: string;
    purchaseOrder: { id: string; number: string };
  } | null;
  reason: string | null;
  occurredAt: string;
  requestId: string | null;
  product: { id: string; code: string; name: string; unit: string };
  warehouse: { id: string; code: string; name: string };
  lot: { id: string; code: string; status: string } | null;
  performedByUser: { id: string; fullName: string };
};
export type InventoryLotRow = {
  id: string;
  code: string;
  status: string;
  originatedAt: string;
  expiresAt: string | null;
  origin: PurchaseOrigin | null;
  quantityOnHand: string;
  product: { id: string; code: string; name: string; unit: string };
};

function queryString(
  filters: Record<string, string | boolean | undefined>,
  page: number,
  limit: number,
) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined && value !== '') params.set(key, String(value));
  return params.toString();
}
export const getInventoryStock = (
  filters: Record<string, string | boolean | undefined>,
  page: number,
  signal?: AbortSignal,
) =>
  apiFetch<Paginated<InventoryStockRow>>(`/inventory/stock?${queryString(filters, page, 20)}`, {
    signal,
  });
export const getInventoryMovements = (
  filters: Record<string, string | undefined>,
  page: number,
  signal?: AbortSignal,
) =>
  apiFetch<Paginated<InventoryMovementRow>>(
    `/inventory/movements?${queryString(filters, page, 20)}`,
    { signal },
  );
export const getInventoryLots = (
  filters: Record<string, string | boolean | undefined>,
  page: number,
  signal?: AbortSignal,
) =>
  apiFetch<Paginated<InventoryLotRow>>(`/inventory/lots?${queryString(filters, page, 20)}`, {
    signal,
  });
export const getInventoryLot = (id: string, signal?: AbortSignal) =>
  apiFetch<
    Omit<InventoryLotRow, 'quantityOnHand'> & {
      balances: Array<{ warehouse: { id: string; code: string; name: string }; quantity: string }>;
      movements: Omit<InventoryMovementRow, 'product' | 'lot'>[];
    }
  >(`/inventory/lots/${id}`, { signal });
export const createInventoryAdjustment = (data: {
  productId: string;
  warehouseId: string;
  lotId?: string;
  type: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';
  quantity: string;
  reason: 'INITIAL_LOAD' | 'PHYSICAL_COUNT' | 'DAMAGE' | 'LOSS' | 'EXPIRY' | 'CORRECTION';
}) =>
  apiFetch<{ data: InventoryMovementRow; message: string }>('/inventory/adjustments', {
    method: 'POST',
    body: JSON.stringify(data),
  });
