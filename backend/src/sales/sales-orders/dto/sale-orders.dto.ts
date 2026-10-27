import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID, ValidateIf, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsPositiveDecimalString, IsPriceDecimalString } from '../../../common/decimal.dto.js';

export class SaleOrderItemDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() productId: string;
  @ApiProperty({ type: String, example: '12.5000' }) @IsPositiveDecimalString() quantity: string;
  @ApiProperty({ type: String, example: '25.0000' }) @IsPriceDecimalString() unitPrice: string;
}

export class CreateSaleOrderDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() customerId: string;
  @ApiProperty({ type: [SaleOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleOrderItemDto)
  items: SaleOrderItemDto[];
}

export class UpdateSaleOrderDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID()
  customerId?: string;
  @ApiPropertyOptional({ type: [SaleOrderItemDto] })
  @ValidateIf((_o: unknown, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleOrderItemDto)
  items?: SaleOrderItemDto[];
}
