import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsString, IsUUID, Length, ValidateIf } from 'class-validator';

import { RawValue, TrimText } from '../../../common/catalog.dto.js';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { LotStatus } from '../../../generated/prisma/client.js';

export class LotsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID(undefined, { message: 'productId debe ser un UUID válido' })
  productId?: string;

  @ApiPropertyOptional({ enum: LotStatus })
  @RawValue()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(LotStatus, { message: 'status debe ser un estado de lote válido' })
  status?: LotStatus;

  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @TrimText()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString({ message: 'search debe ser texto' })
  @Length(1, 100, { message: 'search debe tener entre 1 y 100 caracteres' })
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID(undefined, { message: 'warehouseId debe ser un UUID válido' })
  warehouseId?: string;

  @ApiPropertyOptional({ type: Boolean })
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
