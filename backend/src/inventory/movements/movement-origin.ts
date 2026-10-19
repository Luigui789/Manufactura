import type { AdjustmentReason } from '../../generated/prisma/client.js';

/** Origen permitido por el esquema instalado durante A-1. */
export type MovementOrigin =
  | {
      kind: 'ADJUSTMENT';
      reason: AdjustmentReason;
    }
  | { kind: 'PURCHASE_RECEIPT'; purchaseReceiptItemId: string }
  | { kind: 'PRODUCTION_ORDER'; productionOrderId: string };
