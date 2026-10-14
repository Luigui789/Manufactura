import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsPositiveDecimalString } from '../../../common/decimal.dto.js';
import { IsCalendarDate, IsTimestamp } from '../../../common/date.dto.js';
import { TrimText } from '../../../common/catalog.dto.js';
export class ReceivePurchaseOrderItemDto {
  @ApiProperty() @IsUUID() purchaseOrderItemId: string;
  @ApiProperty() @IsUUID() warehouseId: string;
  @ApiProperty({ type: String }) @IsPositiveDecimalString() quantity: string;
  @ApiPropertyOptional({ type: String, format: 'date' })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsCalendarDate()
  expiresAt?: string;
}
export class ReceivePurchaseOrderDto {
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsTimestamp()
  receivedAt?: string;
  @ApiPropertyOptional()
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @TrimText()
  @IsString()
  @MaxLength(500)
  notes?: string;
  @ApiProperty({ type: [ReceivePurchaseOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderItemDto)
  items: ReceivePurchaseOrderItemDto[];
}
