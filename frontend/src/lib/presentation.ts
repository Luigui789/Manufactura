import { PRODUCT_UNIT_LABELS, PRODUCT_TYPE_LABELS } from '@/features/inventory/product-labels';
export const unitLabel = (unit: string) =>
  PRODUCT_UNIT_LABELS[unit as keyof typeof PRODUCT_UNIT_LABELS] ?? unit;
export const productTypeLabel = (type: string) =>
  PRODUCT_TYPE_LABELS[type as keyof typeof PRODUCT_TYPE_LABELS] ?? type;
const reasons: Record<string, string> = {
  INITIAL_LOAD: 'Carga inicial',
  PHYSICAL_COUNT: 'Conteo físico',
  DAMAGE: 'Daño',
  LOSS: 'Pérdida',
  EXPIRY: 'Vencimiento',
  CORRECTION: 'Corrección',
};
export const reasonLabel = (reason: string | null) => reasons[reason ?? ''] ?? reason ?? '—';
