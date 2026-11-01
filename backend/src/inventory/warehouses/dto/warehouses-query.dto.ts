import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsString, Length, ValidateIf } from 'class-validator';

import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { TrimText } from '../../../common/catalog.dto.js';

export class WarehousesQueryDto extends PaginationQueryDto {
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
    minLength: 1,
    maxLength: 100,
    example: 'central',
    description: 'Busca por código, nombre o ubicación sin distinguir mayúsculas y minúsculas.',
  })
  @TrimText()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString({ message: 'search debe ser texto' })
  @Length(1, 100, { message: 'search debe tener entre 1 y 100 caracteres' })
  search?: string;
}
