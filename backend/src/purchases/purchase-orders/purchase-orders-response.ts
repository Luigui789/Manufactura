import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PurchaseOrderStatus } from '../../generated/prisma/client.js';

/**
 * DTO anidado para la información resumida del proveedor.
 */
export class PurchaseOrderSupplierResponse {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'PRV-001' })
  code: string;

  @ApiProperty({ example: 'Proveedor Aceites' })
  name: string;
}

/**
 * Estructura de respuesta para el endpoint de lista (GET /api/purchase-orders).
 */
export class PurchaseOrderListItemResponse {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'OC-2026-000001' })
  number: string;

  @ApiProperty({ type: PurchaseOrderSupplierResponse })
  supplier: PurchaseOrderSupplierResponse;

  @ApiProperty({ enum: PurchaseOrderStatus })
  status: PurchaseOrderStatus;

  @ApiProperty()
  orderedAt: Date;

  @ApiPropertyOptional()
  expectedDate?: Date | null;

  @ApiProperty({ description: 'Suma de los lineTotal', example: '2000.00' })
  total: string;

  @ApiProperty({ description: 'Cantidad de líneas de productos' })
  itemsCount: number;
}

/**
 * DTO anidado para el detalle de cada línea de la orden, mostrando el desglose
 * de cantidades según la regla de no almacenar quantityReceived en BD.
 */
export class PurchaseOrderItemDetailResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  productId: string;

  @ApiProperty()
  productCode: string;

  @ApiProperty()
  productName: string;

  @ApiProperty()
  productUnit: string;

  @ApiProperty({ example: '100.0000' })
  quantityOrdered: string;

  @ApiProperty({ description: 'Suma de las recepciones para esta línea', example: '40.0000' })
  quantityReceived: string;

  @ApiProperty({ description: 'quantityOrdered - quantityReceived', example: '60.0000' })
  quantityPending: string;

  @ApiProperty({ example: '10.5000' })
  unitPrice: string;

  @ApiProperty({ example: '1050.00' })
  lineTotal: string;
}

/**
 * Historial resumido de recepciones asociadas a la orden.
 */
export class PurchaseOrderReceiptSummaryResponse {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'REC-2026-000001' })
  number: string;

  @ApiProperty()
  receivedAt: Date;

  @ApiProperty()
  receivedByFullName: string;
}

/**
 * Estructura de respuesta para el endpoint de detalle (GET /api/purchase-orders/:id).
 */
export class PurchaseOrderDetailResponse {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'OC-2026-000001' })
  number: string;

  @ApiProperty({ type: PurchaseOrderSupplierResponse })
  supplier: PurchaseOrderSupplierResponse;

  @ApiProperty({ enum: PurchaseOrderStatus })
  status: PurchaseOrderStatus;

  @ApiProperty()
  orderedAt: Date;

  @ApiPropertyOptional()
  expectedDate?: Date | null;

  @ApiProperty({ example: '2000.00' })
  total: string;

  @ApiProperty({ type: [PurchaseOrderItemDetailResponse] })
  items: PurchaseOrderItemDetailResponse[];

  @ApiProperty({ type: [PurchaseOrderReceiptSummaryResponse] })
  receipts: PurchaseOrderReceiptSummaryResponse[];
}