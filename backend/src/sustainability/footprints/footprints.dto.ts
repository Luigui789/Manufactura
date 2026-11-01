import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, Length, Matches, ValidateIf } from 'class-validator';
import { RawValue, TrimText } from '../../common/catalog.dto.js';
import { PaginationQueryDto } from '../../common/pagination/pagination.js';
import { ACTIVITY_QUANTITY_PATTERN } from '../carbon-math.js';

const QUANTITY_MESSAGE =
  'quantity debe ser texto decimal mayor que cero con hasta 12 enteros y 8 decimales';

export class CreateManualActivityDto {
  @ApiProperty({ format: 'uuid', description: 'La unidad se toma del factor, nunca del cliente' })
  @RawValue()
  @IsUUID()
  emissionFactorId: string;

  @ApiProperty({ maxLength: 250, example: 'Electricidad del proceso' })
  @TrimText()
  @IsString()
  @Length(1, 250)
  description: string;

  @ApiProperty({ type: String, example: '8.50000000' })
  @RawValue()
  @IsString()
  @Matches(ACTIVITY_QUANTITY_PATTERN, { message: QUANTITY_MESSAGE })
  @Matches(/[1-9]/, { message: QUANTITY_MESSAGE })
  quantity: string;
}

export class UpdateManualActivityDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @RawValue()
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsUUID()
  emissionFactorId?: string;

  @ApiPropertyOptional({ maxLength: 250 })
  @TrimText()
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @Length(1, 250)
  description?: string;

  @ApiPropertyOptional({ type: String, example: '8.50000000' })
  @RawValue()
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @Matches(ACTIVITY_QUANTITY_PATTERN, { message: QUANTITY_MESSAGE })
  @Matches(/[1-9]/, { message: QUANTITY_MESSAGE })
  quantity?: string;
}

export class FinalizeFootprintDto {
  @ApiProperty({
    minLength: 10,
    maxLength: 2000,
    example:
      'Incluye materias primas consumidas, electricidad registrada manualmente, transporte de entrada y empaque. Excluye distribución, uso y fin de vida.',
  })
  @TrimText()
  @IsString()
  @Length(10, 2000, { message: 'boundaryNotes debe tener entre 10 y 2000 caracteres útiles' })
  boundaryNotes: string;
}

export const FOOTPRINT_FILTERS = ['NONE', 'DRAFT', 'FINALIZED'] as const;
export type FootprintFilter = (typeof FOOTPRINT_FILTERS)[number];

export class SustainabilityOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @TrimText()
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @Length(1, 100)
  search?: string;

  @ApiPropertyOptional({ enum: FOOTPRINT_FILTERS })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsIn(FOOTPRINT_FILTERS)
  footprintStatus?: FootprintFilter;
}
