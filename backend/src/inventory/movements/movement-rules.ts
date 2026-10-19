import {
  AdjustmentReason,
  InventoryMovementType,
  Prisma,
  type InventoryMovementType as InventoryMovementTypeValue,
} from '../../generated/prisma/client.js';
import { isPositiveDecimalString } from '../../common/decimal.dto.js';
import { InventoryErrorCode, inventoryError } from './inventory-errors.js';
import type { MovementOrigin } from './movement-origin.js';

export type ResolvedMovement = {
  quantity: Prisma.Decimal;
  signedQuantity: Prisma.Decimal;
  reason: AdjustmentReason | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw inventoryError(InventoryErrorCode.INVALID_REFERENCE, `${field} debe ser un UUID válido`);
  }
}

export function resolveMovement(
  type: InventoryMovementTypeValue,
  value: Prisma.Decimal | string,
  origin: MovementOrigin,
): ResolvedMovement {
  const quantity = parsePositiveQuantity(value);
  if (type === InventoryMovementType.PURCHASE_RECEIPT) {
    if (!origin || origin.kind !== 'PURCHASE_RECEIPT') {
      throw inventoryError(InventoryErrorCode.INVALID_ORIGIN, 'Se requiere origen de recepción');
    }
    assertUuid(origin.purchaseReceiptItemId, 'purchaseReceiptItemId');
    return { quantity, signedQuantity: quantity, reason: null };
  }
  if (
    type === InventoryMovementType.PRODUCTION_CONSUMPTION ||
    type === InventoryMovementType.PRODUCTION_OUTPUT
  ) {
    if (!origin || origin.kind !== 'PRODUCTION_ORDER')
      throw inventoryError(InventoryErrorCode.INVALID_ORIGIN, 'Se requiere origen de producción');
    assertUuid(origin.productionOrderId, 'productionOrderId');
    return {
      quantity,
      signedQuantity:
        type === InventoryMovementType.PRODUCTION_CONSUMPTION ? quantity.negated() : quantity,
      reason: null,
    };
  }
  const reason = resolveAdjustmentReason(origin);

  switch (type) {
    case InventoryMovementType.ADJUSTMENT_IN:
      return { quantity, signedQuantity: quantity, reason };
    case InventoryMovementType.ADJUSTMENT_OUT:
      return { quantity, signedQuantity: quantity.negated(), reason };
    default:
      throw inventoryError(
        InventoryErrorCode.INVALID_MOVEMENT_TYPE,
        'El tipo de movimiento no está habilitado en esta fase',
      );
  }
}

export function parsePositiveQuantity(value: Prisma.Decimal | string): Prisma.Decimal {
  let quantity: Prisma.Decimal;

  if (typeof value === 'string') {
    if (!isPositiveDecimalString(value)) {
      throw inventoryError(
        InventoryErrorCode.INVALID_QUANTITY,
        'La cantidad debe ser una cadena decimal positiva con hasta 14 enteros y 4 decimales',
      );
    }
    quantity = new Prisma.Decimal(value);
  } else if (value instanceof Prisma.Decimal) {
    quantity = value;
  } else {
    throw inventoryError(
      InventoryErrorCode.INVALID_QUANTITY,
      'La cantidad debe ser una cadena decimal o Prisma.Decimal',
    );
  }

  if (!quantity.isFinite() || !quantity.isPositive() || quantity.decimalPlaces() > 4) {
    throw inventoryError(
      InventoryErrorCode.INVALID_QUANTITY,
      'La cantidad debe ser mayor que cero y tener hasta 4 decimales',
    );
  }

  const integerPart = quantity.abs().toFixed().split('.')[0];
  const integerDigits = integerPart.replace(/^0+/, '').length || 1;
  if (integerDigits > 14) {
    throw inventoryError(
      InventoryErrorCode.INVALID_QUANTITY,
      'La cantidad no puede superar 14 dígitos enteros',
    );
  }

  return quantity;
}

function resolveAdjustmentReason(origin: MovementOrigin): AdjustmentReason {
  if (
    !origin ||
    origin.kind !== 'ADJUSTMENT' ||
    !Object.values(AdjustmentReason).includes(origin.reason)
  ) {
    throw inventoryError(
      InventoryErrorCode.INVALID_ORIGIN,
      'El movimiento debe incluir un motivo de ajuste válido',
    );
  }
  return origin.reason;
}
