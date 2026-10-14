import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsUUID, ValidateIf } from 'class-validator';

import { RawValue } from '../../../common/catalog.dto.js';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { InventoryMovementType } from '../../../generated/prisma/client.js';

export class MovementsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID(undefined, { message: 'productId debe ser un UUID válido' })
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID(undefined, { message: 'warehouseId debe ser un UUID válido' })
  warehouseId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID(undefined, { message: 'lotId debe ser un UUID válido' })
  lotId?: string;

  @ApiPropertyOptional({ enum: InventoryMovementType })
  @RawValue()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(InventoryMovementType, { message: 'type debe ser un tipo de movimiento válido' })
  type?: InventoryMovementType;

  @ApiPropertyOptional({ format: 'date-time', description: 'Límite inclusivo del período.' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsDateString({}, { message: 'from debe ser una fecha ISO válida' })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Límite inclusivo del período.' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsDateString({}, { message: 'to debe ser una fecha ISO válida' })
  to?: string;
}
