import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID, ValidateIf, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsPositiveDecimalString, IsPriceDecimalString } from '../../../common/decimal.dto.js';
import { IsCalendarDate } from '../../../common/date.dto.js';
export class PurchaseOrderItemDto {
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty({ type: String }) @IsPositiveDecimalString() quantity: string;
  @ApiProperty({ type: String }) @IsPriceDecimalString() unitPrice: string;
}
export class CreatePurchaseOrderDto {
  @ApiProperty() @IsUUID() supplierId: string;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsCalendarDate()
  expectedDate?: string | null;
  @ApiProperty({ type: [PurchaseOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];
}
