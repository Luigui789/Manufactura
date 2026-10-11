import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsString, IsUUID, Length, Matches, ValidateIf } from 'class-validator';
import { RawValue, TrimText } from '../../../common/catalog.dto.js';
import { IsPositiveDecimalString } from '../../../common/decimal.dto.js';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { ProductionOrderStatus } from '../../../generated/prisma/client.js';

export class CreateProductionOrderDto {
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty() @IsUUID() bomVersionId: string;
  @ApiProperty() @IsUUID() warehouseId: string;
  @ApiProperty({ type: String, example: '100.0000' })
  @IsPositiveDecimalString()
  quantityPlanned: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @RawValue()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  plannedStartAt?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @RawValue()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  plannedEndAt?: string | null;
}

export class UpdateProductionOrderDto extends PartialType(CreateProductionOrderDto, {
  skipNullProperties: false,
}) {}

export class OrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProductionOrderStatus })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(ProductionOrderStatus)
  status?: ProductionOrderStatus;

  @ApiPropertyOptional()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional()
  @TrimText()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 100)
  search?: string;
}
