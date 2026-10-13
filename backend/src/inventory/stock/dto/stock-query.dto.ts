import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsString, IsUUID, Length, ValidateIf } from 'class-validator';

import { RawValue, TrimText } from '../../../common/catalog.dto.js';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { ProductType } from '../../../generated/prisma/client.js';

export class StockQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por producto.' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID(undefined, { message: 'productId debe ser un UUID válido' })
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por almacén.' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID(undefined, { message: 'warehouseId debe ser un UUID válido' })
  warehouseId?: string;

  @ApiPropertyOptional({
    enum: ProductType,
    description: 'Filtra por tipo de producto.',
  })
  @RawValue()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(ProductType, { message: 'productType debe ser un tipo de producto válido' })
  productType?: ProductType;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 100,
    example: 'aceite',
    description: 'Busca por código o nombre de producto.',
  })
  @TrimText()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString({ message: 'search debe ser texto' })
  @Length(1, 100, { message: 'search debe tener entre 1 y 100 caracteres' })
  search?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Si es true, devuelve solo productos con existencia.',
  })
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const value = obj[key];

    if (value === 'true') return true;
    if (value === 'false') return false;

    return value;
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean({ message: 'hasStock debe ser true o false' })
  hasStock?: boolean;
}
