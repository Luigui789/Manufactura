export const MOVEMENT_LABELS = {
  ADJUSTMENT_IN: 'Ajuste entrada',
  ADJUSTMENT_OUT: 'Ajuste salida',
  PURCHASE_RECEIPT: 'Recepción de compra',
  PRODUCTION_CONSUMPTION: 'Consumo de producción',
  PRODUCTION_OUTPUT: 'Salida de producción',
  SALE_DISPATCH: 'Despacho de venta',
} as const;
export function movementLabel(type: string) {
  return MOVEMENT_LABELS[type as keyof typeof MOVEMENT_LABELS] ?? type;
}
