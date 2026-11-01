import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsString, IsUUID, Length, Matches, ValidateIf } from 'class-validator';
import { RawValue, TrimText, TrimUpperCase } from '../../common/catalog.dto.js';
import { PaginationQueryDto } from '../../common/pagination/pagination.js';
import { CarbonActivityUnit } from '../../generated/prisma/client.js';

export class CreateCircularMaterialDto {
  @ApiProperty({ format: 'uuid' })
  @RawValue()
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 'USED_COOKING_OIL_RECOVERED', maxLength: 80 })
  @TrimUpperCase()
  @IsString()
  @Length(1, 80)
  @Matches(/^[A-Z0-9][A-Z0-9_]*$/, { message: 'metricCode solo admite A-Z, 0-9 y _' })
  metricCode: string;

  @ApiProperty({ example: 'Aceite de cocina usado valorizado', maxLength: 150 })
  @TrimText()
  @IsString()
  @Length(1, 150)
  displayName: string;

  @ApiProperty({ enum: CarbonActivityUnit, example: 'LITER' })
  @RawValue()
  @IsEnum(CarbonActivityUnit)
  reportingUnit: CarbonActivityUnit;
}

/** El producto y el código de métrica identifican el indicador: no se editan. */
export class UpdateCircularMaterialDto extends PartialType(
  PickType(CreateCircularMaterialDto, ['displayName', 'reportingUnit'] as const),
) {}

export class CircularMaterialsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ type: Boolean })
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) =>
    obj[key] === 'true' ? true : obj[key] === 'false' ? false : obj[key],
  )
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
