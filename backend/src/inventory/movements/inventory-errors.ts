import { HttpException, HttpStatus } from '@nestjs/common';

export const InventoryErrorCode = {
  EMPTY_MOVEMENT: 'EMPTY_MOVEMENT',
  INVALID_OCCURRED_AT: 'INVALID_OCCURRED_AT',
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  INVALID_MOVEMENT_TYPE: 'INVALID_MOVEMENT_TYPE',
  INVALID_ORIGIN: 'INVALID_ORIGIN',
  INVALID_REFERENCE: 'INVALID_REFERENCE',
  REFERENCE_NOT_FOUND: 'REFERENCE_NOT_FOUND',
  INACTIVE_CATALOG: 'INACTIVE_CATALOG',
  INACTIVE_ACTOR: 'INACTIVE_ACTOR',
  LOT_TRACKING_MISMATCH: 'LOT_TRACKING_MISMATCH',
  LOT_PRODUCT_MISMATCH: 'LOT_PRODUCT_MISMATCH',
  LOT_NOT_RELEASED: 'LOT_NOT_RELEASED',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  INSUFFICIENT_LOT_STOCK: 'INSUFFICIENT_LOT_STOCK',
} as const;

export type InventoryErrorCode = (typeof InventoryErrorCode)[keyof typeof InventoryErrorCode];

const STATUS_BY_CODE: Record<InventoryErrorCode, HttpStatus> = {
  EMPTY_MOVEMENT: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_OCCURRED_AT: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_QUANTITY: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_MOVEMENT_TYPE: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_ORIGIN: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_REFERENCE: HttpStatus.UNPROCESSABLE_ENTITY,
  REFERENCE_NOT_FOUND: HttpStatus.UNPROCESSABLE_ENTITY,
  INACTIVE_CATALOG: HttpStatus.CONFLICT,
  INACTIVE_ACTOR: HttpStatus.CONFLICT,
  LOT_TRACKING_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
  LOT_PRODUCT_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
  LOT_NOT_RELEASED: HttpStatus.CONFLICT,
  INSUFFICIENT_STOCK: HttpStatus.CONFLICT,
  INSUFFICIENT_LOT_STOCK: HttpStatus.CONFLICT,
};

export class InventoryDomainException extends HttpException {
  readonly code: InventoryErrorCode;

  constructor(code: InventoryErrorCode, message: string) {
    const status = STATUS_BY_CODE[code];
    const error = status === HttpStatus.CONFLICT ? 'Conflict' : 'Unprocessable Entity';
    super({ statusCode: status, error, code, message }, status);
    this.code = code;
  }
}

export function inventoryError(
  code: InventoryErrorCode,
  message: string,
): InventoryDomainException {
  return new InventoryDomainException(code, message);
}
