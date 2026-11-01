import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID, ValidateIf, ValidateNested } from 'class-validator';
import { IsPositiveDecimalString } from '../../../common/decimal.dto.js';

export class SaleDispatchLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  saleOrderItemId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  warehouseId: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsUUID()
  lotId?: string | null;

  @ApiProperty({ type: String, example: '2.5000' })
  @IsPositiveDecimalString()
  quantity: string;
}

export class CreateSaleDispatchDto {
  @ApiProperty({ type: [SaleDispatchLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleDispatchLineDto)
  items: SaleDispatchLineDto[];
}
