import { Prisma, PurchaseOrderStatus, ProductType } from '../../generated/prisma/client.js';

/**
 * Productos permitos inicialmente para compras
 * Si posterior se decide comprar INTERMEDIATE, se debe agregar aquí
 */
export const ALLOWED_PRODUCT_TYPES_FOR_PURCHASE: ProductType[] = [
  ProductType.RAW_MATERIAL,
  ProductType.CONSUMABLE,
];

export class PurchaseOrderRules {
  /**
   * Verifica si el tipo de producto está permitido en órdenes de compra
   */
  static isProductTypeAllowed(type: ProductType): boolean {
    return ALLOWED_PRODUCT_TYPES_FOR_PURCHASE.includes(type);
  }

  /**
   * Calcula el total de linea: round(quantityOrdered * unitPrice, 2) con ROUND_HALF_UP
   * Utiliza Prisma.Decimal (basado en decimal.js) para evitar problemas de coma flotante
   */
  static calculateLineTotal(quantity: Prisma.Decimal, unitPrice: Prisma.Decimal): Prisma.Decimal {
    //Prisma.Decimal.ROUND_HALF_UP equivale al modo de redondeo 1
    return quantity.mul(unitPrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }

  /**
   * Una orden solo puede moficarse si se encuentra en estado DRAFT
   */
  static canEdit(status: PurchaseOrderStatus): boolean {
    return status === PurchaseOrderStatus.DRAFT;
  }

  /**
   * Una orden solo puede confirmarse si se encuentra en estado DRAFT
   */
  static canConfirm(status: PurchaseOrderStatus): boolean {
    return status === PurchaseOrderStatus.DRAFT;
  }

  /**
   * Reglas de cancelación:
   * - Permitido en DRAFT
   * - Permitido en CONFIRMED si no tiene recepciones
   * - Prohibido en PARTIALLY_RECEIVED O RECEIVED porque implica reversar stock
   */
  static canCancel(status: PurchaseOrderStatus, hasReceipts: boolean): boolean {
    if (status === PurchaseOrderStatus.DRAFT) return true;
    if (status === PurchaseOrderStatus.CONFIRMED && !hasReceipts) return true;
    return false;
  }

  /**
   * Solo las órdenes CONFIRMED o PARTIALLY_RECEIVED pueden recibir materiales
   * Una orden DRAFT, RECEIVED o CANCELLED será rechazado
   */
  static canReceive(status: PurchaseOrderStatus): boolean {
    return (
      status === PurchaseOrderStatus.CONFIRMED || status === PurchaseOrderStatus.PARTIALLY_RECEIVED
    );
  }

  /**
   * Determina el nuevo estado de la orden basándose en las cantidades.
   * RECEIVED si quantityPending es 0, PARTIALLY_RECEIVED si aaún hay pendiente
   */
  static calculateStatusAfterReceipt(
    ordered: Prisma.Decimal,
    totalReceived: Prisma.Decimal,
  ): PurchaseOrderStatus {
    if (totalReceived.gte(ordered)) {
      return PurchaseOrderStatus.RECEIVED;
    }
    return PurchaseOrderStatus.PARTIALLY_RECEIVED;
  }

  /**
   * Previene la sobre-recepción asegurando que lo recibido no exceda lo ordenado original
   */
  static isOverReceipt(
    ordered: Prisma.Decimal,
    previouslyReceived: Prisma.Decimal,
    newQuantity: Prisma.Decimal,
  ): boolean {
    const totalAfterReceipt = previouslyReceived.plus(newQuantity);
    return totalAfterReceipt.gt(ordered);
  }
}
