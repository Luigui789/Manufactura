import { ApiProperty } from '@nestjs/swagger';
import { SaleOrderStatus } from '../../generated/prisma/client.js';
export class SaleOrderItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() productId: string;
  @ApiProperty() productCode: string;
  @ApiProperty() productName: string;
  @ApiProperty() productUnit: string;
  @ApiProperty() isLotTracked: boolean;
  @ApiProperty({ example: '12.5000' }) quantity: string;
  @ApiProperty({ example: '25.0000' }) unitPrice: string;
  @ApiProperty({ example: '312.50' }) lineTotal: string;
  @ApiProperty({ required: false, example: '50.0000' }) availableQuantity?: string;
}

export class SaleOrderResultDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'OV-2026-000001' }) number: string;
  @ApiProperty() customer: { id: string; code: string; name: string };
  @ApiProperty({ enum: SaleOrderStatus }) status: SaleOrderStatus;
  @ApiProperty() orderedAt: Date;
  @ApiProperty() total: string;
  @ApiProperty() itemsCount: number;
  @ApiProperty({ type: [SaleOrderItemResponseDto] }) items: SaleOrderItemResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class SaleOrderResponseDto {
  @ApiProperty({ type: SaleOrderResultDto }) data: SaleOrderResultDto;
  @ApiProperty() message: string;
}

export class SaleOrdersListResponseDto {
  @ApiProperty({ type: [SaleOrderResultDto] }) data: SaleOrderResultDto[];
  @ApiProperty({ example: { page: 1, limit: 20, total: 1 } }) meta: {
    page: number;
    limit: number;
    total: number;
  };
}
