import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsString, Length, ValidateIf } from 'class-validator';

import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { ProductType } from '../../../generated/prisma/client.js';
import { RawValue, TrimText } from '../../../common/catalog.dto.js';

export class ProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    description: 'Filtra por estado. Si se omite, incluye activos e inactivos.',
  })
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const value = obj[key];

    if (value === 'true') return true;
    if (value === 'false') return false;

    return value;
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean({ message: 'isActive debe ser true o false' })
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: ProductType,
    description: 'Filtra por tipo de producto.',
  })
  @RawValue()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(ProductType, { message: 'type debe ser un tipo de producto válido' })
  type?: ProductType;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 100,
    example: 'aceite',
    description: 'Busca por código o nombre sin distinguir mayúsculas y minúsculas.',
  })
  @TrimText()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString({ message: 'search debe ser texto' })
  @Length(1, 100, { message: 'search debe tener entre 1 y 100 caracteres' })
  search?: string;
}
